-- Drop the schema if it exists
DROP SCHEMA IF EXISTS npm_count CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Create the schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS npm_count;

-- Create the packages table to store package metadata
CREATE TABLE npm_count.npm_package (
    package_name text PRIMARY KEY,
    creation_date date NOT NULL,
    last_publish_date date NOT NULL,
    last_fetched_date date,
    is_active boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- Create the daily downloads table
CREATE TABLE npm_count.daily_downloads (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_name text NOT NULL,
    date date NOT NULL,
    download_count bigint NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_package_date UNIQUE (package_name, date),
    FOREIGN KEY (package_name) REFERENCES npm_count.npm_package(package_name)
);

-- Add categories table
CREATE TABLE IF NOT EXISTS npm_count.category (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text NOT NULL UNIQUE,
    description text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add package_category junction table
CREATE TABLE IF NOT EXISTS npm_count.package_category (
    package_id text REFERENCES npm_count.npm_package(package_name) ON DELETE CASCADE,
    category_id uuid REFERENCES npm_count.category(id) ON DELETE CASCADE,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (package_id, category_id)
);

-- Create trigger functions first
CREATE OR REPLACE FUNCTION npm_count.validate_download_date()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow downloads up to 7 days before creation date to handle npm data inconsistencies
    IF NEW.date < (
        SELECT creation_date - interval '7 days'
        FROM npm_count.npm_package 
        WHERE package_name = NEW.package_name
    ) THEN
        RAISE EXCEPTION 'Download date is too far before package creation date (7 day grace period)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION npm_count.set_id_from_pkg_date()
RETURNS trigger AS $$
BEGIN
    NEW.id := uuid_generate_v5(
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8', 
        NEW.package_name || NEW.date::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION npm_count.update_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER validate_download_date
    BEFORE INSERT OR UPDATE ON npm_count.daily_downloads
    FOR EACH ROW
    EXECUTE FUNCTION npm_count.validate_download_date();

CREATE TRIGGER before_insert_daily_downloads
    BEFORE INSERT ON npm_count.daily_downloads
    FOR EACH ROW
    EXECUTE FUNCTION npm_count.set_id_from_pkg_date();

CREATE TRIGGER update_npm_package_timestamp
    BEFORE UPDATE ON npm_count.npm_package
    FOR EACH ROW
    EXECUTE FUNCTION npm_count.update_updated_at();

-- Create indexes for performance
CREATE INDEX idx_daily_downloads_package_name 
    ON npm_count.daily_downloads(package_name);

CREATE INDEX idx_daily_downloads_date 
    ON npm_count.daily_downloads(date);

CREATE INDEX idx_daily_downloads_package_date 
    ON npm_count.daily_downloads(package_name, date);

CREATE INDEX idx_daily_downloads_package_date_range
    ON npm_count.daily_downloads(package_name, date DESC);

CREATE INDEX IF NOT EXISTS idx_npm_package_tags ON npm_count.npm_package USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_package_category_package ON npm_count.package_category(package_id);

CREATE INDEX IF NOT EXISTS idx_package_category_category ON npm_count.package_category(category_id);

-- Add statistics gathering
COMMENT ON TABLE npm_count.daily_downloads IS 'Daily download statistics for npm packages';
COMMENT ON TABLE npm_count.npm_package IS 'NPM package metadata and tracking information';

-- Create view for missing dates
CREATE OR REPLACE VIEW npm_count.missing_download_dates AS
WITH RECURSIVE date_series AS (
    SELECT 
        p.package_name,
        p.creation_date::date as start_date,
        COALESCE(p.last_fetched_date, CURRENT_DATE)::date as end_date
    FROM npm_count.npm_package p
    WHERE p.is_active = true
),
all_dates AS (
    SELECT 
        package_name,
        start_date::date as date
    FROM date_series
    UNION ALL
    SELECT 
        package_name,
        (date + interval '1 day')::date
    FROM all_dates a
    WHERE date < (
        SELECT end_date 
        FROM date_series d 
        WHERE d.package_name = a.package_name
    )
)
SELECT 
    a.package_name,
    a.date as missing_date
FROM all_dates a
LEFT JOIN npm_count.daily_downloads d 
    ON a.package_name = d.package_name 
    AND a.date = d.date
WHERE d.package_name IS NULL
AND a.date <= CURRENT_DATE;

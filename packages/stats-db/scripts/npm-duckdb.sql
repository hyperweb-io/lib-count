-- DuckDB version of npm schema
-- Note: DuckDB doesn't need extensions for UUID - it has built-in UUID support

-- Drop the schema if it exists
DROP SCHEMA IF EXISTS npm_count;

-- Create the schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS npm_count;

-- Create the packages table to store package metadata
CREATE TABLE npm_count.npm_package (
    package_name TEXT PRIMARY KEY,
    creation_date DATE NOT NULL,
    last_publish_date DATE NOT NULL,
    last_fetched_date DATE,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create the daily downloads table
CREATE TABLE npm_count.daily_downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_name TEXT NOT NULL,
    date DATE NOT NULL,
    download_count BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_package_date UNIQUE (package_name, date),
    FOREIGN KEY (package_name) REFERENCES npm_count.npm_package(package_name)
);

-- Add categories table
CREATE TABLE IF NOT EXISTS npm_count.category (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add package_category junction table
CREATE TABLE IF NOT EXISTS npm_count.package_category (
    package_id TEXT REFERENCES npm_count.npm_package(package_name) ON DELETE CASCADE,
    category_id UUID REFERENCES npm_count.category(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (package_id, category_id)
);

-- Note: DuckDB doesn't support PL/pgSQL triggers
-- The validation logic from PostgreSQL triggers would need to be handled in application code
-- or using CHECK constraints where possible

-- Add check constraint for download date validation (simplified version)
-- The original trigger had more complex logic that would need to be in application code
ALTER TABLE npm_count.daily_downloads 
ADD CONSTRAINT check_download_date 
CHECK (date >= '2010-01-01'::DATE); -- Simple validation, more complex logic in app

-- Note: The original set_id_from_pkg_date trigger would need to be handled differently
-- since DuckDB doesn't support the same trigger functionality
-- We can use a deterministic UUID generation in application code instead

-- Create indexes for performance
CREATE INDEX idx_daily_downloads_package_name 
    ON npm_count.daily_downloads(package_name);

CREATE INDEX idx_daily_downloads_date 
    ON npm_count.daily_downloads(date);

CREATE INDEX idx_daily_downloads_package_date 
    ON npm_count.daily_downloads(package_name, date);

CREATE INDEX idx_daily_downloads_package_date_range
    ON npm_count.daily_downloads(package_name, date DESC);

-- Note: DuckDB doesn't support GIN indexes like PostgreSQL
-- We'll create regular indexes for tag searches if needed
-- CREATE INDEX IF NOT EXISTS idx_npm_package_tags ON npm_count.npm_package USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_package_category_package ON npm_count.package_category(package_id);

CREATE INDEX IF NOT EXISTS idx_package_category_category ON npm_count.package_category(category_id);

-- Add statistics gathering
COMMENT ON TABLE npm_count.daily_downloads IS 'Daily download statistics for npm packages';
COMMENT ON TABLE npm_count.npm_package IS 'NPM package metadata and tracking information';

-- Create view for missing dates - DuckDB syntax
CREATE OR REPLACE VIEW npm_count.missing_download_dates AS
WITH RECURSIVE date_series AS (
    SELECT 
        p.package_name,
        p.creation_date::DATE as start_date,
        COALESCE(p.last_fetched_date, CURRENT_DATE)::DATE as end_date
    FROM npm_count.npm_package p
    WHERE p.is_active = true
),
all_dates AS (
    SELECT 
        package_name,
        start_date::DATE as date
    FROM date_series
    UNION ALL
    SELECT 
        package_name,
        (date + INTERVAL '1 day')::DATE
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
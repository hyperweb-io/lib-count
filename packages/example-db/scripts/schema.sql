-- Drop the schema if it exists
DROP SCHEMA IF EXISTS npm_count CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Create the schema if it doesn't exist.
CREATE SCHEMA IF NOT EXISTS npm_count;

-- Create the table within the npm_count schema.
CREATE TABLE npm_count.npm_download_count (
    package_name text NOT NULL,
    date date NOT NULL,
    download_count bigint NOT NULL,
    id uuid PRIMARY KEY  -- using uuid type for id
);

-- Enforce a unique constraint on (package_name, date) to avoid duplicate records.
ALTER TABLE npm_count.npm_download_count 
ADD CONSTRAINT unique_package_date UNIQUE (package_name, date);

-- Create the trigger function in the npm_count schema.
-- This function sets the id using uuid_generate_v5 with a fixed namespace.
CREATE OR REPLACE FUNCTION npm_count.set_id_from_pkg_date()
RETURNS trigger AS $$
BEGIN
    -- Generate a deterministic UUID based on the package_name and date.
    -- The namespace '6ba7b810-9dad-11d1-80b4-00c04fd430c8' is the DNS namespace.
    NEW.id := uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', NEW.package_name || NEW.date::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically set the id before inserting a new record.
CREATE TRIGGER before_insert_npm_download_count
BEFORE INSERT ON npm_count.npm_download_count
FOR EACH ROW
EXECUTE FUNCTION npm_count.set_id_from_pkg_date();

-- Create additional indexes for performance.

-- Index on package_name to speed up queries filtering by this column.
CREATE INDEX idx_npm_download_count_package_name 
    ON npm_count.npm_download_count(package_name);

-- Index on date for queries filtering by date.
CREATE INDEX idx_npm_download_count_date 
    ON npm_count.npm_download_count(date);

-- Composite index on (package_name, date) if queries often filter on both columns.
CREATE INDEX idx_npm_download_count_package_date 
    ON npm_count.npm_download_count(package_name, date);
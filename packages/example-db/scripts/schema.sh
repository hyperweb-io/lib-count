#!/bin/bash

# Set PostgreSQL credentials and database URL
export DB_NAME="example_db"
export DB_USER="postgres" 
export DB_PASSWORD="password"
export DB_HOST="localhost"
export DB_PORT="5432"
export DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"

# Export PGPASSWORD for psql
export PGPASSWORD="$DB_PASSWORD"

# Path to the schema files
NPM_SCHEMA="scripts/npm.sql"
GITHUB_SCHEMA="scripts/github.sql"

# Export DATABASE_URL
export DATABASE_URL

# Inform the user about the DATABASE_URL
echo "DATABASE_URL is set to $DATABASE_URL"

Drop the database if it exists
echo "Dropping database $DB_NAME (if it exists)..."
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -c "DROP DATABASE IF EXISTS $DB_NAME;"

Create a new database
echo "Creating database $DB_NAME..."
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -c "CREATE DATABASE $DB_NAME;"

# # Run the schema files to set up the database
echo "Applying NPM schema from $NPM_SCHEMA..."
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -f "$NPM_SCHEMA"

echo "Applying GitHub schema from $GITHUB_SCHEMA..."
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -f "$GITHUB_SCHEMA"

echo "Schema applied successfully!"

# Unset password after we're done
unset PGPASSWORD

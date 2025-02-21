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

# Path to the GitHub schema file
GITHUB_SCHEMA="scripts/github.sql"

# Export DATABASE_URL
export DATABASE_URL

# Inform the user about the DATABASE_URL
echo "DATABASE_URL is set to $DATABASE_URL"

# Drop only GitHub schema if it exists
echo "Dropping GitHub schema (if it exists)..."
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "DROP SCHEMA IF EXISTS github CASCADE;"

# Apply GitHub schema
echo "Applying GitHub schema from $GITHUB_SCHEMA..."
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -f "$GITHUB_SCHEMA"

echo "GitHub schema applied successfully!"

# Unset password after we're done
unset PGPASSWORD

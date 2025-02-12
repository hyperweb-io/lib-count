#!/bin/bash

# Set PostgreSQL credentials and database URL
DB_NAME="example_db"
DB_USER="postgres"
DB_PASSWORD="password"
DB_HOST="localhost"
DB_PORT="5432"
DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/postgres"

# Export DATABASE_URL
export DATABASE_URL

# Path to the schema file
SCHEMA_FILE="scripts/schema.sql"

# Inform the user about the DATABASE_URL
echo "DATABASE_URL is set to $DATABASE_URL"

# Drop the database if it exists
echo "Dropping database $DB_NAME (if it exists)..."
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -c "DROP DATABASE IF EXISTS $DB_NAME;"

# Create a new database
echo "Creating database $DB_NAME..."
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -c "CREATE DATABASE $DB_NAME;"

# Run the schema file to set up the database
echo "Applying schema from $SCHEMA_FILE..."
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -f "$SCHEMA_FILE"

echo "Schema applied successfully!"

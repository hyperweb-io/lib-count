#!/bin/bash

# Function to print usage
print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Manages database schemas for the example_db database"
    echo
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -s, --schema   Specify schema to reset (npm or github)"
    echo "                 If not specified, resets all schemas"
    echo
    echo "Examples:"
    echo "  $0             Reset all schemas"
    echo "  $0 -s npm      Reset only npm schema"
    echo "  $0 -s github   Reset only github schema"
}

# Parse command line arguments
SCHEMA=""
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            print_usage
            exit 0
            ;;
        -s|--schema)
            SCHEMA="$2"
            if [[ ! "$SCHEMA" =~ ^(npm|github)$ ]]; then
                echo "Error: Invalid schema specified. Must be 'npm' or 'github'"
                print_usage
                exit 1
            fi
            shift 2
            ;;
        *)
            echo "Error: Unknown option $1"
            print_usage
            exit 1
            ;;
    esac
done

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

# Function to check if file exists
check_file() {
    if [ ! -f "$1" ]; then
        echo "Error: Schema file $1 not found"
        exit 1
    fi
}

# Function to drop schema
drop_schema() {
    local schema_name=$1
    echo "Dropping schema ${schema_name}_count if exists..."
    psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "DROP SCHEMA IF EXISTS ${schema_name}_count CASCADE;"
}

# Function to apply schema
apply_schema() {
    local schema_file=$1
    local schema_name=$2
    
    # Drop the schema first
    drop_schema "$schema_name"
    
    echo "Applying ${schema_name} schema from $schema_file..."
    if psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -f "$schema_file"; then
        echo "${schema_name} schema applied successfully"
    else
        echo "Error applying ${schema_name} schema"
        exit 1
    fi
}

# Inform the user about the DATABASE_URL
echo "DATABASE_URL is set to $DATABASE_URL"

# Check if database exists
if ! psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo "Creating database $DB_NAME..."
    psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -c "CREATE DATABASE $DB_NAME;"
fi

# Handle schema application based on input
if [ -z "$SCHEMA" ]; then
    # Reset all schemas
    echo "Resetting all schemas..."
    check_file "$NPM_SCHEMA"
    check_file "$GITHUB_SCHEMA"
    
    apply_schema "$NPM_SCHEMA" "npm_count"
    apply_schema "$GITHUB_SCHEMA" "github"
else
    # Reset specific schema
    case "$SCHEMA" in
        npm)
            check_file "$NPM_SCHEMA"
            apply_schema "$NPM_SCHEMA" "npm_count"
            ;;
        github)
            check_file "$GITHUB_SCHEMA"
            apply_schema "$GITHUB_SCHEMA" "github"
            ;;
    esac
fi

echo "Schema operations completed successfully!"

# Unset password after we're done
unset PGPASSWORD

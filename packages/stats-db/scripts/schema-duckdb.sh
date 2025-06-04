#!/bin/bash

# Function to print usage
print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Manages database schemas for the DuckDB database"
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

# Set DuckDB database configuration
export DB_NAME="example_db.duckdb"
export DB_PATH="./data/${DB_NAME}"

# Create data directory if it doesn't exist
mkdir -p "./data"

# Path to the schema files
NPM_SCHEMA="scripts/npm-duckdb.sql"
GITHUB_SCHEMA="scripts/github-duckdb.sql"

# Function to check if file exists
check_file() {
    if [ ! -f "$1" ]; then
        echo "Error: Schema file $1 not found"
        exit 1
    fi
}

# Function to apply schema (dropping is handled in the SQL files themselves)
apply_schema() {
    local schema_file=$1
    local schema_name=$2
    
    echo "Applying ${schema_name} schema from $schema_file..."
    if duckdb "$DB_PATH" ".read $schema_file"; then
        echo "${schema_name} schema applied successfully"
    else
        echo "Error applying ${schema_name} schema"
        exit 1
    fi
}

# Inform the user about the database path
echo "DuckDB database path: $DB_PATH"

# Check if duckdb command is available
if ! command -v duckdb &> /dev/null; then
    echo "Error: duckdb command not found. Please install DuckDB CLI."
    echo "Visit: https://duckdb.org/docs/installation"
    exit 1
fi

# Create database file if it doesn't exist (DuckDB will create it automatically)
if [ ! -f "$DB_PATH" ]; then
    echo "Creating DuckDB database at $DB_PATH..."
    duckdb "$DB_PATH" "SELECT 1;" > /dev/null
fi

# Handle schema application based on input
if [ -z "$SCHEMA" ]; then
    # Reset all schemas
    echo "Resetting all schemas..."
    check_file "$NPM_SCHEMA"
    check_file "$GITHUB_SCHEMA"
    
    apply_schema "$NPM_SCHEMA" "npm"
    apply_schema "$GITHUB_SCHEMA" "github"
else
    # Reset specific schema
    case "$SCHEMA" in
        npm)
            check_file "$NPM_SCHEMA"
            apply_schema "$NPM_SCHEMA" "npm"
            ;;
        github)
            check_file "$GITHUB_SCHEMA"
            apply_schema "$GITHUB_SCHEMA" "github"
            ;;
    esac
fi

echo "Schema operations completed successfully!"

# Show schema information
echo ""
echo "Available schemas:"
duckdb "$DB_PATH" "SHOW SCHEMAS;"

echo ""
echo "Tables in schemas:"
duckdb "$DB_PATH" "SHOW ALL TABLES;" 
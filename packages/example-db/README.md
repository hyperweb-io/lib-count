## Database Schema Management

### Load Schema

You can manage database schemas using the schema.sh script. The script supports both resetting all schemas and individual schema management.

```sh
# Set PostgreSQL environment variables
export PGUSER="postgres"
export PGPASSWORD="password"
export PGHOST="localhost"
export PGPORT="5432"

# Reset all schemas (npm_count and github)
./scripts/schema.sh 

# Reset only npm_count schema
./scripts/schema.sh -s npm

# Reset only github schema
./scripts/schema.sh -s github

# Show help and usage information
./scripts/schema.sh --help
```

### Schema CLI Options

```
Usage: ./scripts/schema.sh [OPTIONS]
Manages database schemas for the example_db database

Options:
  -h, --help     Show this help message
  -s, --schema   Specify schema to reset (npm or github)
                 If not specified, resets all schemas

Examples:
  ./scripts/schema.sh             Reset all schemas
  ./scripts/schema.sh -s npm      Reset only npm schema
  ./scripts/schema.sh -s github   Reset only github schema
```

## Run Application

```sh
yarn dev
```

## Data Indexing

To improve query performance, you can run the following data indexing commands using npm scripts. These commands will create indexes on various tables to optimize search and retrieval operations.

### Running Indexing Commands

You can use the following npm scripts to manage your database and run indexing commands:

- **Fetch Packages**: Fetch package data from npm.
  ```sh
  yarn fetch:packages
  ```

- **Fetch Downloads**: Fetch download statistics.
  ```sh
  yarn fetch:downloads
  ```

- **Reset Downloads**: Reset download statistics.
  ```sh
  yarn fetch:downloads:reset
  ```

- **Generate Report**: Generate a report based on the fetched data.
  ```sh
  yarn generate:report
  ```

- **Database Dump**: Create a dump of the current database state.
  ```sh
  yarn db:dump
  ```

### Initial Setup Order

To index from scratch, follow these steps in order:

1. Make sure you have run migrations and the database is up to date:
   ```sh
   ./scripts/schema.sh
   ```

2. Fetch and index the data:
   ```sh
   yarn fetch:packages
   yarn fetch:downloads:reset
   yarn generate:report
   ```


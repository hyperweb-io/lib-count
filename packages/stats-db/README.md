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
   yarn npm:fetch:packages && yarn npm:fetch:downloads
   ```

3. Run reports/badges generation scripts:

   ```sh
   yarn npm:report && yarn npm:badges && yarn npm:readme
   ```

# GitHub Analytics

## **Project Overview**

A TypeScript-based tool for collecting GitHub ecosystem data to map contributor networks and organizational relationships within the Cosmos blockchain ecosystem.

## **Data Collection Requirements**

### **1. Repository Collection**

- **Target Organizations**: `hyperweb-io` and `launchql`
- **Repository Filter**: Collect only non-fork repositories from each organization
- **Repository Data**:
  - Repository ID, name, and full name
  - HTML URL and privacy status
  - Fork status (to enable filtering)

### **2. Contributor Collection**

- **Scope**: All contributors to all non-fork repositories collected in step 1
- **Contributor Data**:
  - GitHub username (login)
  - User ID
  - Contribution count per repository
  - Total contributions across all repositories

### **3. Organization Network Discovery**

- **Scope**: All public organizations that any contributor (from step 2) belongs to
- **Organization Data**:
  - Organization login/name
  - Organization API URL
  - Unique organization list (deduplicated across all contributors)

### **Data Collection Flow**

1. Fetch all repositories from `hyperweb-io` and `launchql` organizations
2. Filter out forked repositories, keeping only original repositories
3. For each non-fork repository, fetch complete contributor list
4. For each unique contributor discovered, fetch their public organization memberships
5. Aggregate and deduplicate all discovered organizations

### **Output Requirements**

- **Non-fork repositories**: Organized by parent organization
- **Contributor profiles**: Including cross-repository contribution mapping
- **Organization network**: Complete deduplicated list of all public organizations discovered through contributor analysis

This data collection strategy enables comprehensive ecosystem analysis by mapping the full network of organizations connected through shared contributors in the target GitHub organizations.

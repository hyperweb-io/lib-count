## load schema


```sh
export PGUSER="postgres"
export PGPASSWORD="password"
export PGHOST="localhost"
export PGPORT="5432"

./scripts/schema.sh 
```

## run it!

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

Ordering to index from scratch:

Make sure you have ran migrations and the database is up to date.

1. `yarn fetch:packages`
2. `yarn fetch:downloads:reset`
3. `yarn generate:report`

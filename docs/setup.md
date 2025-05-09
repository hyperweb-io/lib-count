# lib-count

## Initialize repository with Yarn 1

This project uses Yarn 1 for dependency management and follows a monorepo structure. Follow these steps to initialize the repository:

```sh
# Install Yarn 1 globally if you don't have it yet
npm install -g yarn

# Clone the repository (if you haven't already)
git clone https://github.com/your-org/lib-count.git
cd lib-count

# Install all dependencies across packages
yarn install

# Build all packages
yarn build
```

Make sure you're using Yarn 1 and not Yarn 2+ (Berry). You can check your Yarn version with:

```sh
yarn --version
```

### Workspace Structure

This monorepo contains multiple packages:

- `packages/stats-db`: Statistic database
- `packages/client`: Database client

To work on a specific package:

```sh
# Navigate to a specific package
cd packages/stats-db

# Install dependencies for just this package
yarn install

# Build just this package
yarn build
```

### Environment Setup

Create a `.env` file in the root of the package you're working with:

```sh
# File: packages/contributions-db/.env
DB_NAME=example_db
DB_USER=postgres
DB_PASSWORD=password
DB_HOST=localhost
DB_PORT=5432
DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# AWS configuration for S3 uploads (if needed)
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket-name
```

## Docker Setup

This project includes a Docker Compose configuration to help you quickly set up a PostgreSQL database with PostGIS extensions for spatial data.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Running the Database Container

Start the PostgreSQL container:

```sh
# Start PostgreSQL container in the background
docker-compose up -d

# Check if the container is running
docker-compose ps
```

### Database Connection Details

The PostgreSQL container will be accessible with these credentials:

- **Host**: localhost
- **Port**: 5432
- **User**: postgres
- **Password**: password
- **Connection URL**: postgres://postgres:password@localhost:5432/example_db

These details match the environment variables in the `.env` file example above.

### Managing the Container

```sh
# Stop the PostgreSQL container
docker-compose stop

# Stop and remove the container
docker-compose down

# View container logs
docker-compose logs postgres
```

## see example in packages

```sh
cd ./packages/example
```

## load schema

The schema script provides options to reset all schemas or reset specific schemas as needed:

```sh
# Set PostgreSQL connection parameters
export DB_NAME="example_db"
export DB_USER="postgres"
export DB_PASSWORD="password"
export DB_HOST="localhost"
export DB_PORT="5432"
export DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"

# Reset all schemas (npm and github)
./scripts/schema.sh

# Reset only npm schema
./scripts/schema.sh -s npm

# Reset only github schema
./scripts/schema.sh -s github

# Show help and available options
./scripts/schema.sh -h
```

## run it!

```sh
yarn dev
```

## Database Backup and Restore

To create a database dump and upload it to S3:

```sh
# Create dump only (no S3 upload)
yarn dump --no-upload

# Create dump and upload to S3
yarn dump

# Specify a custom S3 bucket
yarn dump my-custom-bucket
```

The backup file will be stored in the `exports` directory with a timestamp.

# Database Schema Management

## **Project Overview**

This project is a TypeScript-based tool for collecting and analyzing NPM download statistics and GitHub ecosystem data. It uses Drizzle ORM with a local SQLite database, making it easy to set up and run without external dependencies like Docker.

## **Getting Started**

Follow these instructions to get the project running on your local machine.

### **Prerequisites**

- [Node.js](https://nodejs.org/) (v22 or higher)
- [Yarn](https://yarnpkg.com/) (v1.22 or higher)

### **1. Installation**

First, clone the repository and install the dependencies using Yarn:

```sh
git clone <repository-url>
cd <repository-name>
yarn install
```

### **2. Database Setup**

This project uses SQLite, so no external database server is required. The database schema is managed by Drizzle ORM.

To set up your database for the first time, you need to generate and then apply the database migrations.

1.  **Generate Migrations**: This will create migration files in the `drizzle` directory based on your schema.

    ```sh
    yarn db:generate
    ```

2.  **Apply Migrations**: This will run the migrations to create the `sqlite.db` file and set up the necessary tables.
    ```sh
    yarn db:migrate
    ```

### **3. Running Data Scripts**

After setting up the database, you can start fetching and processing data.

- **Fetch Packages**: Fetches package metadata from the NPM registry and populates the `npm_package` table.

  ```sh
  yarn npm:fetch:packages
  ```

- **Fetch Downloads**: Fetches daily download counts for all tracked packages.

  ```sh
  yarn npm:fetch:downloads
  ```

- **Generate Reports & Badges**: Once the data is fetched, you can generate reports and badges.
  ```sh
  yarn npm:report
  yarn npm:badges
  ```

### **Initial Setup Order**

To set up and populate the database from scratch, run these commands in order:

1.  **Generate and Run Migrations**:
    ```sh
    yarn db:generate
    yarn db:migrate
    ```
2.  **Fetch Data**:
    ```sh
    yarn npm:fetch:packages && yarn npm:fetch:downloads
    ```
3.  **Generate Outputs**:
    ```sh
    yarn npm:report && yarn npm:badges
    ```

## GitHub Analytics

### **Project Overview**

A TypeScript-based tool for collecting GitHub ecosystem data to map contributor networks and organizational relationships within the Cosmos blockchain ecosystem.

### **Data Collection Requirements**

#### **1. Repository Collection**

- **Target Organizations**: `hyperweb-io` and `launchql`
- **Repository Filter**: Collect only non-fork repositories from each organization
- **Repository Data**:
  - Repository ID, name, and full name
  - HTML URL and privacy status
  - Fork status (to enable filtering)

#### **2. Contributor Collection**

- **Scope**: All contributors to all non-fork repositories collected in step 1
- **Contributor Data**:
  - GitHub username (login)
  - User ID
  - Contribution count per repository
  - Total contributions across all repositories

#### **3. Organization Network Discovery**

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

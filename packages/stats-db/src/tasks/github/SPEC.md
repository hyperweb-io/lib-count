# GitHub Analytics Data Collector - Project Specification

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

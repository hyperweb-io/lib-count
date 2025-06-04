# DuckDB Migration Guide

## Overview

This guide covers the migration from PostgreSQL to DuckDB for the stats-db package. The migration maintains the same developer experience while adapting to DuckDB's file-based architecture.

## Architecture Differences

### PostgreSQL (Client/Server)

- Requires PostgreSQL server installation and management
- Uses network connections with authentication
- Separate database server process
- Traditional RDBMS with full ACID compliance
- Supports complex triggers, stored procedures, extensions

### DuckDB (Embedded/File-based)

- Single file database (no server required)
- Direct file access (no network layer)
- Embedded in-process database
- Optimized for analytical workloads (OLAP)
- Simpler feature set focused on performance

## Migration Strategy

### 1. Schema Compatibility

| Feature               | PostgreSQL                         | DuckDB                  | Migration Strategy            |
| --------------------- | ---------------------------------- | ----------------------- | ----------------------------- |
| **Extensions**        | `uuid-ossp`, `btree_gist`          | Built-in support        | Remove extension dependencies |
| **UUID Generation**   | `uuid_generate_v4()`               | `gen_random_uuid()`     | Replace function calls        |
| **Triggers**          | PL/pgSQL triggers                  | Not supported           | Move logic to application     |
| **Stored Procedures** | PL/pgSQL functions                 | Limited macro support   | Convert to functions/macros   |
| **Indexes**           | Full index types (GIN, GIST, etc.) | Standard B-tree indexes | Simplify index definitions    |
| **Schemas**           | PostgreSQL schemas                 | DuckDB schemas          | Direct mapping                |

### 2. Data Type Mapping

| PostgreSQL                 | DuckDB        | Notes             |
| -------------------------- | ------------- | ----------------- |
| `UUID`                     | `UUID`        | ✅ Direct mapping |
| `BIGINT`                   | `BIGINT`      | ✅ Direct mapping |
| `TEXT`                     | `TEXT`        | ✅ Direct mapping |
| `BOOLEAN`                  | `BOOLEAN`     | ✅ Direct mapping |
| `TIMESTAMP WITH TIME ZONE` | `TIMESTAMPTZ` | ✅ Direct mapping |
| `DATE`                     | `DATE`        | ✅ Direct mapping |
| `INTEGER`                  | `INTEGER`     | ✅ Direct mapping |

### 3. SQL Syntax Differences

#### UUID Generation

```sql
-- PostgreSQL
DEFAULT uuid_generate_v4()

-- DuckDB
DEFAULT gen_random_uuid()
```

#### Schema Dropping

```sql
-- PostgreSQL
DROP SCHEMA IF EXISTS schema_name CASCADE;

-- DuckDB
DROP SCHEMA IF EXISTS schema_name;
```

#### Triggers (Not Supported in DuckDB)

```sql
-- PostgreSQL (not migrated)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- DuckDB: Handle in application code
-- Update timestamps when updating records in your application
```

## Files Created/Modified

### New DuckDB Files

- `scripts/github-duckdb.sql` - DuckDB version of GitHub schema
- `scripts/npm-duckdb.sql` - DuckDB version of npm schema
- `scripts/schema-duckdb.sh` - DuckDB schema management script
- `scripts/test-duckdb-schemas.js` - Validation test script

### Documentation Updates

- `README.md` - Added DuckDB migration section
- `DUCKDB_MIGRATION.md` - This comprehensive guide

## Developer Experience Maintained

### Same Command Interface

```bash
# PostgreSQL
./scripts/schema.sh              # Reset all schemas
./scripts/schema.sh -s npm       # Reset npm schema
./scripts/schema.sh -s github    # Reset github schema

# DuckDB (identical interface)
./scripts/schema-duckdb.sh          # Reset all schemas
./scripts/schema-duckdb.sh -s npm   # Reset npm schema
./scripts/schema-duckdb.sh -s github # Reset github schema
```

### Same Schema Structure

All table names, column names, and relationships remain identical between PostgreSQL and DuckDB versions.

## Installation & Setup

### 1. Install DuckDB CLI

```bash
# macOS
brew install duckdb

# Windows
winget install DuckDB.cli

# Linux
# Download from https://duckdb.org/docs/installation
```

### 2. Run Migration

```bash
cd packages/stats-db

# Test DuckDB schemas work
node scripts/test-duckdb-schemas.js

# Apply schemas
./scripts/schema-duckdb.sh
```

### 3. Database Location

- **PostgreSQL**: Network connection to server
- **DuckDB**: Local file at `./data/example_db.duckdb`

## Application Code Changes Required

### 1. Connection String

```javascript
// PostgreSQL
const connectionString = "postgres://user:pass@host:port/db";

// DuckDB
const databasePath = "./data/example_db.duckdb";
```

### 2. Timestamp Updates

Since DuckDB doesn't support triggers, handle `updated_at` in application:

```javascript
// When updating records, explicitly set updated_at
await db.query(
  `
  UPDATE npm_count.npm_package 
  SET last_fetched_date = ?, updated_at = CURRENT_TIMESTAMP 
  WHERE package_name = ?
`,
  [date, packageName]
);
```

### 3. UUID Generation

For deterministic UUIDs (if needed), handle in application:

```javascript
// Instead of relying on triggers for deterministic UUIDs
const deterministicId = generateDeterministicUUID(packageName, date);
```

## Testing

Run the validation test to ensure schemas work correctly:

```bash
node scripts/test-duckdb-schemas.js
```

The test validates:

- ✅ Schema creation
- ✅ UUID generation
- ✅ Basic CRUD operations
- ✅ Foreign key relationships
- ✅ Index creation
- ✅ Function/macro execution

## Performance Considerations

### DuckDB Advantages

- **Faster analytical queries** - Columnar storage optimized for aggregations
- **No network overhead** - Direct file access
- **Simpler deployment** - Single file, no server management
- **Better for read-heavy workloads** - Excellent query performance

### DuckDB Limitations

- **Single writer** - Only one process can write at a time
- **Limited concurrency** - Not ideal for high-concurrency OLTP
- **No advanced triggers** - Business logic must be in application
- **Simpler feature set** - Fewer database-level features than PostgreSQL

## When to Use Each

### Use PostgreSQL When:

- Multiple concurrent writers needed
- Complex triggers and stored procedures required
- Traditional OLTP workload
- Network-based multi-user access
- Full PostgreSQL ecosystem features needed

### Use DuckDB When:

- Analytical/reporting workloads
- Single application accessing database
- Embedded use cases
- Development and testing
- ETL and data processing
- Simplified deployment requirements

## Rollback Strategy

If you need to return to PostgreSQL:

1. **Data Export**: Use DuckDB's `EXPORT DATABASE` to export all data
2. **Schema Restore**: Run original `./scripts/schema.sh`
3. **Data Import**: Import exported data back to PostgreSQL
4. **Application Update**: Switch connection back to PostgreSQL

## Next Steps

1. ✅ Install DuckDB CLI
2. ✅ Run test script to validate schemas
3. ✅ Apply DuckDB schemas using `schema-duckdb.sh`
4. 🔄 Update application code to use DuckDB client
5. 🔄 Handle timestamp updates in application code
6. 🔄 Test all application functionality with DuckDB
7. 🔄 Update CI/CD pipelines if needed

## Support

For questions about this migration:

- Check DuckDB documentation: https://duckdb.org/docs/
- Review test script output for validation results
- Compare PostgreSQL vs DuckDB schema files for specific differences

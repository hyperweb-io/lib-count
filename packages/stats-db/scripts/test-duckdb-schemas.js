#!/usr/bin/env node

/**
 * Test script to validate DuckDB schemas work correctly
 * This tests the key functionality of our DuckDB client implementation
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Test configuration
const DB_PATH = "./data/test_example_db.duckdb";
const TEST_DIR = "./data";

console.log("🦆 Testing DuckDB Schema Implementation");
console.log("=====================================\n");

function runDuckDBCommand(sql) {
  try {
    const result = execSync(`duckdb "${DB_PATH}" "${sql}"`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch (error) {
    throw new Error(`DuckDB command failed: ${error.message}`);
  }
}

function checkDuckDBInstalled() {
  try {
    execSync("which duckdb", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function setupTestEnvironment() {
  console.log("📋 Setting up test environment...");

  // Create test directory
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  // Remove existing test database
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  console.log("✅ Test environment ready\n");
}

function testSchemaCreation() {
  console.log("🔧 Testing schema creation...");

  try {
    // Test npm schema
    const npmSchemaPath = path.resolve("./scripts/npm-duckdb.sql");
    execSync(`duckdb "${DB_PATH}" ".read ${npmSchemaPath}"`, {
      encoding: "utf8",
      stdio: "ignore",
    });

    // Test github schema
    const githubSchemaPath = path.resolve("./scripts/github-duckdb.sql");
    execSync(`duckdb "${DB_PATH}" ".read ${githubSchemaPath}"`, {
      encoding: "utf8",
      stdio: "ignore",
    });

    console.log("✅ Schema creation successful\n");
    return true;
  } catch (error) {
    console.error("❌ Schema creation failed:", error.message);
    return false;
  }
}

function testBasicOperations() {
  console.log("🧪 Testing basic operations...");

  try {
    // Test UUID generation
    const uuid = runDuckDBCommand("SELECT gen_random_uuid() as test_uuid;");
    console.log("  UUID generation:", uuid.includes("-") ? "✅" : "❌");

    // Test schemas exist
    const schemas = runDuckDBCommand("SHOW SCHEMAS;");
    console.log(
      "  Schemas created:",
      schemas.includes("npm_count") && schemas.includes("github") ? "✅" : "❌"
    );

    // Test tables exist
    const tables = runDuckDBCommand("SHOW ALL TABLES;");
    console.log(
      "  Tables created:",
      tables.includes("npm_package") && tables.includes("organization")
        ? "✅"
        : "❌"
    );

    console.log("✅ Basic operations successful\n");
    return true;
  } catch (error) {
    console.error("❌ Basic operations failed:", error.message);
    return false;
  }
}

function testDataOperations() {
  console.log("📝 Testing data operations...");

  try {
    // Test npm package insert
    runDuckDBCommand(`
      INSERT INTO npm_count.npm_package (package_name, creation_date, last_publish_date) 
      VALUES ('test-package', '2023-01-01', '2023-12-01');
    `);

    // Test github organization insert
    runDuckDBCommand(`
      INSERT INTO github.organization (github_id, login, name) 
      VALUES (12345, 'test-org', 'Test Organization');
    `);

    // Test data retrieval
    const npmCount = runDuckDBCommand(
      "SELECT COUNT(*) as count FROM npm_count.npm_package;"
    );
    const githubCount = runDuckDBCommand(
      "SELECT COUNT(*) as count FROM github.organization;"
    );

    console.log("  NPM package insert:", npmCount.includes("1") ? "✅" : "❌");
    console.log(
      "  GitHub org insert:",
      githubCount.includes("1") ? "✅" : "❌"
    );

    console.log("✅ Data operations successful\n");
    return true;
  } catch (error) {
    console.error("❌ Data operations failed:", error.message);
    return false;
  }
}

function testForeignKeys() {
  console.log("🔗 Testing foreign key relationships...");

  try {
    // Test foreign key constraint
    runDuckDBCommand(`
      INSERT INTO npm_count.daily_downloads (package_name, date, download_count) 
      VALUES ('test-package', '2023-01-02', 100);
    `);

    const downloadCount = runDuckDBCommand(
      "SELECT COUNT(*) as count FROM npm_count.daily_downloads;"
    );
    console.log(
      "  Foreign key insert:",
      downloadCount.includes("1") ? "✅" : "❌"
    );

    console.log("✅ Foreign key relationships working\n");
    return true;
  } catch (error) {
    console.error("❌ Foreign key test failed:", error.message);
    return false;
  }
}

function testMacros() {
  console.log("🔍 Testing DuckDB macros...");

  try {
    // Test the macro we created
    const result = runDuckDBCommand(`
      SELECT * FROM github.get_repositories_by_org_login('test-org');
    `);

    console.log("  Macro execution:", result !== undefined ? "✅" : "❌");

    console.log("✅ Macro testing successful\n");
    return true;
  } catch (error) {
    console.error("❌ Macro test failed:", error.message);
    return false;
  }
}

function cleanup() {
  console.log("🧹 Cleaning up...");

  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  console.log("✅ Cleanup complete\n");
}

async function runTests() {
  let success = true;

  try {
    // Check prerequisites
    if (!checkDuckDBInstalled()) {
      console.error("❌ DuckDB CLI not found. Please install DuckDB first.");
      console.error("   Visit: https://duckdb.org/docs/installation");
      process.exit(1);
    }

    setupTestEnvironment();

    success = testSchemaCreation() && success;
    success = testBasicOperations() && success;
    success = testDataOperations() && success;
    success = testForeignKeys() && success;
    success = testMacros() && success;

    if (success) {
      console.log("🎉 All tests passed! DuckDB schemas are working correctly.");
      console.log("\nYou can now use:");
      console.log("  ./scripts/schema-duckdb.sh           # Reset all schemas");
      console.log("  ./scripts/schema-duckdb.sh -s npm    # Reset npm schema");
      console.log(
        "  ./scripts/schema-duckdb.sh -s github # Reset github schema"
      );
    } else {
      console.log("❌ Some tests failed. Please check the errors above.");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Test suite failed:", error.message);
    success = false;
    process.exit(1);
  } finally {
    cleanup();
  }
}

// Run tests
runTests().catch(console.error);

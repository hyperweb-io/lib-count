import { Database } from "../src";
import * as duckdb from "duckdb"; // Import duckdb for Connection type

let client: Database;

// Helper to promisify connection.run for DDL/DML that doesn't return rows
async function runQuery(
  connection: duckdb.Connection,
  sql: string,
  params: any[] = []
) {
  return new Promise<void>((resolve, reject) => {
    connection.run(sql, ...params, (err: Error | null) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// Helper to promisify connection.all for SELECT queries
async function getAll(
  connection: duckdb.Connection,
  sql: string,
  params: any[] = []
) {
  return new Promise<any[]>((resolve, reject) => {
    connection.all(sql, ...params, (err: Error | null, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// Helper to promisify connection.all for SELECT queries expected to return a single row
async function getOne(
  connection: duckdb.Connection,
  sql: string,
  params: any[] = []
) {
  return new Promise<any | null>((resolve, reject) => {
    connection.all(sql, ...params, (err: Error | null, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows && rows.length > 0 ? rows[0] : null);
    });
  });
}

beforeAll(() => {
  // DUCKDB_PATH defaults to ':memory:' in env.ts, so no need to set env vars here for the test
  client = new Database();
});

afterAll(async () => {
  // Make afterAll async if shutdown is async
  await client.shutdown();
});

describe("Database Client with DuckDB", () => {
  it("should perform a basic transaction with SELECT", (done) => {
    client
      .withTransaction(async (connection: duckdb.Connection) => {
        const rows = await getAll(connection, "SELECT 1 as result");
        expect(rows).toEqual([{ result: 1 }]);
        done();
      })
      .catch(done);
  });

  it("should create a table, insert, and select data (TEXT, INTEGER)", async () => {
    await client.withTransaction(async (connection) => {
      await runQuery(
        connection,
        "CREATE TABLE test_basic (id INTEGER, name VARCHAR)"
      );
      await runQuery(connection, "INSERT INTO test_basic VALUES (1, 'Alice')");
      const rows = await getAll(
        connection,
        "SELECT * FROM test_basic WHERE id = ?",
        [1]
      );
      expect(rows).toEqual([{ id: 1, name: "Alice" }]);
    });
  });

  it("should use UUID primary key with default uuid() value", async () => {
    await client.withTransaction(async (connection) => {
      await runQuery(
        connection,
        "CREATE TABLE test_uuid (id UUID PRIMARY KEY DEFAULT uuid(), data VARCHAR)"
      );
      await runQuery(
        connection,
        "INSERT INTO test_uuid (data) VALUES ('TestData')"
      );
      const row = await getOne(connection, "SELECT id, data FROM test_uuid");
      expect(row).not.toBeNull();
      if (row) {
        expect(row.data).toBe("TestData");
        expect(typeof row.id).toBe("string"); // DuckDB UUIDs are typically strings
        expect(row.id.length).toBe(36); // Standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      }
    });
  });

  it("should handle BIGINT data type", async () => {
    await client.withTransaction(async (connection) => {
      await runQuery(connection, "CREATE TABLE test_bigint (val BIGINT)");
      const bigNum = BigInt("9007199254740991123");

      // Convert BigInt to string for insertion - DuckDB Node.js driver may not handle raw BigInt in prepared statements
      const stmt = connection.prepare("INSERT INTO test_bigint VALUES (?)");
      await new Promise<void>((resolve, reject) => {
        stmt.run(bigNum.toString(), (errRun?: Error | null) => {
          if (errRun) {
            console.error("Error during stmt.run:", errRun);
            return reject(errRun);
          }
          stmt.finalize((errFinalize?: Error | null) => {
            if (errFinalize) {
              console.error("Error during stmt.finalize:", errFinalize);
              return reject(errFinalize);
            }
            console.log("BIGINT insert completed successfully");
            resolve();
          });
        });
      });

      const row = await getOne(connection, "SELECT val FROM test_bigint");
      console.log("BIGINT test - row:", row);
      console.log("BIGINT test - row type:", typeof row);
      if (row) {
        console.log("BIGINT test - row.val:", row.val);
        console.log("BIGINT test - row.val type:", typeof row.val);
      }

      expect(row).not.toBeNull();
      if (row) {
        expect(row.val).not.toBeNull();
        // DuckDB may return the value as a string or number, convert to BigInt for comparison
        expect(BigInt(row.val)).toEqual(bigNum);
      } else {
        fail("Row not found for BIGINT test. Insert may have failed.");
      }
    });
  });

  it("should handle BOOLEAN data type", async () => {
    await client.withTransaction(async (connection) => {
      await runQuery(
        connection,
        "CREATE TABLE test_boolean (is_active BOOLEAN)"
      );
      await runQuery(
        connection,
        "INSERT INTO test_boolean VALUES (true), (false)"
      );
      const rows = await getAll(
        connection,
        "SELECT * FROM test_boolean ORDER BY is_active DESC"
      );
      expect(rows).toEqual([{ is_active: true }, { is_active: false }]);
    });
  });

  it("should handle TIMESTAMPTZ and CURRENT_TIMESTAMP", async () => {
    await client.withTransaction(async (connection) => {
      await runQuery(
        connection,
        "CREATE TABLE test_timestamp (created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)"
      );
      const beforeInsert = new Date();
      await runQuery(connection, "INSERT INTO test_timestamp DEFAULT VALUES");
      const afterInsert = new Date();
      const row = await getOne(
        connection,
        "SELECT created_at FROM test_timestamp"
      );
      expect(row).not.toBeNull();
      if (row) {
        const createdAt = new Date(row.created_at);
        expect(createdAt.getTime()).toBeGreaterThanOrEqual(
          beforeInsert.getTime() - 2000
        ); // Allow for small clock drift + query exec time
        expect(createdAt.getTime()).toBeLessThanOrEqual(
          afterInsert.getTime() + 2000
        );
      }
    });
  });

  it("should handle DATE data type", async () => {
    await client.withTransaction(async (connection) => {
      await runQuery(connection, "CREATE TABLE test_date (event_date DATE)");
      await runQuery(connection, "INSERT INTO test_date VALUES ('2024-07-26')");
      const row = await getOne(connection, "SELECT event_date FROM test_date");

      console.log("DATE test - row:", row);
      console.log("DATE test - row type:", typeof row);
      if (row) {
        console.log("DATE test - row.event_date:", row.event_date);
        console.log("DATE test - row.event_date type:", typeof row.event_date);
        console.log(
          "DATE test - row.event_date instanceof Date:",
          row.event_date instanceof Date
        );
        console.log(
          "DATE test - row.event_date constructor:",
          row.event_date.constructor.name
        );
      }

      expect(row).not.toBeNull();
      if (row) {
        // DuckDB driver may return Date-like objects that aren't true Date instances
        // Convert to Date if needed
        const dateObj =
          row.event_date instanceof Date
            ? row.event_date
            : new Date(row.event_date);
        expect(dateObj instanceof Date).toBe(true);
        expect(dateObj.getUTCFullYear()).toBe(2024);
        expect(dateObj.getUTCMonth()).toBe(6); // 0-indexed (July)
        expect(dateObj.getUTCDate()).toBe(26);
      } else {
        fail("Row not found for DATE test");
      }
    });
  });

  it("should rollback transaction on constraint violation (UNIQUE)", async () => {
    let queryError: Error | null = null;
    try {
      await client.withTransaction(async (connection) => {
        await runQuery(
          connection,
          "CREATE TABLE test_unique_constraint (id INTEGER PRIMARY KEY, name VARCHAR UNIQUE)"
        );
        await runQuery(
          connection,
          "INSERT INTO test_unique_constraint VALUES (1, 'ItemA')"
        );
        await runQuery(
          connection,
          "INSERT INTO test_unique_constraint VALUES (2, 'ItemA')"
        ); // This should fail
      });
    } catch (e: any) {
      queryError = e;
    }
    expect(queryError).not.toBeNull();
    if (queryError) {
      // Type guard for queryError
      expect(queryError.message).toMatch(
        /Constraint Error|UNIQUE constraint failed/i
      );
    }

    // Verify data was rolled back (or table doesn't exist if creation was part of the failing transaction batch)
    await client.withTransaction(async (connection) => {
      const rows = await getAll(
        connection,
        "SELECT name FROM sqlite_master WHERE type='table' AND name='test_unique_constraint'"
      ).catch((): any[] => []);
      if (rows.length > 0) {
        // If table exists, it should be empty
        const dataRows = await getAll(
          connection,
          "SELECT * FROM test_unique_constraint"
        );
        expect(dataRows.length).toBe(0);
      } else {
        // If table doesn't exist, that also implies a rollback of its creation, which is fine for this test
        expect(rows.length).toBe(0);
      }
    });
  });

  it("should commit a successful multi-operation transaction with FOREIGN KEY", async () => {
    await client.withTransaction(async (connection) => {
      await runQuery(
        connection,
        "CREATE TABLE parent_table (id INTEGER PRIMARY KEY)"
      );
      await runQuery(
        connection,
        "CREATE TABLE child_table (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent_table(id))"
      );
      await runQuery(connection, "INSERT INTO parent_table VALUES (10)");
      await runQuery(connection, "INSERT INTO child_table VALUES (100, 10)");
    });
    // Verify data
    await client.withTransaction(async (connection) => {
      const parentRows = await getAll(connection, "SELECT * FROM parent_table");
      const childRows = await getAll(connection, "SELECT * FROM child_table");
      expect(parentRows).toEqual([{ id: 10 }]);
      expect(childRows).toEqual([{ id: 100, parent_id: 10 }]);
    });
  });

  it("should handle NULL values correctly", async () => {
    await client.withTransaction(async (connection) => {
      await runQuery(
        connection,
        "CREATE TABLE test_nulls (id INTEGER, description VARCHAR)"
      );
      await runQuery(
        connection,
        "INSERT INTO test_nulls VALUES (1, NULL), (2, 'Not Null')"
      );
      const rows = await getAll(
        connection,
        "SELECT id, description FROM test_nulls ORDER BY id"
      );
      expect(rows).toEqual([
        { id: 1, description: null },
        { id: 2, description: "Not Null" },
      ]);
    });
  });

  it("should execute parameterized queries using connection.all", async () => {
    await client.withTransaction(async (connection) => {
      await runQuery(
        connection,
        "CREATE TABLE test_params_all (id INTEGER, name VARCHAR)"
      );
      await runQuery(
        connection,
        "INSERT INTO test_params_all VALUES (1, 'ParamA'), (2, 'ParamB')"
      );
      const rows = await getAll(
        connection,
        "SELECT * FROM test_params_all WHERE name = ?",
        ["ParamA"]
      );
      expect(rows).toEqual([{ id: 1, name: "ParamA" }]);
    });
  });

  it("should use connection.run for statements not returning results", async () => {
    await client.withTransaction(async (connection) => {
      await runQuery(connection, "CREATE TABLE test_run_stmt (id INTEGER)");
      await runQuery(connection, "INSERT INTO test_run_stmt VALUES (77)");
      const row = await getOne(
        connection,
        "SELECT id FROM test_run_stmt WHERE id = 77"
      );
      expect(row).toEqual({ id: 77 });
    });
  });

  it("should execute multiple semicolon-separated statements with connection.exec", async () => {
    await client.withTransaction(async (connection) => {
      await new Promise<void>((resolve, reject) => {
        // Promisify exec
        connection.exec(
          "CREATE TABLE test_exec_multi (colA INT); INSERT INTO test_exec_multi VALUES (101), (102);",
          (err: Error | null) => {
            if (err) return reject(err);
            resolve();
          }
        );
      });
      const rows = await getAll(
        connection,
        "SELECT * FROM test_exec_multi ORDER BY colA"
      );
      expect(rows).toEqual([{ colA: 101 }, { colA: 102 }]);
    });
  });
});

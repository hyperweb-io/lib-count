import * as duckdb from "duckdb";
import env from "./env";

// The duckdb.Connection type is used for transactions.
type DuckDBTransactionCallback = (
  connection: duckdb.Connection
) => Promise<void>;

export class Database {
  private static instance: Database;
  private db: duckdb.Database;

  constructor() {
    if (Database.instance) {
      return Database.instance;
    }

    // env.DUCKDB_PATH can be a file path or ':memory:'
    // The second argument is an access mode, e.g. duckdb.OPEN_READWRITE. Default is OPEN_READWRITE | OPEN_CREATE.
    // The callback is for error handling during instantiation.
    this.db = new duckdb.Database(env.DUCKDB_PATH, (err: Error | null) => {
      if (err) {
        console.error(
          "Failed to connect to DuckDB database at " + env.DUCKDB_PATH + ":",
          err
        );
        // Depending on the application, you might want to throw here or exit.
      }
    });

    // Ensure the database is closed on process termination
    process.on("SIGTERM", async () => {
      await this.shutdown();
    });

    Database.instance = this;
    return this;
  }

  /**
   * Provides direct access to the DuckDB database instance for queries.
   */
  getDB(): duckdb.Database {
    return this.db;
  }

  /**
   * Creates and returns a new DuckDB connection.
   * Useful for explicit transaction control or managing concurrency.
   */
  async connect(): Promise<duckdb.Connection> {
    // duckdb.Database.connect() is synchronous and returns a Connection object.
    // No promise wrapper strictly needed here unless we want to conform to an async interface
    // for potential future DBs that might have async connect methods.
    return this.db.connect();
  }

  /**
   * Executes a callback function within a database transaction.
   * @param fn - A callback function that receives a duckdb.Connection to perform database operations.
   */
  async withTransaction(fn: DuckDBTransactionCallback): Promise<void> {
    const connection = await this.connect(); // Get a new connection for the transaction
    try {
      await new Promise<void>((resolve, reject) => {
        connection.exec("BEGIN TRANSACTION", (err: Error | null) =>
          err ? reject(err) : resolve()
        );
      });

      try {
        await fn(connection); // Pass the connection to the callback
        await new Promise<void>((resolve, reject) => {
          connection.exec("COMMIT", (err: Error | null) =>
            err ? reject(err) : resolve()
          );
        });
      } catch (e) {
        console.error("Error during transaction, rolling back:", e);
        await new Promise<void>((resolveRollback, rejectRollback) => {
          connection.exec("ROLLBACK", (errRollback: Error | null) => {
            if (errRollback) {
              // Log rollback error but still throw original transaction error
              console.error("Error during ROLLBACK:", errRollback);
              return rejectRollback(errRollback); // Or just log and resolve if primary error is more important
            }
            resolveRollback();
          });
        }).catch((rollbackError) => {
          // If rollback itself errors, we should probably log it, but the original error `e` is more critical to propagate.
          console.error("Rollback failed:", rollbackError);
        });
        throw e; // Re-throw the original error from the transaction body
      }
    } finally {
      // Close the dedicated connection after the transaction.
      // connection.close() takes an optional callback.
      await new Promise<void>((resolve) => {
        connection.close((err?: Error | null) => {
          if (err) {
            console.error("Error closing DuckDB connection:", err);
          }
          resolve();
        });
      });
    }
  }

  /**
   * Shuts down the database connection.
   */
  async shutdown(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.db.close((err?: Error | null) => {
        if (err) {
          console.error("Error shutting down DuckDB:", err);
          return reject(err);
        }
        resolve();
      });
    });
  }
}

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import Database from "better-sqlite3";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const s3Client = new S3Client({
  region: "us-east-1",
});

const BUCKET_NAME = "lib-count";
const DB_KEY = "sqlite.db";

let cachedDbPath: string | null = null;
let lastDownloadTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getS3Database(): Promise<Database.Database> {
  const now = Date.now();

  // Check if we have a cached database that's still fresh
  if (
    cachedDbPath &&
    existsSync(cachedDbPath) &&
    now - lastDownloadTime < CACHE_DURATION
  ) {
    return new Database(cachedDbPath);
  }

  try {
    // Download database from S3
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: DB_KEY,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error("No database found in S3");
    }

    // Create temporary file path
    const tempDbPath = join(tmpdir(), `cosmology-db-${Date.now()}.sqlite`);

    // Write database to temporary file
    const dbBuffer = await response.Body.transformToByteArray();
    writeFileSync(tempDbPath, dbBuffer);

    // Clean up old cached database
    if (cachedDbPath && existsSync(cachedDbPath)) {
      try {
        unlinkSync(cachedDbPath);
      } catch (error) {
        console.warn("Failed to clean up old database file:", error);
      }
    }

    // Update cache
    cachedDbPath = tempDbPath;
    lastDownloadTime = now;

    return new Database(tempDbPath);
  } catch (error) {
    console.error("Failed to download database from S3:", error);
    throw new Error(
      `Failed to download database from S3: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// Cleanup function to remove temporary database files
export function cleanupTempDb() {
  if (cachedDbPath && existsSync(cachedDbPath)) {
    try {
      unlinkSync(cachedDbPath);
      cachedDbPath = null;
    } catch (error) {
      console.warn("Failed to cleanup temporary database:", error);
    }
  }
}

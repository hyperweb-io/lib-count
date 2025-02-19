import { exec } from "child_process";
import { createGzip } from "zlib";
import { createReadStream, createWriteStream, statSync } from "fs";
import { promisify } from "util";
import { unlink } from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

interface BackupStats {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  timestamp: string;
  durationMs: number;
}

async function formatSize(bytes: number): Promise<string> {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

async function dumpAndGzip(): Promise<BackupStats> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const exportsDir = path.join(__dirname, "../exports");
  const dumpFile = path.join(exportsDir, `backup-${timestamp}.sql`);
  const gzipFile = path.join(exportsDir, `backup-${timestamp}.sql.gz`);

  try {
    // Create dump
    const dumpCommand = `PGPASSWORD=password docker exec -i postgres pg_dump -U postgres example_db > ${dumpFile}`;
    await execAsync(dumpCommand);

    // Get original file size
    const originalSize = statSync(dumpFile).size;

    // Gzip the dump
    const readStream = createReadStream(dumpFile);
    const writeStream = createWriteStream(gzipFile);
    const gzip = createGzip();

    await new Promise<void>((resolve, reject) => {
      readStream
        .pipe(gzip)
        .pipe(writeStream)
        .on("finish", resolve)
        .on("error", reject);
    });

    // Get compressed file size
    const compressedSize = statSync(gzipFile).size;

    // Calculate compression ratio and duration
    const compressionRatio = (1 - compressedSize / originalSize) * 100;
    const durationMs = Date.now() - startTime;

    // Delete the original dump
    await unlink(dumpFile);

    const stats: BackupStats = {
      originalSize,
      compressedSize,
      compressionRatio,
      timestamp: new Date().toISOString(),
      durationMs,
    };

    // Log the backup statistics
    console.log("\nBackup Statistics:");
    console.log("----------------");
    console.log(`Original Size: ${await formatSize(stats.originalSize)}`);
    console.log(`Compressed Size: ${await formatSize(stats.compressedSize)}`);
    console.log(`Compression Ratio: ${stats.compressionRatio.toFixed(2)}%`);
    console.log(`Duration: ${(stats.durationMs / 1000).toFixed(2)}s`);
    console.log(`Output File: ${path.relative(process.cwd(), gzipFile)}`);

    return stats;
  } catch (error) {
    console.error("Backup failed:", error);
    // Cleanup any partial files
    try {
      await unlink(dumpFile).catch(() => {});
      await unlink(gzipFile).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  dumpAndGzip()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Backup process failed:", error);
      process.exit(1);
    });
}

export { dumpAndGzip, type BackupStats };

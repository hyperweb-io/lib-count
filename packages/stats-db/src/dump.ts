import { exec } from "child_process";
import { createGzip } from "zlib";
import { createReadStream, createWriteStream, statSync } from "fs";
import { promisify } from "util";
import { unlink, mkdir } from "fs/promises";
import * as path from "path";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { ReadStream } from "fs";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const execAsync = promisify(exec);

interface BackupStats {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  timestamp: string;
  durationMs: number;
  s3Location?: string;
}

interface DumpOptions {
  bucketName?: string;
  skipUpload?: boolean;
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

/**
 * Upload a file to an S3 bucket
 * @param filePath Path to the file to upload
 * @param bucketName S3 bucket name
 * @param key Object key (path in S3)
 * @returns S3 URL of the uploaded file
 */
async function uploadToS3(
  fileStream: ReadStream,
  bucketName: string,
  key: string
): Promise<string> {
  const client = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    // AWS credentials are loaded automatically from environment variables or ~/.aws/credentials
  });

  const upload = new Upload({
    client,
    params: {
      Bucket: bucketName,
      Key: key,
      Body: fileStream,
      ContentType: "application/gzip",
    },
  });

  // Upload the file and get the result
  await upload.done();

  // Return the S3 URL
  return `s3://${bucketName}/${key}`;
}

/**
 * Create a database dump, gzip it, and optionally upload to S3
 * @param options Options for the dump operation
 * @returns Statistics about the backup
 */
async function dumpAndGzip(
  options?: DumpOptions | string
): Promise<BackupStats> {
  // Handle string argument (for backward compatibility)
  if (typeof options === "string") {
    options = { bucketName: options };
  }

  // Default options
  const { bucketName = process.env.S3_BUCKET_NAME, skipUpload = false } =
    options || {};

  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const exportsDir = path.join(__dirname, "../exports");
  const dumpFile = path.join(exportsDir, `backup-${timestamp}.sql`);
  const gzipFile = path.join(exportsDir, `backup-${timestamp}.sql.gz`);

  try {
    // Ensure exports directory exists
    await mkdir(exportsDir, { recursive: true });

    // Create dump - detect environment and use appropriate command
    const isCI =
      process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
    const dumpCommand = isCI
      ? `PGPASSWORD=password pg_dump -h localhost -p 5432 -U postgres example_db > ${dumpFile}`
      : `PGPASSWORD=password docker exec -i postgres pg_dump -U postgres example_db > ${dumpFile}`;

    console.log(
      `Running dump command (CI: ${isCI}): ${dumpCommand.replace("PGPASSWORD=password", "PGPASSWORD=***")}`
    );
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

    // Stats object to be returned
    const stats: BackupStats = {
      originalSize,
      compressedSize,
      compressionRatio,
      timestamp: new Date().toISOString(),
      durationMs,
    };

    // Upload to S3 if a bucket name is provided and skipUpload is false
    if (bucketName && !skipUpload) {
      try {
        const s3Key = path.basename(gzipFile);
        const s3UploadStream = createReadStream(gzipFile);

        console.log(`Uploading to S3 bucket: ${bucketName}, key: ${s3Key}...`);
        stats.s3Location = await uploadToS3(s3UploadStream, bucketName, s3Key);
        console.log(`Successfully uploaded to: ${stats.s3Location}`);
      } catch (s3Error) {
        console.error("S3 upload failed:", s3Error);
        console.log("Continuing without S3 upload.");
      }
    } else if (skipUpload) {
      console.log("S3 upload skipped.");
    } else if (!bucketName) {
      console.log("No S3 bucket name provided. Skipping upload.");
    }

    // Delete the original dump
    await unlink(dumpFile);

    // Log the backup statistics
    console.log("\nBackup Statistics:");
    console.log("----------------");
    console.log(`Original Size: ${await formatSize(stats.originalSize)}`);
    console.log(`Compressed Size: ${await formatSize(stats.compressedSize)}`);
    console.log(`Compression Ratio: ${stats.compressionRatio.toFixed(2)}%`);
    console.log(`Duration: ${(stats.durationMs / 1000).toFixed(2)}s`);
    console.log(`Output File: ${path.relative(process.cwd(), gzipFile)}`);
    if (stats.s3Location) {
      console.log(`S3 Location: ${stats.s3Location}`);
    }

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
  // Check for --no-upload flag
  const skipUpload = process.argv.includes("--no-upload");

  // Get the S3 bucket name from environment variable or command line argument
  const bucketNameArg = process.argv.find(
    (arg) =>
      !arg.startsWith("-") && arg !== process.argv[0] && arg !== process.argv[1]
  );
  const bucketName = bucketNameArg || process.env.S3_BUCKET_NAME;

  if (!bucketName && !skipUpload) {
    console.log(
      "No S3 bucket name provided. The dump will be created but not uploaded to S3."
    );
    console.log(
      "To upload to S3, set the S3_BUCKET_NAME environment variable or provide it as a command-line argument."
    );
  }

  dumpAndGzip({ bucketName, skipUpload })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Backup process failed:", error);
      process.exit(1);
    });
}

export { dumpAndGzip, type BackupStats, type DumpOptions };

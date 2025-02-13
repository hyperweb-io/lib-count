import { Database } from "@cosmology/db-client";
import { PoolClient } from "pg";
import { NPMApiClient } from "./npm-client";
import {
  getPackagesWithoutDownloads,
  getAllPackages,
  insertDailyDownloads,
  updateLastFetchedDate,
  getTotalLifetimeDownloads,
} from "./queries";
import { delay } from "./utils";

const npmClient = new NPMApiClient();

const CONCURRENT_TASKS = 15; // Number of concurrent downloads
const RATE_LIMIT_DELAY = 50; // ms between requests
const CHUNK_SIZE = 30; // days per chunk
const RESET_MODE = process.env.RESET === "true";
const PACKAGE_WHITELIST = new Set([]);
const USE_WHITELIST = PACKAGE_WHITELIST.size > 0;

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

interface DateRange {
  start: Date;
  end: Date;
}

interface PackageInfo {
  packageName: string;
  creationDate: Date;
}

function normalizeDate(date: Date): Date {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

function getDateChunks(startDate: Date, endDate: Date): DateRange[] {
  const chunks: DateRange[] = [];
  let currentStart = normalizeDate(startDate);
  const finalEndDate = normalizeDate(
    new Date(Math.min(endDate.getTime(), new Date().getTime()))
  );

  while (currentStart < finalEndDate) {
    // Create a new chunk
    const chunkEnd = new Date(currentStart);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + CHUNK_SIZE - 1);

    // Ensure we don't go past the final end date
    const actualEnd = chunkEnd > finalEndDate ? finalEndDate : chunkEnd;

    chunks.push({
      start: new Date(currentStart),
      end: new Date(actualEnd),
    });

    // Move to next chunk
    currentStart = new Date(actualEnd);
    currentStart.setUTCDate(currentStart.getUTCDate() + 1);
  }

  return chunks;
}

function formatDateRange(range: DateRange): string {
  const start = range.start.toISOString().split("T")[0];
  const end = range.end.toISOString().split("T")[0];
  const days =
    Math.floor(
      (range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
  return `${start} to ${end} (${days} days)`;
}

async function processPackageChunk(
  dbClient: PoolClient,
  packageName: string,
  dateRange: DateRange,
  chunkIndex: number,
  totalChunks: number,
  current: number,
  total: number
): Promise<void> {
  const startTime = Date.now();
  const dateRangeStr = formatDateRange(dateRange);

  try {
    console.log(
      `[${current}/${total}] Starting chunk ${chunkIndex}/${totalChunks} for ${packageName}: ${dateRangeStr}`
    );

    // Format dates for npm API - ensure UTC dates
    const downloadData = await npmClient.download({
      startDate: [
        dateRange.start.getUTCFullYear(),
        dateRange.start.getUTCMonth() + 1,
        dateRange.start.getUTCDate(),
      ],
      endDate: [
        dateRange.end.getUTCFullYear(),
        dateRange.end.getUTCMonth() + 1,
        dateRange.end.getUTCDate(),
      ],
      packageName,
    });

    if (!downloadData.downloads || downloadData.downloads.length === 0) {
      console.log(
        `[${current}/${total}] ⚠ ${packageName} chunk ${chunkIndex}/${totalChunks}: No downloads for ${dateRangeStr}`
      );
      return;
    }

    // Ensure all dates are normalized to UTC
    const normalizedDownloads = downloadData.downloads.map((d) => ({
      date: normalizeDate(new Date(d.day)),
      downloadCount: d.downloads,
    }));

    // Insert all daily downloads
    await insertDailyDownloads(dbClient, packageName, normalizedDownloads);

    const totalDownloads = normalizedDownloads.reduce(
      (sum, d) => sum + d.downloadCount,
      0
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      `[${current}/${total}] ✓ ${packageName} chunk ${chunkIndex}/${totalChunks}: Processed ${
        normalizedDownloads.length
      } days in ${duration}s\n\tPeriod: ${dateRangeStr}\n\tTotal Downloads: ${totalDownloads.toLocaleString()}`
    );
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(
      `[${current}/${total}] ✗ ${packageName} chunk ${chunkIndex}/${totalChunks} failed after ${duration}s:\n\tPeriod: ${dateRangeStr}\n\tError: ${
        error instanceof Error ? error.message : error
      }`
    );
    throw error;
  }
}

async function processPackageDownloads(
  db: Database,
  packageName: string,
  creationDate: Date,
  current: number,
  total: number
): Promise<void> {
  let lastError: Error | unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Start a new transaction for this package
      await db.withTransaction(async (dbClient: PoolClient) => {
        const today = new Date();
        const dateChunks = getDateChunks(creationDate, today);
        const totalDays =
          Math.floor(
            (today.getTime() - creationDate.getTime()) / (1000 * 60 * 60 * 24)
          ) + 1;

        if (attempt > 1) {
          console.log(
            `[${current}/${total}] 🔄 Retry attempt ${attempt}/${MAX_RETRIES} for ${packageName}`
          );
        }

        console.log(
          `\n[${current}/${total}] Starting ${packageName}:\n` +
            `\tPeriod: ${creationDate.toISOString().split("T")[0]} to ${today.toISOString().split("T")[0]}\n` +
            `\tTotal Days: ${totalDays}\n` +
            `\tChunks: ${dateChunks.length}`
        );

        for (let i = 0; i < dateChunks.length; i++) {
          await delay(RATE_LIMIT_DELAY);
          await processPackageChunk(
            dbClient,
            packageName,
            dateChunks[i],
            i + 1,
            dateChunks.length,
            current,
            total
          );
        }

        // Update the last_fetched_date after all chunks are processed
        await updateLastFetchedDate(dbClient, packageName);

        // Get and log total lifetime downloads
        const lifetimeDownloads = await getTotalLifetimeDownloads(
          dbClient,
          packageName
        );
        console.log(
          `[${current}/${total}] ✅ Completed all chunks for ${packageName}\n` +
            `\tTotal Lifetime Downloads: ${lifetimeDownloads.toLocaleString()}\n`
        );
      });

      // If we get here, processing was successful
      return;
    } catch (error) {
      lastError = error;

      if (attempt < MAX_RETRIES) {
        const backoffDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.error(
          `[${current}/${total}] ⚠️ Attempt ${attempt}/${MAX_RETRIES} failed for ${packageName}:`,
          error instanceof Error ? error.message : error,
          `\n\tRetrying in ${backoffDelay / 1000} seconds...`
        );
        await delay(backoffDelay);
      }
    }
  }

  // If we get here, all retries failed
  console.error(
    `[${current}/${total}] ❌ All ${MAX_RETRIES} attempts failed for ${packageName}:`,
    lastError instanceof Error ? lastError.message : lastError
  );
  throw lastError;
}

async function processBatch(
  db: Database,
  packages: Array<PackageInfo>,
  startIndex: number,
  total: number
): Promise<void> {
  const results = await Promise.allSettled(
    packages.map((pkg, index) =>
      (async () => {
        await delay(index * RATE_LIMIT_DELAY); // Stagger the requests
        return processPackageDownloads(
          db,
          pkg.packageName,
          pkg.creationDate,
          startIndex + index + 1,
          total
        );
      })()
    )
  );

  // Log any failures in the batch
  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected"
  );
  if (failures.length > 0) {
    console.error(`\n${failures.length} package(s) failed in this batch:`);
    failures.forEach((failure) => {
      console.error(`  - ${failure.reason}`);
    });
  }
}

async function run(): Promise<void> {
  const db = new Database();
  const scriptStartTime = Date.now();

  try {
    // Get packages based on RESET mode - this can be outside transaction
    let packages: PackageInfo[] = [];

    await db.withTransaction(async (dbClient: PoolClient) => {
      packages = RESET_MODE
        ? await getAllPackages(dbClient)
        : await getPackagesWithoutDownloads(dbClient);
    });

    // Convert to simpler package info format
    packages = packages.map((pkg) => ({
      packageName: pkg.packageName,
      creationDate: pkg.creationDate,
    }));

    // Filter by whitelist if enabled
    if (USE_WHITELIST) {
      const originalCount = packages.length;
      packages = packages.filter((pkg) =>
        PACKAGE_WHITELIST.has(pkg.packageName)
      );
      console.log(
        `Filtered ${originalCount} packages to ${packages.length} whitelisted packages`
      );
    }

    const totalPackages = packages.length;
    if (totalPackages === 0) {
      console.log("No packages to process!");
      return;
    }

    console.log(
      `Found ${totalPackages} package${
        totalPackages === 1 ? "" : "s"
      } to process with ${CONCURRENT_TASKS} concurrent tasks${
        RESET_MODE ? " (RESET mode)" : ""
      }${USE_WHITELIST ? " (WHITELIST mode)" : ""}`
    );

    let successCount = 0;
    let failureCount = 0;

    // Process packages in batches
    for (let i = 0; i < packages.length; i += CONCURRENT_TASKS) {
      const batch = packages.slice(i, i + CONCURRENT_TASKS);
      console.log(
        `\nProcessing batch ${Math.floor(i / CONCURRENT_TASKS) + 1}/${Math.ceil(
          packages.length / CONCURRENT_TASKS
        )}...`
      );

      try {
        await processBatch(db, batch, i, totalPackages);
        successCount += batch.length;
      } catch (error) {
        failureCount += batch.length;
        console.error(`Batch processing error:`, error);
      }
    }

    const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
    console.log(
      `\nProcessing completed in ${duration} seconds!\n` +
        `Successful packages: ${successCount}\n` +
        `Failed packages: ${failureCount}`
    );
  } catch (error) {
    const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
    console.error(`Script error after ${duration} seconds:`, error);
    throw error;
  }
}

// Execute the script
run()
  .then(() => {
    console.log(`Script completed successfully!`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`Script failed:`, error);
    process.exit(1);
  });

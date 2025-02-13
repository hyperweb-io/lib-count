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

const CONCURRENT_TASKS = 5; // Number of concurrent downloads
const RATE_LIMIT_DELAY = 50; // ms between requests
const CHUNK_SIZE = 30; // days per chunk
const RESET_MODE = process.env.RESET === "true";
const PACKAGE_WHITELIST = new Set([]);
const USE_WHITELIST = PACKAGE_WHITELIST.size > 0;

interface DateRange {
  start: Date;
  end: Date;
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
  dbClient: PoolClient,
  packageName: string,
  creationDate: Date,
  lastPublishDate: Date,
  current: number,
  total: number
): Promise<void> {
  try {
    const dateChunks = getDateChunks(creationDate, lastPublishDate);
    const totalDays =
      Math.floor(
        (lastPublishDate.getTime() - creationDate.getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;

    console.log(
      `\n[${current}/${total}] Starting ${packageName}:\n` +
        `\tPeriod: ${creationDate.toISOString().split("T")[0]} to ${lastPublishDate.toISOString().split("T")[0]}\n` +
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
  } catch (error) {
    console.error(
      `[${current}/${total}] ❌ Failed to process package ${packageName}:`,
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function processBatch(
  dbClient: PoolClient,
  packages: Array<{
    packageName: string;
    creationDate: Date;
    lastPublishDate: Date;
  }>,
  startIndex: number,
  total: number
): Promise<void> {
  const tasks = packages.map((pkg, index) =>
    (async () => {
      await delay(index * RATE_LIMIT_DELAY); // Stagger the requests
      return processPackageDownloads(
        dbClient,
        pkg.packageName,
        pkg.creationDate,
        pkg.lastPublishDate,
        startIndex + index + 1,
        total
      );
    })()
  );

  await Promise.all(tasks);
}

async function run(): Promise<void> {
  const db = new Database();
  const scriptStartTime = Date.now();

  try {
    await db.withTransaction(async (dbClient: PoolClient) => {
      // Get packages based on RESET mode
      let packages = RESET_MODE
        ? await getAllPackages(dbClient)
        : await getPackagesWithoutDownloads(dbClient);

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

      // Process packages in batches
      for (let i = 0; i < packages.length; i += CONCURRENT_TASKS) {
        const batch = packages.slice(i, i + CONCURRENT_TASKS);
        console.log(
          `\nProcessing batch ${Math.floor(i / CONCURRENT_TASKS) + 1}/${Math.ceil(
            packages.length / CONCURRENT_TASKS
          )}...`
        );
        await processBatch(dbClient, batch, i, totalPackages);
      }

      const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
      console.log(
        `\nAll package downloads processed successfully in ${duration} seconds!`
      );
    });
  } catch (error) {
    const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
    console.error(`Transaction failed after ${duration} seconds:`, error);
    throw error;
  }

  return Promise.resolve();
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

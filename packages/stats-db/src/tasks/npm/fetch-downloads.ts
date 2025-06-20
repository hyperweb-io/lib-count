import { db } from "../../db";
import { NPMApiClient } from "../../npm-client";
import { delay } from "../../utils";
import { eq, sql, inArray } from "drizzle-orm";
import { npmPackage, dailyDownloads } from "../../schema";
import { randomUUID } from "crypto";

const npmClient = new NPMApiClient();

const CONCURRENT_TASKS = 50; // Number of concurrent downloads
const RATE_LIMIT_DELAY = 50; // ms between requests
const CHUNK_SIZE = 30; // days per chunk
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
      id: randomUUID(),
      packageName: packageName,
      date: normalizeDate(new Date(d.day)),
      downloadCount: d.downloads,
      createdAt: new Date(),
    }));

    // Insert all daily downloads
    await db
      .insert(dailyDownloads)
      .values(normalizedDownloads)
      .onConflictDoNothing();

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

async function processPackageChunkWithRetries(
  task: {
    packageName: string;
    dateRange: DateRange;
    chunkIndex: number;
    totalChunks: number;
  },
  current: number,
  total: number
): Promise<void> {
  let lastError: Error | unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(
          `[${current}/${total}] 🔄 Retry attempt ${attempt}/${MAX_RETRIES} for ${task.packageName} chunk ${task.chunkIndex}`
        );
      }
      await processPackageChunk(
        task.packageName,
        task.dateRange,
        task.chunkIndex,
        task.totalChunks,
        current,
        total
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        const backoffDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.error(
          `[${current}/${total}] ⚠️ Attempt ${attempt}/${MAX_RETRIES} for ${
            task.packageName
          } failed:\n\tError: ${
            error instanceof Error ? error.message : error
          }\n\tRetrying in ${backoffDelay / 1000}s...`
        );
        await delay(backoffDelay);
      }
    }
  }

  console.error(
    `[${current}/${total}] ❌ All ${MAX_RETRIES} attempts failed for ${task.packageName}:`,
    lastError instanceof Error ? lastError.message : lastError
  );
  throw lastError;
}

async function run(shouldResetDb: boolean = false): Promise<void> {
  const scriptStartTime = Date.now();

  try {
    // Get packages based on RESET mode or data quality
    let packagesResult: PackageInfo[] = [];

    if (shouldResetDb) {
      // Reset mode: process all packages
      packagesResult = await db.select().from(npmPackage);
      console.log("Reset mode: Processing all packages");
    } else {
      // Smart mode: process packages that need updates
      // 1. Packages with no download data at all
      // 2. Packages with only zero downloads (likely bad data)
      // 3. Packages missing recent data (older than 7 days)

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const packagesNeedingUpdate = await db
        .select({
          packageName: npmPackage.packageName,
          creationDate: npmPackage.creationDate,
        })
        .from(npmPackage)
        .leftJoin(
          dailyDownloads,
          eq(npmPackage.packageName, dailyDownloads.packageName)
        )
        .groupBy(npmPackage.packageName, npmPackage.creationDate)
        .having(
          sql`
            -- No download data at all
            COUNT(${dailyDownloads.packageName}) = 0 
            OR 
            -- Only zero downloads (bad data)
            (COUNT(${dailyDownloads.packageName}) > 0 AND SUM(${dailyDownloads.downloadCount}) = 0)
            OR
            -- Missing recent data (no data in last 7 days)
            MAX(${dailyDownloads.date}) < ${sevenDaysAgo.getTime()}
          `
        );

      packagesResult = packagesNeedingUpdate;
      console.log(
        `Smart mode: Found ${packagesResult.length} packages needing updates`
      );
    }

    // Clear existing data for packages being re-processed
    if (packagesResult.length > 0) {
      const packageNamesToProcess = packagesResult.map((p) => p.packageName);
      console.log(
        `Clearing existing download data for ${packageNamesToProcess.length} packages...`
      );

      await db
        .delete(dailyDownloads)
        .where(inArray(dailyDownloads.packageName, packageNamesToProcess));

      console.log(`Cleared data for ${packageNamesToProcess.length} packages`);
    }

    // Filter by whitelist if enabled
    if (USE_WHITELIST) {
      const originalCount = packagesResult.length;
      packagesResult = packagesResult.filter((pkg) =>
        PACKAGE_WHITELIST.has(pkg.packageName)
      );
      console.log(
        `Filtered ${originalCount} packages to ${packagesResult.length} whitelisted packages`
      );
    }

    const totalPackages = packagesResult.length;
    if (totalPackages === 0) {
      console.log("No packages to process!");
      return;
    }

    console.log(
      `Found ${totalPackages} package${
        totalPackages === 1 ? "" : "s"
      } to process...`
    );

    // Create a flat list of all chunks for all packages
    const allChunks = packagesResult.flatMap((pkg) => {
      const today = new Date();
      const dateChunks = getDateChunks(pkg.creationDate, today);
      return dateChunks.map((chunk, index) => ({
        packageName: pkg.packageName,
        dateRange: chunk,
        chunkIndex: index + 1,
        totalChunks: dateChunks.length,
      }));
    });

    const totalChunks = allChunks.length;
    console.log(
      `Generated ${totalChunks} total download chunks to process with ${CONCURRENT_TASKS} concurrent tasks.`
    );

    let successCount = 0;
    let failureCount = 0;
    let processedChunks = 0;

    // Process all chunks in concurrent batches
    for (let i = 0; i < totalChunks; i += CONCURRENT_TASKS) {
      const batch = allChunks.slice(i, i + CONCURRENT_TASKS);
      console.log(
        `\nProcessing chunk batch ${Math.floor(i / CONCURRENT_TASKS) + 1}/${Math.ceil(
          totalChunks / CONCURRENT_TASKS
        )}...`
      );

      const results = await Promise.allSettled(
        batch.map((task, index) =>
          (async () => {
            await delay(index * RATE_LIMIT_DELAY); // Stagger requests within batch
            return processPackageChunkWithRetries(
              task,
              processedChunks + index + 1,
              totalChunks
            );
          })()
        )
      );

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          successCount++;
        } else {
          failureCount++;
          console.error(`Chunk processing failed:`, result.reason);
        }
      });
      processedChunks += batch.length;
    }

    // Note: No longer using lastFetchedDate - packages are selected based on data quality

    const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
    console.log(
      `\nProcessing completed in ${duration} seconds!\n` +
        `Successful chunks: ${successCount}\n` +
        `Failed chunks: ${failureCount}`
    );
  } catch (error) {
    const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
    console.error(`Script error after ${duration} seconds:`, error);
    throw error;
  }
}

type FetchDownloadsOptions = {
  resetDb?: boolean;
};

export function execute(options: FetchDownloadsOptions = {}): Promise<void> {
  return run(options.resetDb ?? false)
    .then(() => {
      console.log(`Script completed successfully!`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`Script failed:`, error);
      process.exit(1);
    });
}

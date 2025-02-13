import { Database } from "@cosmology/db-client";
import { PoolClient } from "pg";
import { NPMApiClient } from "./npm-client";
import {
  getPackagesWithoutDownloads,
  insertDailyDownloads,
  updateLastFetchedDate,
} from "./queries";
import { delay } from "./utils";

const npmClient = new NPMApiClient();

const CONCURRENT_TASKS = 5; // Number of concurrent downloads
const RATE_LIMIT_DELAY = 50; // ms between requests
const CHUNK_SIZE = 30; // days per chunk

interface DateRange {
  start: Date;
  end: Date;
}

function getDateChunks(startDate: Date, endDate: Date): DateRange[] {
  const chunks: DateRange[] = [];
  const currentStart = new Date(startDate);

  while (currentStart < endDate) {
    let currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + CHUNK_SIZE - 1);

    // If this chunk would go past endDate, use endDate instead
    if (currentEnd > endDate) {
      currentEnd = endDate;
    }

    chunks.push({
      start: new Date(currentStart),
      end: new Date(currentEnd),
    });

    // Move to next chunk
    currentStart.setDate(currentStart.getDate() + CHUNK_SIZE);
  }

  return chunks;
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
  try {
    const downloadData = await npmClient.download({
      startDate: [
        dateRange.start.getFullYear(),
        dateRange.start.getMonth() + 1,
        dateRange.start.getDate(),
      ],
      range: "daily",
      packageName,
    });

    // Insert all daily downloads
    await insertDailyDownloads(
      dbClient,
      packageName,
      downloadData.downloads.map((d) => ({
        date: new Date(d.day),
        downloadCount: d.downloads,
      }))
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      `[${current}/${total}] ✓ ${packageName} chunk ${chunkIndex}/${totalChunks} (${downloadData.downloads.length} days, ${duration}s)`
    );
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(
      `[${current}/${total}] ✗ ${packageName} chunk ${chunkIndex}/${totalChunks} (${duration}s):`,
      error instanceof Error ? error.message : error
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
  // Get date chunks from creation to last publish
  const dateChunks = getDateChunks(creationDate, lastPublishDate);

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
      // Get packages that need download data
      const packages = await getPackagesWithoutDownloads(dbClient);
      const totalPackages = packages.length;

      console.log(
        `Found ${totalPackages} packages to process with ${CONCURRENT_TASKS} concurrent tasks`
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

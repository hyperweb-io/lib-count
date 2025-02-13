import { Database } from "@cosmology/db-client";
import { PoolClient } from "pg";
import { NPMRegistryClient } from "./npm-client";
import { insertPackage } from "./queries";
import { delay } from "./utils";

const npmClient = new NPMRegistryClient({
  restEndpoint: "https://registry.npmjs.org",
});

const CONCURRENT_TASKS = 5; // Number of concurrent requests
const RATE_LIMIT_DELAY = 50; // ms between requests

async function processPackage(
  dbClient: PoolClient,
  packageName: string,
  publishDate: string,
  current: number,
  total: number
): Promise<void> {
  const startTime = Date.now();
  try {
    const creationDate = await npmClient.creationDate(packageName);
    await insertPackage(
      dbClient,
      packageName,
      new Date(creationDate),
      new Date(publishDate)
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${current}/${total}] ✓ ${packageName} (${duration}s)`);
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(
      `[${current}/${total}] ✗ ${packageName} (${duration}s):`,
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function processBatch(
  dbClient: PoolClient,
  packages: Array<{ name: string; date: string }>,
  startIndex: number,
  total: number
): Promise<void> {
  const tasks = packages.map((pkg, index) =>
    (async () => {
      await delay(index * RATE_LIMIT_DELAY); // Stagger the requests
      return processPackage(
        dbClient,
        pkg.name,
        pkg.date,
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
      const searchData = await npmClient.processSearches([
        {
          type: "author",
          username: "pyramation",
        },
        {
          type: "maintainer",
          username: "pyramation",
        },
        {
          type: "publisher",
          username: "pyramation",
        },
      ]);

      const totalPackages = searchData.objects.length;
      console.log(
        `Found ${totalPackages} packages to process with ${CONCURRENT_TASKS} concurrent tasks`
      );

      // Process packages in batches
      for (let i = 0; i < searchData.objects.length; i += CONCURRENT_TASKS) {
        const batch = searchData.objects
          .slice(i, i + CONCURRENT_TASKS)
          .map((obj) => obj.package);

        console.log(
          `\nProcessing batch ${Math.floor(i / CONCURRENT_TASKS) + 1}/${Math.ceil(
            searchData.objects.length / CONCURRENT_TASKS
          )}...`
        );

        await processBatch(dbClient, batch, i, totalPackages);
      }

      const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
      console.log(
        `\nAll packages processed successfully in ${duration} seconds!`
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

import { Database } from "@cosmology/db-client";
import { PoolClient } from "pg";
import { NPMRegistryClient } from "./npm-client";
import { insertPackage } from "./queries";
import { delay } from "./utils";
import { oldPackages } from "./old-packages";

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

async function analyzeMissingPackages(dbClient: PoolClient): Promise<void> {
  // Get all packages from the database
  const query = `
    SELECT package_name 
    FROM npm_count.npm_package 
    WHERE is_active = true
  `;
  const result = await dbClient.query(query);
  const currentPackages = new Set(result.rows.map((row) => row.package_name));

  // Find missing packages
  const missingPackages = oldPackages.filter(
    (pkg) => !currentPackages.has(pkg)
  );

  // Find new packages that weren't in the old list
  const newPackages = Array.from(currentPackages).filter(
    (pkg) => !oldPackages.includes(pkg)
  );

  console.log("\nPackage Analysis:");
  console.log("----------------");
  console.log(`Total packages in old list: ${oldPackages.length}`);
  console.log(`Total packages in database: ${currentPackages.size}`);

  if (missingPackages.length > 0) {
    console.log(`\nMissing packages (${missingPackages.length}):`);
    missingPackages.forEach((pkg) => console.log(`  - ${pkg}`));
  } else {
    console.log("\nNo missing packages! 🎉");
  }

  if (newPackages.length > 0) {
    console.log(`\nNew packages not in old list (${newPackages.length}):`);
    newPackages.forEach((pkg) => console.log(`  - ${pkg}`));
  }
}

async function run(): Promise<void> {
  const db = new Database();
  const scriptStartTime = Date.now();

  try {
    await db.withTransaction(async (dbClient: PoolClient) => {
      console.log("Fetching all packages from npm registry...");

      // Collect all packages from different search criteria
      const searchResults = await Promise.all([
        npmClient.getAllSearchResults({
          type: "author",
          username: "pyramation",
        }),
        npmClient.getAllSearchResults({
          type: "maintainer",
          username: "pyramation",
        }),
        npmClient.getAllSearchResults({
          type: "publisher",
          username: "pyramation",
        }),
      ]);

      // Merge and deduplicate packages
      const uniquePackages = new Map();
      searchResults.forEach((result) => {
        result.objects.forEach((obj) => {
          uniquePackages.set(obj.package.name, obj.package);
        });
      });

      const packages = Array.from(uniquePackages.values());
      const totalPackages = packages.length;

      console.log(
        `Found ${totalPackages} unique packages to process with ${CONCURRENT_TASKS} concurrent tasks`
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
        `\nAll packages processed successfully in ${duration} seconds!`
      );

      // Add package analysis
      await analyzeMissingPackages(dbClient);
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

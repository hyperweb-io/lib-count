import { Database } from "@cosmology/db-client";
import { PoolClient } from "pg";
import { NPMRegistryClient } from "../../npm-client";
import { insertPackage } from "../../queries";
import { delay } from "../../utils";
import { packages, blacklistConfig } from "./data-config";

const npmClient = new NPMRegistryClient({
  restEndpoint: "https://registry.npmjs.org",
});

const CONCURRENT_TASKS = 100; // Number of concurrent tasks
const RATE_LIMIT_DELAY = 50; // ms between requests

async function ensureCategories(
  dbClient: PoolClient,
  categoryNames: string[]
): Promise<Map<string, string>> {
  const categoryMap = new Map<string, string>();

  for (const name of categoryNames) {
    const result = await dbClient.query(
      `
      INSERT INTO npm_count.category (name)
      VALUES ($1)
      ON CONFLICT (name) DO UPDATE SET updated_at = now()
      RETURNING id
      `,
      [name]
    );
    categoryMap.set(name, result.rows[0].id);
  }

  return categoryMap;
}

async function updatePackageCategories(
  dbClient: PoolClient,
  packageName: string,
  categoryIds: string[]
): Promise<void> {
  await dbClient.query(
    `DELETE FROM npm_count.package_category WHERE package_id = $1`,
    [packageName]
  );

  if (categoryIds.length > 0) {
    const values = categoryIds.map((_, i) => `($1, $${i + 2})`).join(", ");
    await dbClient.query(
      `
      INSERT INTO npm_count.package_category (package_id, category_id)
      VALUES ${values}
      `,
      [packageName, ...categoryIds]
    );
  }
}

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
      await delay(index * RATE_LIMIT_DELAY);
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

async function processWhitelistAndCategories(
  dbClient: PoolClient
): Promise<void> {
  console.log("\nProcessing whitelist and categories...");

  // Collect all whitelisted packages with their categories
  const packageCategories = new Map<string, string[]>();
  Object.entries(packages).forEach(([category, packageNames]) => {
    packageNames.forEach((packageName) => {
      const categories = packageCategories.get(packageName) || [];
      categories.push(category);
      packageCategories.set(packageName, categories);
    });
  });

  // First, ensure all whitelisted packages exist in npm_package table
  const whitelistedPackages = Array.from(packageCategories.keys());
  await dbClient.query(
    `
    INSERT INTO npm_count.npm_package (package_name, creation_date, last_publish_date)
    SELECT 
      pkg.name,
      CURRENT_DATE,
      CURRENT_DATE
    FROM unnest($1::text[]) AS pkg(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM npm_count.npm_package WHERE package_name = pkg.name
    )
    `,
    [whitelistedPackages]
  );

  // Ensure all categories exist
  const categories = new Set(Object.keys(packages));
  const categoryMap = await ensureCategories(dbClient, Array.from(categories));

  // Update package categories
  for (const [packageName, categories] of packageCategories.entries()) {
    const categoryIds = categories.map((cat) => categoryMap.get(cat)!);
    await updatePackageCategories(dbClient, packageName, categoryIds);
    console.log(
      `✓ Updated ${packageName} with categories: ${categories.join(", ")}`
    );
  }

  // Deactivate packages not in whitelist
  const result = await dbClient.query(
    `
    UPDATE npm_count.npm_package 
    SET is_active = false, updated_at = now()
    WHERE package_name NOT IN (${whitelistedPackages
      .map((_, i) => `$${i + 1}`)
      .join(", ")})
    RETURNING package_name
    `,
    whitelistedPackages
  );

  if (result.rows.length > 0) {
    console.log("\nDeactivated non-whitelisted packages:");
    result.rows.forEach((row) => console.log(`- ${row.package_name}`));
  }
}

async function processBlacklist(dbClient: PoolClient): Promise<void> {
  console.log("\nProcessing blacklist...");

  // Deactivate packages in blacklisted namespaces and specific packages
  const result = await dbClient.query(
    `
    UPDATE npm_count.npm_package 
    SET is_active = false, updated_at = now()
    WHERE package_name LIKE ANY($1)
    OR package_name = ANY($2)
    RETURNING package_name
    `,
    [
      blacklistConfig.namespaces.map((namespace) => `${namespace}%`),
      blacklistConfig.packages,
    ]
  );

  if (result.rows.length > 0) {
    console.log("\nDeactivated blacklisted packages:");
    result.rows.forEach((row) => console.log(`- ${row.package_name}`));
  }
}

async function run(): Promise<void> {
  const db = new Database();
  const scriptStartTime = Date.now();

  try {
    await db.withTransaction(async (dbClient: PoolClient) => {
      console.log("Fetching all packages from npm registry...");

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

      for (let i = 0; i < packages.length; i += CONCURRENT_TASKS) {
        const batch = packages.slice(i, i + CONCURRENT_TASKS);
        await processBatch(dbClient, batch, i, totalPackages);
      }

      // Process whitelist and categories after fetching packages
      await processWhitelistAndCategories(dbClient);

      // Process blacklist after whitelist
      await processBlacklist(dbClient);

      const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
      console.log(
        `\nAll operations completed successfully in ${duration} seconds!`
      );
    });
  } catch (error) {
    const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
    console.error(`Transaction failed after ${duration} seconds:`, error);
    throw error;
  }
}

export function execute(): Promise<void> {
  return run()
    .then(() => {
      console.log(`Script completed successfully!`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`Script failed:`, error);
      process.exit(1);
    });
}

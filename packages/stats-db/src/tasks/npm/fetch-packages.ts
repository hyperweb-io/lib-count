import { db } from "../../db";
import { NPMRegistryClient, SearchOpts } from "../../npm-client";
import {
  packages as whitelistedPackages,
  blacklistConfig,
} from "./data-config";
import { delay } from "../../utils";
import { eq, sql, notInArray, inArray, like } from "drizzle-orm";
import { category, npmPackage, packageCategory } from "../../schema";
import { randomUUID } from "crypto";

const npmClient = new NPMRegistryClient({
  restEndpoint: "https://registry.npmjs.org",
});

const CONCURRENT_TASKS = 30; // Number of concurrent tasks
const RATE_LIMIT_DELAY = 50; // ms between requests

async function ensureCategories(
  categoryNames: string[]
): Promise<Map<string, string>> {
  const categoryMap = new Map<string, string>();

  for (const name of categoryNames) {
    const result = await db
      .insert(category)
      .values({
        name,
        createdAt: new Date(),
        updatedAt: new Date(),
        description: "",
        id: randomUUID(),
      })
      .onConflictDoUpdate({
        target: category.name,
        set: { updatedAt: new Date() },
      })
      .returning({ id: category.id });
    categoryMap.set(name, result[0].id);
  }

  return categoryMap;
}

async function updatePackageCategories(
  packageName: string,
  categoryIds: string[]
): Promise<void> {
  await db
    .delete(packageCategory)
    .where(eq(packageCategory.packageId, packageName));

  if (categoryIds.length > 0) {
    await db.insert(packageCategory).values(
      categoryIds.map((id) => ({
        packageId: packageName,
        categoryId: id,
        createdAt: new Date(),
      }))
    );
  }
}

async function processPackage(
  packageName: string,
  publishDate: string,
  current: number,
  total: number
): Promise<void> {
  const startTime = Date.now();
  try {
    const creationDate = await npmClient.creationDate(packageName);
    await db
      .insert(npmPackage)
      .values({
        packageName,
        creationDate: new Date(creationDate),
        lastPublishDate: new Date(publishDate),
      })
      .onConflictDoUpdate({
        target: npmPackage.packageName,
        set: {
          lastPublishDate: new Date(publishDate),
          lastFetchedDate: new Date(),
          isActive: true,
          updatedAt: new Date(),
        },
      });
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
  packages: Array<{ name: string; date: string }>,
  startIndex: number,
  total: number
): Promise<void> {
  const tasks = packages.map((pkg, index) =>
    (async () => {
      await delay(index * RATE_LIMIT_DELAY);
      return processPackage(pkg.name, pkg.date, startIndex + index + 1, total);
    })()
  );

  await Promise.all(tasks);
}

async function processWhitelistAndCategories(): Promise<void> {
  console.log("\nProcessing whitelist and categories...");

  // Collect all whitelisted packages with their categories
  const packageCategories = new Map<string, string[]>();
  Object.entries(whitelistedPackages).forEach(([category, packageNames]) => {
    packageNames.forEach((packageName) => {
      const categories = packageCategories.get(packageName) || [];
      categories.push(category);
      packageCategories.set(packageName, categories);
    });
  });

  // First, ensure all whitelisted packages exist in npm_package table
  const allWhitelistedPackages = Array.from(packageCategories.keys());
  await db
    .insert(npmPackage)
    .values(
      allWhitelistedPackages.map((p) => ({
        packageName: p,
        creationDate: new Date(),
        lastPublishDate: new Date(),
      }))
    )
    .onConflictDoNothing();

  // Ensure all categories exist
  const categories = new Set(Object.keys(whitelistedPackages));
  const categoryMap = await ensureCategories(Array.from(categories));

  // Update package categories
  for (const [packageName, categories] of packageCategories.entries()) {
    const categoryIds = categories.map((cat) => categoryMap.get(cat)!);
    await updatePackageCategories(packageName, categoryIds);
    console.log(
      `✓ Updated ${packageName} with categories: ${categories.join(", ")}`
    );
  }

  // Deactivate packages not in whitelist
  const result = await db
    .update(npmPackage)
    .set({ isActive: false, updatedAt: new Date() })
    .where(notInArray(npmPackage.packageName, allWhitelistedPackages))
    .returning({ packageName: npmPackage.packageName });

  if (result.length > 0) {
    console.log("\nDeactivated non-whitelisted packages:");
    result.forEach((row) => console.log(`- ${row.packageName}`));
  }
}

async function processBlacklist(): Promise<void> {
  console.log("\nProcessing blacklist...");

  const likeConditions = blacklistConfig.namespaces.map((ns) =>
    like(npmPackage.packageName, `${ns}%`)
  );
  const inCondition = inArray(npmPackage.packageName, blacklistConfig.packages);

  const result = await db
    .update(npmPackage)
    .set({ isActive: false, updatedAt: new Date() })
    .where(sql`${likeConditions.join(" OR ")} OR ${inCondition}`)
    .returning({ packageName: npmPackage.packageName });

  if (result.length > 0) {
    console.log("\nDeactivated blacklisted packages:");
    result.forEach((row) => console.log(`- ${row.packageName}`));
  }
}

async function run(): Promise<void> {
  const scriptStartTime = Date.now();

  try {
    console.log("Fetching all packages from npm registry...");

    const searchOpts: SearchOpts[] = [
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
    ];

    const { objects: packages } = await npmClient.processSearches(searchOpts);

    packages.sort(
      (a, b) => b.score.detail.popularity - a.score.detail.popularity
    );

    const totalPackages = packages.length;

    console.log(
      `Found ${totalPackages} unique packages to process with ${CONCURRENT_TASKS} concurrent tasks`
    );

    for (let i = 0; i < packages.length; i += CONCURRENT_TASKS) {
      const batch = packages
        .slice(i, i + CONCURRENT_TASKS)
        .map((p) => ({ name: p.package.name, date: p.package.date }));
      await processBatch(batch, i, totalPackages);
    }

    // Process whitelist and categories after fetching packages
    await processWhitelistAndCategories();

    // Process blacklist after whitelist
    await processBlacklist();

    const duration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
    console.log(
      `\nAll operations completed successfully in ${duration} seconds!`
    );
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

import { Database } from "@cosmology/db-client";
import { PoolClient } from "pg";
import * as fs from "fs";
import * as path from "path";
import { packages, readmeHiddenCategories, readmeCategoryOrder } from "../../config";
import {
  DownloadStats,
  PackageStats,
  CategoryStats,
  LifetimeStats,
  TotalStats,
} from "../../types";

function formatNumber(num: number): string {
  return num.toLocaleString();
}

const SNIPPETS_DIR = path.resolve(__dirname, "../readme-snippets");

function readSnippet(filename: string): string {
  return fs.readFileSync(path.join(SNIPPETS_DIR, filename), "utf-8");
}

async function getPackageStats(
  dbClient: PoolClient,
  packageName: string
): Promise<PackageStats | null> {
  const dataRangeCheck = await dbClient.query(
    `
    SELECT
      MIN(date) as oldest_date,
      MAX(date) as latest_date
    FROM npm_count.daily_downloads
    WHERE package_name = $1
    GROUP BY package_name
    `,
    [packageName]
  );

  if (dataRangeCheck.rows.length === 0) {
    return null;
  }

  const { oldest_date, latest_date: db_latest_date_str } =
    dataRangeCheck.rows[0];

  const clientNow = new Date();
  const clientNowDateString = clientNow.toISOString().split("T")[0];

  let effectiveLatestDate: Date;
  if (db_latest_date_str) {
    const dbLatestDate = new Date(db_latest_date_str);
    effectiveLatestDate = dbLatestDate > clientNow ? clientNow : dbLatestDate;
  } else {
    // No data for package, treat as very old, though dataRangeCheck should prevent this.
    // Fallback to a very old date if db_latest_date_str is null/undefined for some reason.
    effectiveLatestDate = new Date("1970-01-01");
  }
  const effectiveLatestDateString = effectiveLatestDate
    .toISOString()
    .split("T")[0];

  const daysSinceUpdate = Math.floor(
    (clientNow.getTime() - effectiveLatestDate.getTime()) / (1000 * 3600 * 24)
  );

  const isStale = true;

  let weekStartDateString: string;
  let monthStartDateString: string;

  if (isStale) {
    const weekStartDate = new Date(effectiveLatestDate);
    weekStartDate.setDate(effectiveLatestDate.getDate() - 7);
    weekStartDateString = weekStartDate.toISOString().split("T")[0];

    const monthStartDate = new Date(effectiveLatestDate);
    monthStartDate.setDate(effectiveLatestDate.getDate() - 30); // Approx month
    monthStartDateString = monthStartDate.toISOString().split("T")[0];
  } else {
    const weekStartDate = new Date(clientNow);
    weekStartDate.setDate(clientNow.getDate() - 7);
    weekStartDateString = weekStartDate.toISOString().split("T")[0];

    const monthStartDate = new Date(clientNow);
    monthStartDate.setDate(clientNow.getDate() - 30); // Approx month
    monthStartDateString = monthStartDate.toISOString().split("T")[0];
  }

  const result = await dbClient.query(
    `
    SELECT
      p.package_name,
      COALESCE(SUM(d.download_count), 0) as total_downloads,
      COALESCE(SUM(CASE WHEN d.date >= '${monthStartDateString}'::date AND d.date <= '${effectiveLatestDateString}'::date THEN d.download_count ELSE 0 END), 0) as monthly_downloads,
      COALESCE(SUM(CASE WHEN d.date >= '${weekStartDateString}'::date AND d.date <= '${effectiveLatestDateString}'::date THEN d.download_count ELSE 0 END), 0) as weekly_downloads
    FROM npm_count.npm_package p
    LEFT JOIN npm_count.daily_downloads d ON d.package_name = p.package_name
    WHERE p.package_name = $1 AND p.is_active = true
    GROUP BY p.package_name
    `,
    [packageName]
  );

  if (result.rows.length === 0) return null;

  const stats = {
    name: packageName,
    total: parseInt(result.rows[0].total_downloads),
    monthly: parseInt(result.rows[0].monthly_downloads),
    weekly: parseInt(result.rows[0].weekly_downloads),
  };
  console.log(`[getPackageStats] Calculated stats for ${packageName}:`, stats);
  return stats;
}

async function getCategoryStats(
  dbClient: PoolClient,
  category: string,
  packageNames: string[]
): Promise<CategoryStats> {
  const packageStats: PackageStats[] = [];
  const totalStats: DownloadStats = { total: 0, monthly: 0, weekly: 0 };

  for (const packageName of packageNames) {
    const stats = await getPackageStats(dbClient, packageName);
    if (stats) {
      packageStats.push(stats);
      totalStats.total += stats.total;
      totalStats.monthly += stats.monthly;
      totalStats.weekly += stats.weekly;
    }
  }

  return {
    ...totalStats,
    packages: packageStats.sort((a, b) => b.total - a.total),
  };
}

async function getLifetimeDownloadsByCategory(
  dbClient: PoolClient
): Promise<LifetimeStats> {
  const clientNow = new Date();
  const clientNowDateString = clientNow.toISOString().split("T")[0];

  // Get the overall MAX(date) from the database
  const overallMaxDateQuery = await dbClient.query(`
    SELECT MAX(date) as overall_max_db_date FROM npm_count.daily_downloads;
  `);

  let effectiveLatestDate: Date;
  let overallMaxDbDateStr: string | null = null;

  if (
    overallMaxDateQuery.rows.length > 0 &&
    overallMaxDateQuery.rows[0].overall_max_db_date
  ) {
    overallMaxDbDateStr = overallMaxDateQuery.rows[0].overall_max_db_date;
    const overallMaxDbDate = new Date(overallMaxDbDateStr);
    effectiveLatestDate =
      overallMaxDbDate > clientNow ? clientNow : overallMaxDbDate;
  } else {
    // No data in table, treat as very old.
    effectiveLatestDate = new Date("1970-01-01");
  }
  const effectiveLatestDateString = effectiveLatestDate
    .toISOString()
    .split("T")[0];

  const daysSinceUpdate = Math.floor(
    (clientNow.getTime() - effectiveLatestDate.getTime()) / (1000 * 3600 * 24)
  );
  const isStale = true;

  let weekStartDateString: string;
  let monthStartDateString: string;

  if (isStale) {
    const weekStartDate = new Date(effectiveLatestDate);
    weekStartDate.setDate(effectiveLatestDate.getDate() - 7);
    weekStartDateString = weekStartDate.toISOString().split("T")[0];

    const monthStartDate = new Date(effectiveLatestDate);
    monthStartDate.setDate(effectiveLatestDate.getDate() - 30); // Approx month
    monthStartDateString = monthStartDate.toISOString().split("T")[0];
  } else {
    const weekStartDate = new Date(clientNow);
    weekStartDate.setDate(clientNow.getDate() - 7);
    weekStartDateString = weekStartDate.toISOString().split("T")[0];

    const monthStartDate = new Date(clientNow);
    monthStartDate.setDate(clientNow.getDate() - 30); // Approx month
    monthStartDateString = monthStartDate.toISOString().split("T")[0];
  }

  const result = await dbClient.query(`
    WITH total_stats AS (
      SELECT COALESCE(SUM(download_count), 0) as total_lifetime_downloads
      FROM npm_count.daily_downloads
    ),
    package_stats AS (
      SELECT
        p.package_name,
        COALESCE(SUM(d.download_count), 0) as total_downloads,
        COALESCE(SUM(CASE WHEN d.date >= '${monthStartDateString}'::date AND d.date <= '${effectiveLatestDateString}'::date THEN d.download_count ELSE 0 END), 0) as monthly_downloads,
        COALESCE(SUM(CASE WHEN d.date >= '${weekStartDateString}'::date AND d.date <= '${effectiveLatestDateString}'::date THEN d.download_count ELSE 0 END), 0) as weekly_downloads
      FROM npm_count.npm_package p
      LEFT JOIN npm_count.daily_downloads d ON d.package_name = p.package_name
      WHERE p.is_active = true
      GROUP BY p.package_name
    )
    SELECT
      ps.*,
      t.total_lifetime_downloads
    FROM package_stats ps
    CROSS JOIN total_stats t;
  `);

  let totalLifetimeDownloads = 0;
  const allPackages = new Map<string, PackageStats>();

  result.rows.forEach((row, index) => {
    if (index === 0) {
      totalLifetimeDownloads = parseInt(row.total_lifetime_downloads);
    }
    allPackages.set(row.package_name, {
      name: row.package_name,
      total: parseInt(row.total_downloads || "0"),
      monthly: parseInt(row.monthly_downloads || "0"),
      weekly: parseInt(row.weekly_downloads || "0"),
    });
  });

  const categorizedPackagesSet = new Set<string>();
  Object.values(packages).forEach((pkgList) =>
    pkgList.forEach((pkg) => categorizedPackagesSet.add(pkg))
  );

  const uncategorizedPackages: PackageStats[] = [];
  for (const [packageName, stats] of allPackages) {
    if (!categorizedPackagesSet.has(packageName)) {
      uncategorizedPackages.push(stats);
    }
  }

  return {
    total: totalLifetimeDownloads,
    byCategory: {}, // This was not fully populated in original, keeping simple
    uncategorizedPackages: uncategorizedPackages.sort(
      (a, b) => b.total - a.total
    ),
  };
}

// --- README Generation specific functions ---

function generateOverallStatsTable(totals: TotalStats): string {
  const lines = [
    `## Overall Download Statistics\n`,
    "| Category | Total | Monthly | Weekly |",
    "| ------- | ------ | ------- | ----- |",
    `| **Total** | ${formatNumber(totals.total.total)} | ${formatNumber(totals.total.monthly)} | ${formatNumber(totals.total.weekly)} |`,
    `| Cloud | ${formatNumber(totals.cloud.total)} | ${formatNumber(totals.cloud.monthly)} | ${formatNumber(totals.cloud.weekly)} |`,
    `| Chain | ${formatNumber(totals.chain.total)} | ${formatNumber(totals.chain.monthly)} | ${formatNumber(totals.chain.weekly)} |`,
    `| Utilities | ${formatNumber(totals.utils.total)} | ${formatNumber(totals.utils.monthly)} | ${formatNumber(totals.utils.weekly)} |`,
  ];
  return lines.join("\n") + "\n\n"; // Ensure blank line after the table
}

function generateBadgesSection(repoName: string): string {
  const rawBaseRepoUrl = `https://raw.githubusercontent.com/${repoName}/main/output/badges/`;
  const encodedTotalDownloadsUrl = encodeURIComponent(
    `${rawBaseRepoUrl}total_downloads.json`
  );
  const encodedMonthlyDownloadsUrl = encodeURIComponent(
    `${rawBaseRepoUrl}monthly_downloads.json`
  );
  const encodedWeeklyDownloadsUrl = encodeURIComponent(
    `${rawBaseRepoUrl}weekly_downloads.json`
  );
  const encodedConstructiveCategoryUrl = encodeURIComponent(
    `${rawBaseRepoUrl}constructive_category.json`
  );
  const encodedHyperwebCategoryUrl = encodeURIComponent(
    `${rawBaseRepoUrl}hyperweb_category.json`
  );
  const encodedUtilsCategoryUrl = encodeURIComponent(
    `${rawBaseRepoUrl}utils_category.json`
  );

  return `
<p align="center" width="100%">
   <img src="https://raw.githubusercontent.com/${repoName}/refs/heads/main/assets/logo.svg" alt="constructive" width="80"><br />
   <a href="https://github.com/${repoName}">
      <img height="20" src="https://img.shields.io/endpoint?url=${encodedTotalDownloadsUrl}"/>
   </a>
   <a href="https://github.com/${repoName}">
      <img height="20" src="https://img.shields.io/endpoint?url=${encodedMonthlyDownloadsUrl}"/>
   </a>
   <a href="https://github.com/${repoName}">
      <img height="20" src="https://img.shields.io/endpoint?url=${encodedWeeklyDownloadsUrl}"/>
   </a>
   <br>
   <a href="https://github.com/${repoName}">
      <img height="20" src="https://img.shields.io/endpoint?url=${encodedConstructiveCategoryUrl}"/>
   </a>
   <a href="https://github.com/${repoName}">
      <img height="20" src="https://img.shields.io/endpoint?url=${encodedHyperwebCategoryUrl}"/>
   </a>
   <a href="https://github.com/${repoName}">
      <img height="20" src="https://img.shields.io/endpoint?url=${encodedUtilsCategoryUrl}"/>
   </a>
</p>

`; // Ensured two newlines at the end to create a blank line before the next section
}

function generateToolsTable(
  repoName: string,
  categoryPackageStats: Map<string, CategoryStats>
): string {
  const getCategoryTotal = (categoryKey: string): string => {
    const stats = categoryPackageStats.get(categoryKey);
    return stats ? formatNumber(stats.total) : "0";
  };
  const productBadgeUrl = (categoryName: string): string => {
    const rawProductUrl = `https://raw.githubusercontent.com/${repoName}/main/badges/products/${categoryName}/total.json`;
    return `https://img.shields.io/endpoint?url=${encodeURIComponent(rawProductUrl)}`;
  };

  return `
| Category             | Tools                                                                                                                  | Downloads                                                                                                 |
|----------------------|------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| **Chain Information**   | [**Chain Registry**](https://github.com/hyperweb-io/chain-registry), [**Utils**](https://www.npmjs.com/package/@chain-registry/utils), [**Client**](https://www.npmjs.com/package/@chain-registry/client) | ![Chain Registry](${productBadgeUrl("chain-registry")}) |
| **Wallet Connectors**| [**Interchain Kit**](https://github.com/hyperweb-io/interchain-kit), [**Cosmos Kit**](https://github.com/hyperweb-io/cosmos-kit) | ![Wallet Connectors](${productBadgeUrl("cosmos-kit")}) |
| **Signing Clients**          | [**InterchainJS**](https://github.com/hyperweb-io/interchainjs), [**CosmJS**](https://github.com/cosmos/cosmjs) | ![Signers](${productBadgeUrl("cosmos-kit")}) |
| **SDK Clients**              | [**Telescope**](https://github.com/hyperweb-io/telescope)                                                          | ![SDK](${productBadgeUrl("telescope")}) |
| **Starter Kits**     | [**Create Interchain App**](https://github.com/hyperweb-io/create-interchain-app), [**Create Cosmos App**](https://github.com/hyperweb-io/create-cosmos-app) | ![Starter Kits](${productBadgeUrl("create-cosmos-app")}) |
| **UI Kits**          | [**Interchain UI**](https://github.com/hyperweb-io/interchain-ui)                                                   | ![UI Kits](${productBadgeUrl("interchain-ui")}) |
| **Testing Frameworks**          | [**Starship**](https://github.com/hyperweb-io/starship)                                                             | ![Testing](${productBadgeUrl("starship")}) |
| **TypeScript Smart Contracts** | [**Create Hyperweb App**](https://github.com/hyperweb-io/create-hyperweb-app)                              | ![TypeScript Smart Contracts](${productBadgeUrl("hyperwebjs")}) |
| **CosmWasm Contracts** | [**CosmWasm TS Codegen**](https://github.com/CosmWasm/ts-codegen)                                                   | ![CosmWasm Contracts](${productBadgeUrl("cosmwasm")}) |
`;
}

function getSortedVisibleCategories(): string[] {
  const visibleCategories = Object.keys(packages).filter(
    (key) => !readmeHiddenCategories.includes(key)
  );
  return visibleCategories.sort((a, b) => {
    const aIndex = readmeCategoryOrder.indexOf(a);
    const bIndex = readmeCategoryOrder.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });
}

const MIN_DOWNLOADS_THRESHOLD = 1000;

function categoryHasVisiblePackages(categoryData: CategoryStats): boolean {
  if (!categoryData.packages || categoryData.packages.length === 0) {
    return false;
  }
  return categoryData.packages.some((pkg) => pkg.total >= MIN_DOWNLOADS_THRESHOLD);
}

function generateCategorySections(categoryStatsMap: Map<string, CategoryStats>): string {
  const categoryKeys = getSortedVisibleCategories();

  // Filter to only categories with at least one visible package
  const visibleCategoryKeys = categoryKeys.filter((categoryName) => {
    const categoryData = categoryStatsMap.get(categoryName);
    return categoryData && categoryHasVisiblePackages(categoryData);
  });

  let content = generateToc(visibleCategoryKeys);
  for (const categoryName of visibleCategoryKeys) {
    const categoryData = categoryStatsMap.get(categoryName);
    if (categoryData) {
      content += generateCategoryTableSection(categoryName, categoryData);
    }
  }
  return content;
}

function generateToc(packageCategories: string[]): string {
  const tocTitle = "## Table of Contents\n\n";
  const tocItems = packageCategories.map((categoryName) => {
    // Convert categoryName to a suitable anchor link format
    // Typically: lowercase and replace non-alphanumeric with hyphens
    // For simple one-word or hyphenated names, toLowerCase is often enough.
    const anchor = categoryName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    return `- [${categoryName}](#${anchor})`;
  });
  return tocTitle + tocItems.join("\n") + "\n\n"; // Ensure a blank line after the ToC list
}

function generateCategoryTableSection(
  categoryName: string,
  categoryData: CategoryStats
): string {
  const lines: string[] = [];
  // Ensure the generated anchor matches the ToC link logic
  const anchor = categoryName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  lines.push(`### ${categoryName}
`); // The heading itself does not need the anchor in its text
  lines.push("| Name | Total | Monthly | Weekly |");
  lines.push("| ------- | ------ | ------- | ----- |");
  lines.push(
    `| _Total_ | ${formatNumber(categoryData.total)} | ${formatNumber(categoryData.monthly)} | ${formatNumber(categoryData.weekly)} |`
  );

  let hiddenCount = 0;
  if (categoryData.packages && categoryData.packages.length > 0) {
    categoryData.packages.forEach((pkg) => {
      if (pkg.total >= MIN_DOWNLOADS_THRESHOLD) {
        lines.push(
          `| [${pkg.name}](https://www.npmjs.com/package/${pkg.name}) | ${formatNumber(pkg.total)} | ${formatNumber(pkg.monthly)} | ${formatNumber(pkg.weekly)} |`
        );
      } else {
        hiddenCount++;
      }
    });
  }

  if (hiddenCount > 0) {
    lines.push(`| *${hiddenCount} package${hiddenCount > 1 ? 's' : ''} hidden (< ${formatNumber(MIN_DOWNLOADS_THRESHOLD)} downloads)* | | | |`);
  }

  return lines.join("\n") + "\n\n";
}

function generateTimestampComment(repoBaseName: string): string {
  return `\n\n<!-- README.md automatically generated on ${new Date().toISOString()} from ${repoBaseName} repository with latest download stats -->\n`;
}

export async function generateReadmeNew(): Promise<string> {
  const db = new Database();
  let readmeContent = "# Constructive NPM Downloads\n";
  let repoName = "constructive-io/lib-count";
  let repoBaseName = "lib-count";

  // Initialize categoryStatsMap and totals
  const categoryStatsMap = new Map<string, CategoryStats>();
  let totals: TotalStats = {
    cloud: { total: 0, monthly: 0, weekly: 0 },
    chain: { total: 0, monthly: 0, weekly: 0 },
    utils: { total: 0, monthly: 0, weekly: 0 },
    total: { total: 0, monthly: 0, weekly: 0 },
    lifetime: 0,
  };

  try {
    const packageJsonPath = path.resolve(
      __dirname,
      "../../../../../package.json"
    );
    if (fs.existsSync(packageJsonPath)) {
      const packageJsonData = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf8")
      );
      const repoUrl = packageJsonData.repository?.url || "";
      if (repoUrl) {
        const githubPrefix = "github.com/";
        const startIndex = repoUrl.indexOf(githubPrefix);
        if (startIndex !== -1) {
          const pathStart = startIndex + githubPrefix.length;
          const endIndex = repoUrl.indexOf(".git", pathStart);
          const extractedName =
            endIndex !== -1
              ? repoUrl.substring(pathStart, endIndex)
              : repoUrl.substring(pathStart);
          if (extractedName) {
            repoName = extractedName;
            repoBaseName = extractedName.split("/")[1] || repoBaseName;
          }
        }
      }
    }
  } catch (e) {
    console.warn(
      "Could not read package.json for repository name, using defaults.",
      e
    );
  }

  try {
    await db.withTransaction(async (dbClient: PoolClient) => {
      // 1. Fetch lifetime statistics
      const lifetimeStats = await getLifetimeDownloadsByCategory(dbClient);
      totals.lifetime = lifetimeStats.total;
      // Set the grand total for downloads (all-time)
      totals.total.total = lifetimeStats.total;

      // 2. Fetch and process category-specific statistics
      for (const [categoryKey, packageNames] of Object.entries(packages)) {
        const stats = await getCategoryStats(
          dbClient,
          categoryKey,
          packageNames
        );
        categoryStatsMap.set(categoryKey, stats);

        // 3. Aggregate into totals.cloud, totals.chain, totals.utils
        if (categoryKey === "launchql" || categoryKey === "pgpm" || categoryKey === "kubernetesjs") {
          totals.cloud.total += stats.total;
          totals.cloud.monthly += stats.monthly;
          totals.cloud.weekly += stats.weekly;
        } else if (categoryKey === "utils") {
          totals.utils.total += stats.total;
          totals.utils.monthly += stats.monthly;
          totals.utils.weekly += stats.weekly;
        } else {
          // All other explicit categories are considered chain
          totals.chain.total += stats.total;
          totals.chain.monthly += stats.monthly;
          totals.chain.weekly += stats.weekly;
        }
      }

      // 4. Add uncategorized packages to the utils category totals
      for (const pkg of lifetimeStats.uncategorizedPackages) {
        totals.utils.total += pkg.total;
        totals.utils.monthly += pkg.monthly;
        totals.utils.weekly += pkg.weekly;
      }

      // 5. Calculate final overall monthly and weekly totals
      totals.total.monthly =
        totals.cloud.monthly + totals.chain.monthly + totals.utils.monthly;
      totals.total.weekly =
        totals.cloud.weekly + totals.chain.weekly + totals.utils.weekly;
    });
  } catch (error) {
    console.error("Failed to fetch data for README generation:", error);
    return "# Hyperweb\n\nError generating README content.";
  }

  // Assemble README sections
  readmeContent += generateBadgesSection(repoName);
  readmeContent += readSnippet("intro.md");
  readmeContent += generateOverallStatsTable(totals);
  readmeContent += readSnippet("database-stack-intro.md");
  readmeContent += readSnippet("database-tooling.md");
  readmeContent += readSnippet("interchain-stack-intro.md");
  readmeContent += generateToolsTable(repoName, categoryStatsMap);
  readmeContent += generateCategorySections(categoryStatsMap);
  readmeContent += readSnippet("stack-announcement.md");
  readmeContent += readSnippet("rebrand-info.md");
  readmeContent += readSnippet("whats-next.md");
  readmeContent += readSnippet("thank-you.md");
  readmeContent += readSnippet("understanding-downloads.md");
  readmeContent += readSnippet("credits-disclaimer.md");
  readmeContent += generateTimestampComment(repoBaseName);

  return "\n" + readmeContent;
}

export async function generateAndWriteReadme(): Promise<void> {
  try {
    const readme = await generateReadmeNew();
    fs.writeFileSync(
      path.resolve(__dirname, "../../../../../README.md"),
      readme
    );
    console.log("New README generated");
  } catch (error) {
    console.error("Error in main:", error);
  }
}

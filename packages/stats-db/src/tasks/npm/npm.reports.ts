import { Database } from "@cosmology/db-client";
import { PoolClient } from "pg";
import { packages, brandRollupFor } from "../../config";
import * as fs from "fs";
import * as path from "path";
import {
  DownloadStats,
  PackageStats,
  CategoryStats,
  TotalStats,
  LifetimeStats,
} from "../../types";

async function getPackageStats(
  dbClient: PoolClient,
  packageName: string
): Promise<PackageStats | null> {
  // First, check the date range of available data for this package
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

  const { latest_date: db_latest_date_str } = dataRangeCheck.rows[0];

  const clientNow = new Date();

  let effectiveLatestDate: Date;
  if (db_latest_date_str) {
    const dbLatestDate = new Date(db_latest_date_str);
    effectiveLatestDate = dbLatestDate > clientNow ? clientNow : dbLatestDate;
  } else {
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
    monthStartDate.setDate(effectiveLatestDate.getDate() - 30);
    monthStartDateString = monthStartDate.toISOString().split("T")[0];
  } else {
    const weekStartDate = new Date(clientNow);
    weekStartDate.setDate(clientNow.getDate() - 7);
    weekStartDateString = weekStartDate.toISOString().split("T")[0];

    const monthStartDate = new Date(clientNow);
    monthStartDate.setDate(clientNow.getDate() - 30);
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

  // Log category totals
  console.log(`Category ${category} totals:`, {
    total: totalStats.total,
    monthly: totalStats.monthly,
    weekly: totalStats.weekly,
  });

  return {
    ...totalStats,
    packages: packageStats.sort((a, b) => b.total - a.total),
  };
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function generateCategorySection(
  category: string,
  stats: CategoryStats
): string {
  const lines = [
    `### ${category}\n`,
    "| Name | Total | Monthly | Weekly |",
    "| ------- | ------ | ------- | ----- |",
    `| *Total* | ${formatNumber(stats.total)} | ${formatNumber(
      stats.monthly
    )} | ${formatNumber(stats.weekly)} |`,
  ];

  stats.packages.forEach((pkg) => {
    lines.push(
      `| [${pkg.name}](https://www.npmjs.com/package/${pkg.name}) | ${formatNumber(
        pkg.total
      )} | ${formatNumber(pkg.monthly)} | ${formatNumber(pkg.weekly)} |`
    );
  });

  return lines.join("\n") + "\n";
}

function generateTotalSection(totals: TotalStats): string {
  return `### Recent Downloads

| Name | Total | Monthly | Weekly |
| ------- | ------ | ------- | ----- |
| *Total* | ${formatNumber(totals.total.total)} | ${formatNumber(
    totals.total.monthly
  )} | ${formatNumber(totals.total.weekly)} |
| Cloud | ${formatNumber(totals.cloud.total)} | ${formatNumber(
    totals.cloud.monthly
  )} | ${formatNumber(totals.cloud.weekly)} |
| Chain | ${formatNumber(totals.chain.total)} | ${formatNumber(
    totals.chain.monthly
  )} | ${formatNumber(totals.chain.weekly)} |
| Utils | ${formatNumber(totals.utils.total)} | ${formatNumber(
    totals.utils.monthly
  )} | ${formatNumber(totals.utils.weekly)} |\n`;
}

async function getLifetimeDownloadsByCategory(
  dbClient: PoolClient
): Promise<LifetimeStats> {
  console.log("Executing getLifetimeDownloadsByCategory...");

  // Let's check if there is any recent data in the daily_downloads table
  const recentDataCheck = await dbClient.query(`
    SELECT 
      MIN(date) as oldest_date,
      MAX(date) as newest_date,
      CURRENT_DATE - MAX(date) as days_since_update,
      COUNT(*) as total_records,
      COUNT(CASE WHEN date >= NOW() - INTERVAL '7 days' THEN 1 ELSE NULL END) as records_last_week
    FROM npm_count.daily_downloads;
  `);

  let latestDate: string | null = null;
  let isDataStale = false;
  let weekStart = "NOW() - INTERVAL '7 days'";
  let monthStart = "NOW() - INTERVAL '30 days'";

  if (recentDataCheck.rows.length > 0) {
    const dataInfo = recentDataCheck.rows[0];
    latestDate = dataInfo.newest_date;
    const daysSinceUpdate = parseInt(dataInfo.days_since_update);
    isDataStale = daysSinceUpdate > 7; // Consider data stale if more than 7 days old

    console.log("Daily downloads data range:", {
      oldest_date: dataInfo.oldest_date,
      newest_date: latestDate,
      days_since_update: daysSinceUpdate,
      total_records: dataInfo.total_records,
      records_last_week: dataInfo.records_last_week,
      is_stale: isDataStale,
    });

    if (isDataStale) {
      // If data is stale, use the last available week/month of data
      weekStart = `'${latestDate}'::date - INTERVAL '7 days'`;
      monthStart = `'${latestDate}'::date - INTERVAL '30 days'`;
      console.log(`Using historical data periods relative to ${latestDate}`);
    }
  } else {
    console.log("No data found in daily_downloads table");
    return {
      total: 0,
      byCategory: {},
      uncategorizedPackages: [],
    };
  }

  // Get all packages and their stats with adjusted date ranges
  // Build the date bound condition for stale data
  const monthDateBound = isDataStale ? ` AND d.date <= '${latestDate}'::date` : "";
  const weekDateBound = isDataStale ? ` AND d.date <= '${latestDate}'::date` : "";

  const result = await dbClient.query(`
    WITH total_stats AS (
      SELECT COALESCE(SUM(download_count), 0) as total_lifetime_downloads
      FROM npm_count.daily_downloads
    ),
    package_stats AS (
      SELECT 
        p.package_name,
        COALESCE(SUM(d.download_count), 0) as total_downloads,
        COALESCE(SUM(CASE WHEN d.date >= ${monthStart}${monthDateBound} THEN d.download_count ELSE 0 END), 0) as monthly_downloads,
        COALESCE(SUM(CASE WHEN d.date >= ${weekStart}${weekDateBound} THEN d.download_count ELSE 0 END), 0) as weekly_downloads
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

  console.log("Total rows returned from DB:", result.rows.length);

  // Log a few sample rows to see the data structure and values
  if (result.rows.length > 0) {
    console.log("Sample row 1:", JSON.stringify(result.rows[0]));
    if (result.rows.length > 1) {
      console.log("Sample row 2:", JSON.stringify(result.rows[1]));
    }
  }

  let totalLifetimeDownloads = 0;
  const allPackages = new Map<string, PackageStats>();

  // Process all packages first
  result.rows.forEach((row, index) => {
    if (index === 0) {
      totalLifetimeDownloads = parseInt(row.total_lifetime_downloads);
      console.log("Total lifetime downloads:", totalLifetimeDownloads);
    }

    const packageStats: PackageStats = {
      name: row.package_name,
      total: parseInt(row.total_downloads),
      monthly: parseInt(row.monthly_downloads),
      weekly: parseInt(row.weekly_downloads),
    };

    // Log some packages with their weekly downloads to verify data
    if (packageStats.weekly > 0 && index < 5) {
      console.log(`Found package with weekly downloads: ${packageStats.name}`, {
        total: packageStats.total,
        monthly: packageStats.monthly,
        weekly: packageStats.weekly,
      });
    }

    allPackages.set(row.package_name, packageStats);
  });

  // Debug output for packages
  console.log("Total packages in DB:", allPackages.size);

  // Count packages with non-zero weekly downloads
  let packagesWithWeeklyDownloads = 0;
  for (const [, stats] of allPackages) {
    if (stats.weekly > 0) {
      packagesWithWeeklyDownloads++;
    }
  }
  console.log(
    `Packages with weekly downloads > 0: ${packagesWithWeeklyDownloads} out of ${allPackages.size}`
  );

  // Create a set of categorized packages from data-config
  const categorizedPackages = new Set<string>();
  for (const [category, packageList] of Object.entries(packages)) {
    console.log(`Category ${category} has ${packageList.length} packages`);
    packageList.forEach((pkg) => categorizedPackages.add(pkg));
  }

  console.log(
    "Total categorized packages from config:",
    categorizedPackages.size
  );

  // Find uncategorized packages
  const uncategorizedPackages: PackageStats[] = [];
  const uncategorizedTotals = { total: 0, monthly: 0, weekly: 0 };

  for (const [packageName, stats] of allPackages) {
    if (!categorizedPackages.has(packageName)) {
      if (stats.weekly > 0) {
        console.log(
          `Uncategorized package with weekly downloads: ${packageName}`,
          {
            total: stats.total,
            monthly: stats.monthly,
            weekly: stats.weekly,
          }
        );
      }

      uncategorizedPackages.push(stats);
      uncategorizedTotals.total += stats.total;
      uncategorizedTotals.monthly += stats.monthly;
      uncategorizedTotals.weekly += stats.weekly;
    }
  }

  console.log("Uncategorized totals:", uncategorizedTotals);
  console.log(
    "Total uncategorized packages found:",
    uncategorizedPackages.length
  );

  const stats: LifetimeStats = {
    total: totalLifetimeDownloads,
    byCategory: {},
    uncategorizedPackages: uncategorizedPackages.sort(
      (a, b) => b.total - a.total
    ),
  };

  return stats;
}

function generateUncategorizedSection(packages: PackageStats[]): string {
  if (packages.length === 0) return "";

  const lines = [
    `### Uncategorized Packages\n`,
    "| Name | Total | Monthly | Weekly |",
    "| ------- | ------ | ------- | ----- |",
  ];

  packages
    .sort((a, b) => b.total - a.total)
    .forEach((pkg) => {
      lines.push(
        `| [${pkg.name}](https://www.npmjs.com/package/${pkg.name}) | ${formatNumber(
          pkg.total
        )} | ${formatNumber(pkg.monthly)} | ${formatNumber(pkg.weekly)} |`
      );
    });

  return lines.join("\n") + "\n";
}

/**
 * Format large numbers with K, M suffixes for badge display
 * Similar to the human-format library used in old implementation
 * @param num Number to format
 * @returns Formatted string like "41.6M" or "697.4k"
 */
function formatNumberForBadge(num: number): string {
  if (num === 0) return "0";

  if (num >= 1_000_000) {
    // For millions, format with one decimal place
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  } else if (num >= 1_000) {
    // For thousands, format with one decimal place
    return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  } else {
    return num.toString();
  }
}

/**
 * Create a badge JSON object in the format required by shields.io
 */
function createBadgeJson(label: string, message: string, color: string): any {
  return {
    schemaVersion: 1,
    label,
    message,
    color,
  };
}

/**
 * Write badge JSON to file
 */
function writeBadgeFile(
  outputDir: string,
  filename: string,
  badgeData: any
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(badgeData));
  console.log(`Badge file written to ${filePath}`);
}

function ensureEmptyDirectory(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDirectoryContents(srcDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryContents(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Get the current timestamp in YYYY-MM-DD format
 */
function getCurrentTimestamp(): string {
  const now = new Date();
  return now.toISOString().split("T")[0]; // Format as YYYY-MM-DD
}

/**
 * Generate all badges based on download statistics
 */
async function generateBadges(
  totals: TotalStats,
  categoryStats: Map<string, CategoryStats>
): Promise<void> {
  console.log("Generating badges with the following download numbers:");
  console.log(
    `Total downloads: ${totals.total.total} (Badge: ${formatNumberForBadge(totals.total.total)})`
  );
  console.log(
    `Monthly downloads: ${totals.total.monthly} (Badge: ${formatNumberForBadge(totals.total.monthly)}/month)`
  );
  console.log(
    `Weekly downloads: ${totals.total.weekly} (Badge: ${formatNumberForBadge(totals.total.weekly)}/week)`
  );
  console.log(
    `Chain downloads: ${totals.chain.total} (Badge: ${formatNumberForBadge(totals.chain.total)} downloads)`
  );
  console.log(
    `Cloud downloads: ${totals.cloud.total} (Badge: ${formatNumberForBadge(totals.cloud.total)} downloads)`
  );
  console.log(
    `Utils downloads: ${totals.utils.total} (Badge: ${formatNumberForBadge(totals.utils.total)} downloads)`
  );

  // Set output directory for badges - using 'badges' as the top-level folder at project root
  // Updated to use hyperweb-contributions repository structure
  const basePath = path.resolve(__dirname, "../../../../../output/badges");
  ensureEmptyDirectory(basePath);
  const libCountOutputDir = path.join(basePath, "lib-count");
  const productsOutputDir = path.join(basePath, "products");

  console.log(`Badges will be saved to: ${basePath}`);

  // Generate total downloads badge
  const totalDownloads = createBadgeJson(
    "downloads",
    formatNumberForBadge(totals.total.total),
    "#4EC428"
  );
  writeBadgeFile(libCountOutputDir, "total_downloads.json", totalDownloads);

  // Generate monthly downloads badge
  const monthlyDownloads = createBadgeJson(
    "downloads",
    `${formatNumberForBadge(totals.total.monthly)}/month`,
    "#1C7EBE"
  );
  writeBadgeFile(libCountOutputDir, "monthly_downloads.json", monthlyDownloads);

  // Generate weekly downloads badge
  const weeklyDownloads = createBadgeJson(
    "downloads",
    `${formatNumberForBadge(totals.total.weekly)}/week`,
    "orange"
  );
  writeBadgeFile(libCountOutputDir, "weekly_downloads.json", weeklyDownloads);

  // Generate category badges with the correct colors from old implementation
  // Chain (cosmology/hyperweb) category badge
  const chainBadge = createBadgeJson(
    "Chain",
    `${formatNumberForBadge(totals.chain.total)} downloads`,
    "#A96DFF"
  );
  writeBadgeFile(libCountOutputDir, "cosmology_category.json", chainBadge);
  writeBadgeFile(libCountOutputDir, "hyperweb_category.json", chainBadge);

  // Cloud (constructive) category badge - primary badge
  const cloudBadge = createBadgeJson(
    "Cloud",
    `${formatNumberForBadge(totals.cloud.total)} downloads`,
    "#01A1FF"
  );
  writeBadgeFile(libCountOutputDir, "constructive_category.json", cloudBadge);
  // Keep launchql_category.json for backwards compatibility (old npm versions may reference it)
  writeBadgeFile(libCountOutputDir, "launchql_category.json", cloudBadge);

  // Utils category badge
  const utilsBadge = createBadgeJson(
    "Utilities",
    `${formatNumberForBadge(totals.utils.total)} downloads`,
    "#4EC428"
  );
  writeBadgeFile(libCountOutputDir, "utils_category.json", utilsBadge);

  // Generate per-product badges
  console.log("Generating per-product badges...");

  for (const [category, stats] of categoryStats) {
    console.log(`Generating badges for ${category}...`);
    const productOutputDir = path.join(productsOutputDir, category);

    // Create badge and numerical data for total downloads
    const productTotalBadge = createBadgeJson(
      "downloads",
      formatNumberForBadge(stats.total),
      "#4EC428"
    );
    writeBadgeFile(productOutputDir, "total.json", productTotalBadge);

    const productTotalNum = {
      period: "total",
      amount: stats.total,
    };
    writeBadgeFile(productOutputDir, "total-num.json", productTotalNum);

    // Create badge and numerical data for monthly downloads
    const productMonthlyBadge = createBadgeJson(
      "downloads",
      `${formatNumberForBadge(stats.monthly)}/month`,
      "#1C7EBE"
    );
    writeBadgeFile(productOutputDir, "monthly.json", productMonthlyBadge);

    const productMonthlyNum = {
      period: "monthly",
      amount: stats.monthly,
    };
    writeBadgeFile(productOutputDir, "monthly-num.json", productMonthlyNum);

    // Create badge and numerical data for weekly downloads
    const productWeeklyBadge = createBadgeJson(
      "downloads",
      `${formatNumberForBadge(stats.weekly)}/week`,
      "orange"
    );
    writeBadgeFile(productOutputDir, "weekly.json", productWeeklyBadge);

    const productWeeklyNum = {
      period: "weekly",
      amount: stats.weekly,
    };
    writeBadgeFile(productOutputDir, "weekly-num.json", productWeeklyNum);
  }

  console.log(
    "All badges generated successfully for hyperweb-contributions repository"
  );

  // Sync lib-count badges to output/badges root
  copyDirectoryContents(libCountOutputDir, basePath);

  // Mirror output/badges to top-level badges directory
  const repoBadgesDir = path.resolve(__dirname, "../../../../../badges");
  ensureEmptyDirectory(repoBadgesDir);
  copyDirectoryContents(basePath, repoBadgesDir);
}

async function generateReport(): Promise<string> {
  const db = new Database();
  const categoryStats = new Map<string, CategoryStats>();
  const totals: TotalStats = {
    cloud: { total: 0, monthly: 0, weekly: 0 },
    chain: { total: 0, monthly: 0, weekly: 0 },
    utils: { total: 0, monthly: 0, weekly: 0 },
    total: { total: 0, monthly: 0, weekly: 0 },
    lifetime: 0,
  };

  try {
    let lifetimeStats: LifetimeStats;

    await db.withTransaction(async (dbClient: PoolClient) => {
      // Get lifetime stats first
      lifetimeStats = await getLifetimeDownloadsByCategory(dbClient);
      totals.lifetime = lifetimeStats.total;

      // Add uncategorized package stats to utils category first
      for (const pkg of lifetimeStats.uncategorizedPackages) {
        totals.utils.total += pkg.total;
        totals.utils.monthly += pkg.monthly;
        totals.utils.weekly += pkg.weekly;
      }

      // Gather stats for each category from data-config
      for (const [category, packageNames] of Object.entries(packages)) {
        const stats = await getCategoryStats(dbClient, category, packageNames);
        categoryStats.set(category, stats);

        // Update totals based on category
        // Shared classifier (see config/categories.ts). Previously this counted
        // only launchql as Cloud while the README also counted pgpm and
        // kubernetesjs, so badges and table disagreed by ~7.3M.
        const rollup = brandRollupFor(category);
        if (rollup === "personal") continue; // excluded from company totals
        const target = totals[rollup];

        target.total += stats.total;
        target.monthly += stats.monthly;
        target.weekly += stats.weekly;
      }

      // Calculate final totals to match lifetime total
      totals.total.total = lifetimeStats.total;
      totals.total.monthly =
        totals.cloud.monthly + totals.chain.monthly + totals.utils.monthly;
      totals.total.weekly =
        totals.cloud.weekly + totals.chain.weekly + totals.utils.weekly;

      console.log("Final totals:", totals);

      console.log("Category stats:", categoryStats);
      // Generate badges
      await generateBadges(totals, categoryStats);
    });

    // Generate the report
    const sections = [
      `# Hyperweb download count\n`,
      generateBadgesSection(),
      generateTotalSection(totals),
      generateOverviewSection(),
    ];

    // Add category sections
    for (const [category, stats] of categoryStats) {
      sections.push(generateCategorySection(category, stats));
    }

    // Add uncategorized section
    sections.push(
      generateUncategorizedSection(lifetimeStats.uncategorizedPackages)
    );

    sections.push(generateUnderstandingSection());

    return sections.join("\n");
  } catch (error) {
    console.error("Failed to generate report:", error);
    throw error;
  }
}

function generateBadgesSection(): string {
  return `
<p align="center" width="100%">
 <img src="https://raw.githubusercontent.com/constructive-io/lib-count/refs/heads/main/assets/logo.svg" alt="constructive" width="80"><br />
 <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fconstructive-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Flib-count%2Ftotal_downloads.json"/>
 <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fconstructive-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Flib-count%2Fmonthly_downloads.json"/>
 <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fconstructive-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Flib-count%2Fweekly_downloads.json"/>
</p>\n`;
}

function generateOverviewSection(): string {
  return `### Software Download Count Repository

Welcome to the official repository for tracking the download counts of Constructive's software. This repository provides detailed statistics on the downloads, helping users and developers gain insights into the usage and popularity of our products.

**the Web:** At the heart of our mission is the synergy between the mature, user-friendly ecosystem of Cloud and the decentralized, secure potential of Chain. We're here to bridge this gap, unlocking real-world applications and the full potential of technology, making the web whole again.

### Our Projects:
- **[Hyperweb](https://github.com/hyperweb-io):** Build interchain apps in light speed.
- **[Constructive](https://github.com/constructive-io):** Modular Postgres Framework

Join us in shaping the future of the web.\n`;
}

function generateUnderstandingSection(): string {
  return `
## Understanding Downloads
### Interconnected Libraries
Our ecosystem comprises a wide array of libraries, most of which are included here. It's important to note that some of our npm modules are built upon each other. This interconnected nature means that when one module is downloaded as a dependency of another, both contribute to the download counts.

### Signal Strength
Download statistics serve as a robust indicator of usage and interest. Even with the layered nature of library dependencies, these numbers provide us with meaningful signals about which tools are most valuable to developers and which areas are garnering the most interest.    

### Related Projects
- **[Hyperweb](https://github.com/hyperweb-io):** Build interchain apps in light speed.
- **[Constructive](https://github.com/constructive-io):** Modular Postgres Framework

Join us in shaping the future of the web.\n`;
}

async function run(): Promise<void> {
  try {
    const report = await generateReport();
    console.log(report);
  } catch (error) {
    console.error("Failed to run report generation:", error);
    process.exit(1);
  }
}

async function generateAndWriteBadges(): Promise<void> {
  const db = new Database();
  const categoryStats = new Map<string, CategoryStats>();
  const totals: TotalStats = {
    cloud: { total: 0, monthly: 0, weekly: 0 },
    chain: { total: 0, monthly: 0, weekly: 0 },
    utils: { total: 0, monthly: 0, weekly: 0 },
    total: { total: 0, monthly: 0, weekly: 0 },
    lifetime: 0,
  };

  try {
    console.log("Starting badge generation with database query...");

    await db.withTransaction(async (dbClient: PoolClient) => {
      // Get lifetime stats first
      const lifetimeStats = await getLifetimeDownloadsByCategory(dbClient);
      totals.lifetime = lifetimeStats.total;

      console.log("Lifetime stats total:", lifetimeStats.total);
      console.log(
        "Uncategorized packages count:",
        lifetimeStats.uncategorizedPackages.length
      );

      // Add uncategorized package stats to utils category first
      for (const pkg of lifetimeStats.uncategorizedPackages) {
        totals.utils.total += pkg.total;
        totals.utils.monthly += pkg.monthly;
        totals.utils.weekly += pkg.weekly;
      }

      console.log("After adding uncategorized packages - Utils category:", {
        total: totals.utils.total,
        monthly: totals.utils.monthly,
        weekly: totals.utils.weekly,
      });

      // Gather stats for each category from data-config
      for (const [category, packageNames] of Object.entries(packages)) {
        console.log(
          `Processing category ${category} with ${packageNames.length} packages`
        );
        const stats = await getCategoryStats(dbClient, category, packageNames);
        categoryStats.set(category, stats);

        // Update totals based on category
        // Shared classifier (see config/categories.ts). Previously this counted
        // only launchql as Cloud while the README also counted pgpm and
        // kubernetesjs, so badges and table disagreed by ~7.3M.
        const rollup = brandRollupFor(category);
        if (rollup === "personal") continue; // excluded from company totals
        const target = totals[rollup];

        target.total += stats.total;
        target.monthly += stats.monthly;
        target.weekly += stats.weekly;

        console.log(`After adding ${category} - Target category now:`, {
          category:
            category === "launchql"
              ? "cloud"
              : category === "utils"
                ? "utils"
                : "chain",
          total: target.total,
          monthly: target.monthly,
          weekly: target.weekly,
        });
      }

      // Calculate final totals to match lifetime total
      totals.total.total = lifetimeStats.total;
      totals.total.monthly =
        totals.cloud.monthly + totals.chain.monthly + totals.utils.monthly;
      totals.total.weekly =
        totals.cloud.weekly + totals.chain.weekly + totals.utils.weekly;

      console.log("Final totals:", {
        "total.total": totals.total.total,
        "total.monthly": totals.total.monthly,
        "total.weekly": totals.total.weekly,
        "cloud.total": totals.cloud.total,
        "cloud.monthly": totals.cloud.monthly,
        "cloud.weekly": totals.cloud.weekly,
        "chain.total": totals.chain.total,
        "chain.monthly": totals.chain.monthly,
        "chain.weekly": totals.chain.weekly,
        "utils.total": totals.utils.total,
        "utils.monthly": totals.utils.monthly,
        "utils.weekly": totals.utils.weekly,
      });

      // Generate badges
      await generateBadges(totals, categoryStats);

      console.log("Badges generated successfully");
    });
  } catch (error) {
    console.error("Failed to generate badges:", error);
    throw error;
  }
}

if (require.main === module) {
  run();
}

export { generateReport, generateAndWriteBadges };

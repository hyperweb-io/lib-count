import { Database } from "@cosmology/db-client";
import { PoolClient } from "pg";
import { packages } from "./data-config";

interface DownloadStats {
  total: number;
  monthly: number;
  weekly: number;
}

interface PackageStats extends DownloadStats {
  name: string;
}

interface CategoryStats extends DownloadStats {
  packages: PackageStats[];
}

interface TotalStats {
  web2: DownloadStats;
  web3: DownloadStats;
  utils: DownloadStats;
  total: DownloadStats;
}

async function getPackageStats(
  dbClient: PoolClient,
  packageName: string
): Promise<PackageStats | null> {
  const result = await dbClient.query(
    `
    WITH date_ranges AS (
      SELECT 
        NOW() - INTERVAL '7 days' as week_start,
        NOW() - INTERVAL '30 days' as month_start
    )
    SELECT 
      p.package_name,
      COALESCE(SUM(d.download_count), 0) as total_downloads,
      COALESCE(SUM(CASE WHEN d.date >= date_ranges.month_start THEN d.download_count ELSE 0 END), 0) as monthly_downloads,
      COALESCE(SUM(CASE WHEN d.date >= date_ranges.week_start THEN d.download_count ELSE 0 END), 0) as weekly_downloads
    FROM npm_count.npm_package p
    CROSS JOIN date_ranges
    LEFT JOIN npm_count.daily_downloads d ON d.package_name = p.package_name
    WHERE p.package_name = $1 AND p.is_active = true
    GROUP BY p.package_name
    `,
    [packageName]
  );

  if (result.rows.length === 0) return null;

  return {
    name: packageName,
    total: parseInt(result.rows[0].total_downloads),
    monthly: parseInt(result.rows[0].monthly_downloads),
    weekly: parseInt(result.rows[0].weekly_downloads),
  };
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
  return `### Total Downloads

| Name | Total | Monthly | Weekly |
| ------- | ------ | ------- | ----- |
| *Total* | ${formatNumber(totals.total.total)} | ${formatNumber(
    totals.total.monthly
  )} | ${formatNumber(totals.total.weekly)} |
| Web2 | ${formatNumber(totals.web2.total)} | ${formatNumber(
    totals.web2.monthly
  )} | ${formatNumber(totals.web2.weekly)} |
| Web3 | ${formatNumber(totals.web3.total)} | ${formatNumber(
    totals.web3.monthly
  )} | ${formatNumber(totals.web3.weekly)} |
| Utils | ${formatNumber(totals.utils.total)} | ${formatNumber(
    totals.utils.monthly
  )} | ${formatNumber(totals.utils.weekly)} |\n`;
}

async function generateReport(): Promise<string> {
  const db = new Database();
  const categoryStats = new Map<string, CategoryStats>();
  const totals: TotalStats = {
    web2: { total: 0, monthly: 0, weekly: 0 },
    web3: { total: 0, monthly: 0, weekly: 0 },
    utils: { total: 0, monthly: 0, weekly: 0 },
    total: { total: 0, monthly: 0, weekly: 0 },
  };

  try {
    await db.withTransaction(async (dbClient: PoolClient) => {
      // Gather stats for each category
      for (const [category, packageNames] of Object.entries(packages)) {
        const stats = await getCategoryStats(dbClient, category, packageNames);
        categoryStats.set(category, stats);

        // Update totals based on category
        const target =
          category === "launchql"
            ? totals.web2
            : category === "utils"
              ? totals.utils
              : totals.web3;

        target.total += stats.total;
        target.monthly += stats.monthly;
        target.weekly += stats.weekly;

        totals.total.total += stats.total;
        totals.total.monthly += stats.monthly;
        totals.total.weekly += stats.weekly;
      }
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
 <img src="https://raw.githubusercontent.com/hyperweb-io/lib-count/refs/heads/main/assets/logo.svg" alt="hyperweb" width="80"><br />
 <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Flib-count%2Ftotal_downloads.json"/>
 <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Flib-count%2Fmonthly_downloads.json"/>
 <img height="20" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhyperweb-io%2Flib-count%2Fmain%2Foutput%2Fbadges%2Flib-count%2Fweekly_downloads.json"/>
</p>\n`;
}

function generateOverviewSection(): string {
  return `### Software Download Count Repository

Welcome to the official repository for tracking the download counts of Hyperweb's software. This repository provides detailed statistics on the downloads, helping users and developers gain insights into the usage and popularity of our products.

**the Web:** At the heart of our mission is the synergy between the mature, user-friendly ecosystem of Web2 and the decentralized, secure potential of Web3. We're here to bridge this gap, unlocking real-world applications and the full potential of technology, making the web whole again.

### Our Projects:
- **[Hyperweb](https://github.com/hyperweb-io):** Build interchain apps in light speed.
- **[LaunchQL](https://github.com/launchql):** Simplify database management.

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
- **[LaunchQL](https://github.com/launchql):** Simplify database management.

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

if (require.main === module) {
  run();
}

export { generateReport };

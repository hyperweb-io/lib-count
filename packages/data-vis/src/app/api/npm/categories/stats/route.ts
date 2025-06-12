import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailyDownloads, npmPackage } from "@stats-db/schema";
import { packages as dataConfigPackages } from "@stats-db/tasks/npm/data-config";

type HighLevelCategory = "web2" | "web3" | "utils";
type MonthlyDownloads = Record<string, Record<HighLevelCategory, number>>;

export async function GET() {
  try {
    // 1. Get all unique package names from the database
    const allDbPackages = await db
      .selectDistinct({ name: npmPackage.packageName })
      .from(npmPackage);
    const allDbPackageNames = new Set(allDbPackages.map((p) => p.name));

    // 2. Get all packages from data-config.ts
    const allConfigPackages = new Set<string>();
    Object.values(dataConfigPackages).forEach((pkgList) => {
      pkgList.forEach((pkgName) => allConfigPackages.add(pkgName));
    });

    // 3. Combine all packages (from config and database)
    const allPackages = new Set([...allDbPackageNames, ...allConfigPackages]);

    // 4. Classify all packages into high-level categories
    const packageToCategoryMap = new Map<string, HighLevelCategory>();
    const utilsConfigPackages = new Set(dataConfigPackages.utils || []);
    const launchqlConfigPackages = new Set(dataConfigPackages.launchql || []);

    allPackages.forEach((name) => {
      if (utilsConfigPackages.has(name)) {
        packageToCategoryMap.set(name, "utils");
      } else if (
        launchqlConfigPackages.has(name) ||
        name.startsWith("@launchql/")
      ) {
        packageToCategoryMap.set(name, "web2");
      } else {
        packageToCategoryMap.set(name, "web3");
      }
    });

    // 5. Fetch all daily download records
    const allDownloads = await db
      .select({
        packageName: dailyDownloads.packageName,
        downloads: dailyDownloads.downloadCount,
        date: dailyDownloads.date,
      })
      .from(dailyDownloads);

    // 6. Aggregate downloads in TypeScript
    const monthlyDownloads: MonthlyDownloads = {};

    for (const record of allDownloads) {
      if (!record.date) continue;

      const date = new Date(record.date);
      const year = date.getUTCFullYear();
      const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
      const monthKey = `${year}-${month}`;

      const category = packageToCategoryMap.get(record.packageName);
      if (!category) continue;

      if (!monthlyDownloads[monthKey]) {
        monthlyDownloads[monthKey] = { web2: 0, web3: 0, utils: 0 };
      }

      monthlyDownloads[monthKey][category] += record.downloads || 0;
    }

    // 7. Generate a complete monthly series from 2019 to now
    const chartData: {
      date: string;
      web2: number;
      web3: number;
      utils: number;
    }[] = [];
    const startDate = new Date("2019-01-01");
    const endDate = new Date();

    for (let d = startDate; d <= endDate; d.setMonth(d.getMonth() + 1)) {
      const year = d.getUTCFullYear();
      const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
      const monthKey = `${year}-${month}`;

      chartData.push({
        date: `${monthKey}-01`,
        web2: monthlyDownloads[monthKey]?.web2 || 0,
        web3: monthlyDownloads[monthKey]?.web3 || 0,
        utils: monthlyDownloads[monthKey]?.utils || 0,
      });
    }

    return NextResponse.json(chartData);
  } catch (error) {
    console.error("Failed to fetch category stats:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

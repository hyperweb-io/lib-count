import { db } from "../../db";
import {
  dailyDownloads,
  npmPackage,
  category,
  packageCategory,
} from "../../schema";
import { and, between, desc, eq, isNull, sql, inArray } from "drizzle-orm";

interface NpmDownloadCount {
  packageName: string;
  date: Date;
  downloadCount: number;
}

interface DailyDownload {
  date: Date;
  downloadCount: number;
}

export async function getDownloadsByPackage(
  packageName: string,
  startDate: Date,
  endDate: Date
): Promise<NpmDownloadCount[]> {
  const result = await db
    .select({
      packageName: dailyDownloads.packageName,
      date: dailyDownloads.date,
      downloadCount: dailyDownloads.downloadCount,
    })
    .from(dailyDownloads)
    .where(
      and(
        eq(dailyDownloads.packageName, packageName),
        between(dailyDownloads.date, startDate, endDate)
      )
    )
    .orderBy(dailyDownloads.date);

  return result.map((row) => ({
    ...row,
    downloadCount: Number(row.downloadCount),
  }));
}

export async function getDownloadsForPackages(
  packageNames: string[],
  startDate: Date,
  endDate: Date
): Promise<NpmDownloadCount[]> {
  if (packageNames.length === 0) {
    return [];
  }

  const result = await db
    .select({
      packageName: dailyDownloads.packageName,
      date: dailyDownloads.date,
      downloadCount: dailyDownloads.downloadCount,
    })
    .from(dailyDownloads)
    .where(
      and(
        inArray(dailyDownloads.packageName, packageNames),
        between(dailyDownloads.date, startDate, endDate)
      )
    )
    .orderBy(dailyDownloads.packageName, dailyDownloads.date);

  return result.map((row) => ({
    ...row,
    downloadCount: Number(row.downloadCount),
  }));
}

export async function getTotalDownloadsByPackage(
  packageName: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const result = await db
    .select({
      total: sql<number>`sum(${dailyDownloads.downloadCount})`.mapWith(Number),
    })
    .from(dailyDownloads)
    .where(
      and(
        eq(dailyDownloads.packageName, packageName),
        between(dailyDownloads.date, startDate, endDate)
      )
    );

  return result[0]?.total ?? 0;
}

export async function getTopPackagesByDownloads(
  startDate: Date,
  endDate: Date,
  limit = 10
): Promise<Array<{ packageName: string; totalDownloads: number }>> {
  const result = await db
    .select({
      packageName: dailyDownloads.packageName,
      totalDownloads: sql<number>`sum(${dailyDownloads.downloadCount})`.mapWith(
        Number
      ),
    })
    .from(dailyDownloads)
    .where(between(dailyDownloads.date, startDate, endDate))
    .groupBy(dailyDownloads.packageName)
    .orderBy(desc(sql`total_downloads`))
    .limit(limit);

  return result;
}

export async function getDailyAverageDownloads(
  packageName: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const result = await db
    .select({
      avgDownloads: sql<number>`avg(${dailyDownloads.downloadCount})`.mapWith(
        Number
      ),
    })
    .from(dailyDownloads)
    .where(
      and(
        eq(dailyDownloads.packageName, packageName),
        between(dailyDownloads.date, startDate, endDate)
      )
    );

  return result[0]?.avgDownloads ?? 0;
}

export async function insertPackage(
  packageName: string,
  creationDate: Date,
  lastPublishDate: Date
): Promise<void> {
  await db
    .insert(npmPackage)
    .values({
      packageName,
      creationDate,
      lastPublishDate,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: npmPackage.packageName,
      set: {
        creationDate,
        lastPublishDate,
        updatedAt: new Date(),
      },
    });
}

export async function getPackageMetadata(
  packageName: string
): Promise<{ packageName: string; creationDate: Date } | null> {
  const result = await db
    .select({
      packageName: npmPackage.packageName,
      creationDate: npmPackage.creationDate,
    })
    .from(npmPackage)
    .where(eq(npmPackage.packageName, packageName));

  if (result.length === 0) {
    return null;
  }

  return result[0];
}

export async function getPackagesCreatedBetween(
  startDate: Date,
  endDate: Date
): Promise<Array<{ packageName: string; creationDate: Date }>> {
  return db
    .select({
      packageName: npmPackage.packageName,
      creationDate: npmPackage.creationDate,
    })
    .from(npmPackage)
    .where(between(npmPackage.creationDate, startDate, endDate))
    .orderBy(desc(npmPackage.creationDate));
}

export async function getLastDateForPackage(
  packageName: string
): Promise<Date | null> {
  const result = await db
    .select({
      lastDate: sql<Date>`max(${dailyDownloads.date})`,
    })
    .from(dailyDownloads)
    .where(eq(dailyDownloads.packageName, packageName));

  if (result.length > 0 && result[0].lastDate) {
    return result[0].lastDate;
  }

  return null;
}

export async function getPackagesWithoutDownloads(): Promise<
  Array<{ packageName: string; creationDate: Date }>
> {
  const subquery = db
    .select({ pkgName: dailyDownloads.packageName })
    .from(dailyDownloads)
    .where(eq(dailyDownloads.packageName, npmPackage.packageName));

  return db
    .select({
      packageName: npmPackage.packageName,
      creationDate: npmPackage.creationDate,
    })
    .from(npmPackage)
    .where(and(eq(npmPackage.isActive, true), sql`not exists ${subquery}`))
    .orderBy(npmPackage.creationDate);
}

export async function insertDailyDownloads(
  packageName: string,
  downloads: DailyDownload[]
): Promise<void> {
  if (downloads.length === 0) return;

  const records = downloads.map((d) => ({
    packageName,
    date: d.date,
    downloadCount: d.downloadCount,
  }));

  await db
    .insert(dailyDownloads)
    .values(records)
    .onConflictDoUpdate({
      target: [dailyDownloads.packageName, dailyDownloads.date],
      set: {
        downloadCount: sql`excluded.download_count`,
      },
    });
}

export async function updateLastFetchedDate(
  packageName: string
): Promise<void> {
  await db
    .update(npmPackage)
    .set({ lastFetchedDate: new Date() })
    .where(eq(npmPackage.packageName, packageName));
}

export async function getAllPackages(): Promise<
  Array<{ packageName: string; creationDate: Date }>
> {
  return db
    .select({
      packageName: npmPackage.packageName,
      creationDate: npmPackage.creationDate,
    })
    .from(npmPackage)
    .orderBy(npmPackage.creationDate);
}

export async function getTotalLifetimeDownloads(
  packageName: string
): Promise<number> {
  const result = await db
    .select({
      totalDownloads: sql<number>`sum(${dailyDownloads.downloadCount})`.mapWith(
        Number
      ),
    })
    .from(dailyDownloads)
    .where(eq(dailyDownloads.packageName, packageName));

  return result[0]?.totalDownloads ?? 0;
}

export async function getDownloadsForCategory(
  categoryName: string,
  startDate: Date,
  endDate: Date
): Promise<{ date: Date; downloadCount: number }[]> {
  const result = await db
    .select({
      date: dailyDownloads.date,
      downloadCount: sql<number>`sum(${dailyDownloads.downloadCount})`.mapWith(
        Number
      ),
    })
    .from(dailyDownloads)
    .innerJoin(
      packageCategory,
      eq(dailyDownloads.packageName, packageCategory.packageId)
    )
    .innerJoin(category, eq(packageCategory.categoryId, category.id))
    .where(
      and(
        eq(category.name, categoryName),
        between(dailyDownloads.date, startDate, endDate)
      )
    )
    .groupBy(dailyDownloads.date)
    .orderBy(dailyDownloads.date);

  return result;
}

export async function getTotalDownloadsForCategory(
  categoryName: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const result = await db
    .select({
      total: sql<number>`sum(${dailyDownloads.downloadCount})`.mapWith(Number),
    })
    .from(dailyDownloads)
    .innerJoin(
      packageCategory,
      eq(dailyDownloads.packageName, packageCategory.packageId)
    )
    .innerJoin(category, eq(packageCategory.categoryId, category.id))
    .where(
      and(
        eq(category.name, categoryName),
        between(dailyDownloads.date, startDate, endDate)
      )
    );

  return result[0]?.total ?? 0;
}

export async function getDownloadsForUncategorizedPackages(
  startDate: Date,
  endDate: Date
): Promise<{ packageName: string; totalDownloads: number }[]> {
  const result = await db
    .select({
      packageName: dailyDownloads.packageName,
      totalDownloads: sql<number>`sum(${dailyDownloads.downloadCount})`.mapWith(
        Number
      ),
    })
    .from(dailyDownloads)
    .leftJoin(
      packageCategory,
      eq(dailyDownloads.packageName, packageCategory.packageId)
    )
    .where(
      and(
        isNull(packageCategory.categoryId),
        between(dailyDownloads.date, startDate, endDate)
      )
    )
    .groupBy(dailyDownloads.packageName)
    .orderBy(desc(sql`sum(${dailyDownloads.downloadCount})`));

  return result;
}

export async function getPackagesForCategory(
  categoryName: string
): Promise<string[]> {
  const result = await db
    .select({ packageName: npmPackage.packageName })
    .from(npmPackage)
    .innerJoin(
      packageCategory,
      eq(npmPackage.packageName, packageCategory.packageId)
    )
    .innerJoin(category, eq(packageCategory.categoryId, category.id))
    .where(eq(category.name, categoryName))
    .orderBy(npmPackage.packageName);

  return result.map((row) => row.packageName);
}

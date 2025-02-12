import { PoolClient } from "pg";

interface NpmDownloadCount {
  packageName: string;
  date: Date;
  downloadCount: number;
}

export async function insertNpmDownloadCount(
  client: PoolClient,
  data: NpmDownloadCount
): Promise<void> {
  const query = `
    INSERT INTO npm_count.npm_download_count (package_name, date, download_count)
    VALUES ($1, $2, $3)
    ON CONFLICT (package_name, date) 
    DO UPDATE SET download_count = EXCLUDED.download_count;
  `;

  await client.query(query, [data.packageName, data.date, data.downloadCount]);
}

export async function bulkInsertNpmDownloadCounts(
  client: PoolClient,
  data: NpmDownloadCount[]
): Promise<void> {
  const query = `
    INSERT INTO npm_count.npm_download_count (package_name, date, download_count)
    VALUES ($1, $2, $3)
    ON CONFLICT (package_name, date) 
    DO UPDATE SET download_count = EXCLUDED.download_count;
  `;

  await Promise.all(
    data.map((record) =>
      client.query(query, [
        record.packageName,
        record.date,
        record.downloadCount,
      ])
    )
  );
}

export async function getDownloadsByPackage(
  client: PoolClient,
  packageName: string,
  startDate: Date,
  endDate: Date
): Promise<NpmDownloadCount[]> {
  const query = `
    SELECT package_name, date, download_count
    FROM npm_count.npm_download_count
    WHERE package_name = $1
    AND date BETWEEN $2 AND $3
    ORDER BY date ASC;
  `;

  const result = await client.query(query, [packageName, startDate, endDate]);

  return result.rows.map((row) => ({
    packageName: row.package_name,
    date: row.date,
    downloadCount: Number(row.download_count),
  }));
}

export async function getTotalDownloadsByPackage(
  client: PoolClient,
  packageName: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const query = `
    SELECT SUM(download_count) as total
    FROM npm_count.npm_download_count
    WHERE package_name = $1
    AND date BETWEEN $2 AND $3;
  `;

  const result = await client.query(query, [packageName, startDate, endDate]);
  return Number(result.rows[0].total) || 0;
}

export async function getTopPackagesByDownloads(
  client: PoolClient,
  startDate: Date,
  endDate: Date,
  limit = 10
): Promise<Array<{ packageName: string; totalDownloads: number }>> {
  const query = `
    SELECT 
      package_name,
      SUM(download_count) as total_downloads
    FROM npm_count.npm_download_count
    WHERE date BETWEEN $1 AND $2
    GROUP BY package_name
    ORDER BY total_downloads DESC
    LIMIT $3;
  `;

  const result = await client.query(query, [startDate, endDate, limit]);

  return result.rows.map((row) => ({
    packageName: row.package_name,
    totalDownloads: Number(row.total_downloads),
  }));
}

export async function getDailyAverageDownloads(
  client: PoolClient,
  packageName: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const query = `
    SELECT AVG(download_count) as avg_downloads
    FROM npm_count.npm_download_count
    WHERE package_name = $1
    AND date BETWEEN $2 AND $3;
  `;

  const result = await client.query(query, [packageName, startDate, endDate]);
  return Number(result.rows[0].avg_downloads) || 0;
}

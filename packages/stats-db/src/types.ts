export interface DownloadStats {
  total: number;
  monthly: number;
  weekly: number;
}

export interface PackageStats extends DownloadStats {
  name: string;
}

export interface CategoryStats extends DownloadStats {
  packages: PackageStats[];
}

export interface TotalStats {
  web2: DownloadStats;
  web3: DownloadStats;
  utils: DownloadStats;
  total: DownloadStats;
  lifetime: number;
}

export interface LifetimeStats {
  total: number;
  byCategory: Record<string, number>;
  uncategorizedPackages: PackageStats[];
}

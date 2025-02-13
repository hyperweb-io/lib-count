export type DateString = `${number}-${number}-${number}`;
export type DateRangeFormat = string;
// export type DateRangeFormat = `${DateString}:${DateString}`;
export type DateRangeMode = "daily" | "monthly" | "weekly";
export type DownloadURL = `downloads/range${string}`;
export type Year = number;
export type Month = number;
export type Day = number;
export type DateNumberFormat = [Year, Month, Day];

export interface SearchDataResponse {
  start: string;
  end: string;
  package: string;
  downloads: SearchDownloadDetail[];
}

export interface SearchDownloadDetail {
  downloads: number;
  day: string;
}

export interface NPMResponse {
  objects: NPMObject[];
  total: number;
  time: string;
}

export interface NPMObject {
  package: Package;
  flags: Flags;
  score: Score;
  searchScore: number;
}

export interface NPMDownload {
  downloads: number;
  day: string;
}

export interface NPMDownloadResponse {
  downloads: NPMDownload[];
  start: string;
  end: string;
  package: string;
}

export interface Package {
  name: string;
  scope: string;
  version: string;
  description: string;
  date: string; // or Date if you want to convert strings to Date objects
  links: PackageLinks;
  author: Person;
  publisher: Person;
  maintainers: Person[];
}

export interface PackageLinks {
  npm: string;
  homepage: string;
  repository: string;
  bugs?: string; // Optional since not all packages have this
}

export interface Person {
  name?: string; // Optional as not all persons might have a name listed
  email: string;
  username: string;
}

export interface Flags {
  insecure: number;
}

export interface Score {
  final: number;
  detail: ScoreDetail;
}

export interface ScoreDetail {
  quality: number;
  popularity: number;
  maintenance: number;
}

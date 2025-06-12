import { z } from "zod";

// Core package and group schemas
export const packageSchema = z.object({
  name: z.string(),
  hidden: z.boolean().optional(),
});

export const packageGroupSchema = z.object({
  packages: z.array(packageSchema),
  color: z.string().nullable().optional(),
  baseline: z.boolean().optional(),
});

export const packageComparisonSchema = z.object({
  title: z.string(),
  packageGroups: z.array(packageGroupSchema),
  baseline: z.string().optional(),
});

// Query parameters schema
export const transformModeSchema = z.enum(["none", "normalize-y"]);
export const binTypeSchema = z.enum(["yearly", "monthly", "weekly", "daily"]);
export const showDataModeSchema = z.enum(["all", "complete"]);

export const searchParamsSchema = z.object({
  packageGroups: z.array(packageGroupSchema).optional(),
  range: z
    .enum([
      "7-days",
      "30-days",
      "90-days",
      "180-days",
      "365-days",
      "730-days",
      "1825-days",
      "all-time",
    ])
    .optional()
    .default("365-days"),
  transform: transformModeSchema.optional().default("none"),
  facetX: z.enum(["name"]).optional(),
  facetY: z.enum(["name"]).optional(),
  binType: binTypeSchema.optional().default("weekly"),
  showDataMode: showDataModeSchema.optional().default("all"),
  height: z.number().optional().default(400),
});

// Inferred types
export type Package = z.infer<typeof packageSchema>;
export type PackageGroup = z.infer<typeof packageGroupSchema>;
export type PackageComparison = z.infer<typeof packageComparisonSchema>;
export type TransformMode = z.infer<typeof transformModeSchema>;
export type BinType = z.infer<typeof binTypeSchema>;
export type ShowDataMode = z.infer<typeof showDataModeSchema>;
export type SearchParams = z.infer<typeof searchParamsSchema>;

export type TimeRange =
  | "7-days"
  | "30-days"
  | "90-days"
  | "180-days"
  | "365-days"
  | "730-days"
  | "1825-days"
  | "all-time";

// NPM API response types
export type NpmPackageDownload = {
  day: string;
  downloads: number;
};

export type NpmPackageData = {
  name: string;
  description?: string;
  version?: string;
  publisher?: {
    username: string;
  };
  time?: {
    created: string;
    modified: string;
  };
};

export type NpmQueryPackage = {
  downloads: NpmPackageDownload[];
  name: string;
  hidden?: boolean;
};

export type NpmQueryData = {
  packages: NpmQueryPackage[];
  baseline?: boolean;
  start: string;
  end: string;
  color?: string | null;
  error?: string | null;
}[];

// Constants
export const timeRanges = [
  { value: "7-days", label: "7 Days" },
  { value: "30-days", label: "30 Days" },
  { value: "90-days", label: "90 Days" },
  { value: "180-days", label: "6 Months" },
  { value: "365-days", label: "1 Year" },
  { value: "730-days", label: "2 Years" },
  { value: "1825-days", label: "5 Years" },
  { value: "all-time", label: "All Time" },
] as const;

export const binningOptions = [
  {
    label: "Yearly",
    value: "yearly",
    single: "year",
  },
  {
    label: "Monthly",
    value: "monthly",
    single: "month",
  },
  {
    label: "Weekly",
    value: "weekly",
    single: "week",
  },
  {
    label: "Daily",
    value: "daily",
    single: "day",
  },
] as const;

export const defaultColors = [
  "#1f77b4", // blue
  "#ff7f0e", // orange
  "#2ca02c", // green
  "#d62728", // red
  "#9467bd", // purple
  "#8c564b", // brown
  "#e377c2", // pink
  "#7f7f7f", // gray
  "#bcbd22", // yellow-green
  "#17becf", // cyan
] as const;

// Utility functions
export const formatNumber = (num: number) => {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}k`;
  }
  return num.toString();
};

export const getPackageColor = (
  packageName: string,
  packages: PackageGroup[]
) => {
  const packageInfo = packages.find((pkg) =>
    pkg.packages.some((p) => p.name === packageName)
  );
  if (packageInfo?.color) {
    return packageInfo.color;
  }

  const packageIndex = packages.findIndex((pkg) =>
    pkg.packages.some((p) => p.name === packageName)
  );
  return defaultColors[packageIndex % defaultColors.length];
};

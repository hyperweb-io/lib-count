"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import {
  PackageGroup,
  TimeRange,
  BinType,
  NpmQueryData,
  timeRanges,
  binningOptions,
  formatNumber,
  getPackageColor,
} from "@/lib/types";

// Data fetching hook
function useNpmStats({
  packageGroups,
  range,
  binType,
}: {
  packageGroups: PackageGroup[];
  range: TimeRange;
  binType: BinType;
}) {
  return useQuery({
    queryKey: ["npm-stats", packageGroups, range, binType],
    queryFn: async (): Promise<NpmQueryData> => {
      const params = new URLSearchParams({
        packageGroups: JSON.stringify(packageGroups),
        range,
        binType,
      });

      const response = await fetch(`/api/npm/downloads?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch npm stats");
      }

      return response.json();
    },
    enabled: packageGroups.length > 0,
  });
}

// Chart component
interface NpmStatsChartProps {
  packageGroups: PackageGroup[];
  range: TimeRange;
  binType: BinType;
  height?: number;
  onRangeChange?: (range: TimeRange) => void;
  onBinTypeChange?: (binType: BinType) => void;
}

export function NpmStatsChart({
  packageGroups,
  range,
  binType,
  height = 400,
  onRangeChange,
  onBinTypeChange,
}: NpmStatsChartProps) {
  const {
    data: queryData,
    isLoading,
    error,
  } = useNpmStats({
    packageGroups,
    range,
    binType,
  });

  // Transform data for Recharts
  const chartData = React.useMemo(() => {
    if (!queryData?.length) return [];

    // Collect all unique dates
    const dateSet = new Set<string>();
    queryData.forEach((group) => {
      group.packages.forEach((pkg) => {
        pkg.downloads.forEach((download) => {
          dateSet.add(download.day);
        });
      });
    });

    const sortedDates = Array.from(dateSet).sort();

    // Create chart data with all packages
    return sortedDates.map((date) => {
      const dataPoint: Record<string, string | number> = { date };

      queryData.forEach((group) => {
        group.packages.forEach((pkg) => {
          if (pkg.hidden) return;

          const download = pkg.downloads.find((d) => d.day === date);
          dataPoint[pkg.name] = download?.downloads || 0;
        });
      });

      return dataPoint;
    });
  }, [queryData]);

  // Generate chart config
  const chartConfig = React.useMemo((): ChartConfig => {
    const config: ChartConfig = {};

    if (queryData) {
      queryData.forEach((group) => {
        group.packages.forEach((pkg) => {
          if (pkg.hidden) return;

          config[pkg.name] = {
            label: pkg.name,
            color: group.color || getPackageColor(pkg.name, packageGroups),
          };
        });
      });
    }

    return config;
  }, [queryData, packageGroups]);

  // Get all visible package names for rendering lines
  const visiblePackages = React.useMemo(() => {
    if (!queryData) return [];

    const packages: string[] = [];
    queryData.forEach((group) => {
      group.packages.forEach((pkg) => {
        if (!pkg.hidden) {
          packages.push(pkg.name);
        }
      });
    });

    return [...new Set(packages)];
  }, [queryData]);

  // Calculate totals for each package
  const packageTotals = React.useMemo(() => {
    if (!queryData) return {};

    const totals: Record<string, number> = {};
    queryData.forEach((group) => {
      group.packages.forEach((pkg) => {
        if (!pkg.hidden) {
          totals[pkg.name] = pkg.downloads.reduce(
            (sum, d) => sum + d.downloads,
            0
          );
        }
      });
    });

    return totals;
  }, [queryData]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center">
            <div className="animate-pulse">Loading chart data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center text-red-500">
            Failed to load chart data: {(error as Error).message}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
          <CardTitle>NPM Package Downloads</CardTitle>
          <CardDescription>
            Showing download trends for {visiblePackages.length} package(s) over{" "}
            {timeRanges.find((r) => r.value === range)?.label}
          </CardDescription>
        </div>

        {/* Package summary */}
        <div className="flex">
          {visiblePackages.slice(0, 3).map((packageName) => (
            <div
              key={packageName}
              className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l sm:border-l sm:border-t-0 sm:px-8 sm:py-6"
            >
              <span className="text-xs text-muted-foreground">
                {packageName}
              </span>
              <span className="text-lg font-bold leading-none sm:text-3xl">
                {formatNumber(packageTotals[packageName] || 0)}
              </span>
            </div>
          ))}
          {visiblePackages.length > 3 && (
            <div className="flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left border-l sm:border-t-0 sm:px-8 sm:py-6">
              <span className="text-xs text-muted-foreground">
                +{visiblePackages.length - 3} more
              </span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-2 sm:p-6">
        {/* Controls */}
        <div className="mb-4 flex flex-wrap gap-2">
          <Select value={range} onValueChange={onRangeChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timeRanges.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={binType} onValueChange={onBinTypeChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {binningOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Package badges */}
          <div className="flex flex-wrap gap-1">
            {visiblePackages.map((packageName) => (
              <Badge
                key={packageName}
                variant="secondary"
                style={{
                  backgroundColor: chartConfig[packageName]?.color + "20",
                  borderColor: chartConfig[packageName]?.color,
                  color: chartConfig[packageName]?.color,
                }}
              >
                {packageName}
              </Badge>
            ))}
          </div>
        </div>

        {/* Chart */}
        <ChartContainer
          config={chartConfig}
          className="w-full"
          style={{ height }}
        >
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
              top: 12,
              bottom: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => {
                const date = parseISO(value);
                return format(date, "MMM dd");
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={formatNumber}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    const date = parseISO(value as string);
                    return format(date, "MMM dd, yyyy");
                  }}
                  formatter={(value, name) => [
                    formatNumber(Number(value)),
                    chartConfig[name as string]?.label || name,
                  ]}
                />
              }
            />
            {visiblePackages.map((packageName) => (
              <Line
                key={packageName}
                type="monotone"
                dataKey={packageName}
                stroke={chartConfig[packageName]?.color}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

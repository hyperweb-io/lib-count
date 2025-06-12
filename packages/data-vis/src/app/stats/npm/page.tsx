"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { NpmStatsChart } from "@/components/npm-stats-chart";
import { PackageSelector } from "@/components/package-selector";
import { ModeToggle } from "@/components/theme-toggle";
import { PackageGroup, TimeRange, BinType } from "@/lib/types";
import { getCosmosComparisons } from "@/lib/cosmos-comparisons";

const queryClient = new QueryClient();

function NpmStatsPage() {
  // Initialize with the first cosmos comparison
  const [packageGroups, setPackageGroups] = React.useState<PackageGroup[]>(
    () => getCosmosComparisons()[0]?.packageGroups || []
  );
  const [range, setRange] = React.useState<TimeRange>("365-days");
  const [binType, setBinType] = React.useState<BinType>("weekly");

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            NPM Package Analytics
          </h1>
          <p className="text-muted-foreground">
            Analyze and compare download trends for Cosmos ecosystem packages
          </p>
        </div>
        <ModeToggle />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Package Selection Sidebar */}
        <div className="lg:col-span-1">
          <PackageSelector
            selectedPackageGroups={packageGroups}
            onPackageGroupsChange={setPackageGroups}
          />
        </div>

        {/* Chart Area */}
        <div className="lg:col-span-2">
          <NpmStatsChart
            packageGroups={packageGroups}
            range={range}
            binType={binType}
            height={500}
            onRangeChange={setRange}
            onBinTypeChange={setBinType}
          />
        </div>
      </div>

      {/* Additional Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 border rounded-lg">
          <h3 className="font-semibold mb-2">Total Packages</h3>
          <p className="text-2xl font-bold text-primary">
            {packageGroups.reduce(
              (acc, group) => acc + group.packages.length,
              0
            )}
          </p>
        </div>

        <div className="p-6 border rounded-lg">
          <h3 className="font-semibold mb-2">Visible Packages</h3>
          <p className="text-2xl font-bold text-primary">
            {packageGroups.reduce(
              (acc, group) =>
                acc + group.packages.filter((p) => !p.hidden).length,
              0
            )}
          </p>
        </div>

        <div className="p-6 border rounded-lg">
          <h3 className="font-semibold mb-2">Time Range</h3>
          <p className="text-2xl font-bold text-primary">
            {range
              .replace("-", " ")
              .replace("days", "Days")
              .replace("all time", "All Time")}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <QueryClientProvider client={queryClient}>
        <NpmStatsPage />
      </QueryClientProvider>
    </React.Suspense>
  );
}

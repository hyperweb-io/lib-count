"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Legend } from "recharts";
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
import { formatNumber } from "@/lib/types";

type CategoryData = {
  date: string;
  web2: number;
  web3: number;
  utils: number;
};

const chartConfig: ChartConfig = {
  web2: {
    label: "Web2",
    color: "hsl(220, 70%, 50%)", // Blue
  },
  web3: {
    label: "Web3",
    color: "hsl(280, 70%, 50%)", // Purple
  },
  utils: {
    label: "Utils",
    color: "hsl(140, 70%, 50%)", // Green
  },
};

export function CategoryStatsChart() {
  const {
    data: chartData,
    isLoading,
    error,
  } = useQuery<CategoryData[]>({
    queryKey: ["category-stats-all-time"],
    queryFn: async () => {
      const response = await fetch(`/api/npm/categories/stats`);
      if (!response.ok) {
        throw new Error("Failed to fetch category stats");
      }
      return response.json();
    },
    initialData: [],
  });

  const totalDownloads = React.useMemo(() => {
    return {
      web2: chartData.reduce((acc, curr) => acc + curr.web2, 0),
      web3: chartData.reduce((acc, curr) => acc + curr.web3, 0),
      utils: chartData.reduce((acc, curr) => acc + curr.utils, 0),
    };
  }, [chartData]);

  return (
    <Card className="relative">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-r-transparent rounded-full"></div>
            <p className="text-sm text-muted-foreground">
              Loading chart data...
            </p>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
          <div className="flex flex-col items-center gap-2 text-red-500">
            <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-red-600 font-bold">!</span>
            </div>
            <p className="text-sm">Failed to load chart data</p>
          </div>
        </div>
      )}

      <CardHeader className="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
          <CardTitle>Category Download Trends</CardTitle>
          <CardDescription>
            Showing total monthly downloads for web2, web3, and utils categories
          </CardDescription>
        </div>
        <div className="flex">
          {Object.entries(totalDownloads).map(([key, value]) => (
            <div
              key={key}
              className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l sm:border-l sm:border-t-0 sm:px-8 sm:py-6"
            >
              <span className="text-xs text-muted-foreground">
                {chartConfig[key]?.label}
              </span>
              <span className="text-lg font-bold leading-none sm:text-3xl">
                {formatNumber(value)}
              </span>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[350px] w-full"
        >
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{ left: 12, right: 12, top: 12 }}
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.3}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => {
                const date = parseISO(value);
                return format(date, "MMM yyyy");
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => formatNumber(Number(value))}
            />
            <ChartTooltip
              cursor={{
                stroke: "hsl(var(--muted-foreground))",
                strokeWidth: 1,
              }}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Legend
              verticalAlign="top"
              height={36}
              iconType="line"
              wrapperStyle={{ paddingBottom: "20px" }}
            />
            <Line
              dataKey="web2"
              type="monotone"
              stroke="var(--color-web2)"
              strokeWidth={3}
              dot={false}
              activeDot={{
                r: 4,
                stroke: "var(--color-web2)",
                strokeWidth: 2,
                fill: "white",
              }}
            />
            <Line
              dataKey="web3"
              type="monotone"
              stroke="var(--color-web3)"
              strokeWidth={3}
              dot={false}
              activeDot={{
                r: 4,
                stroke: "var(--color-web3)",
                strokeWidth: 2,
                fill: "white",
              }}
            />
            <Line
              dataKey="utils"
              type="monotone"
              stroke="var(--color-utils)"
              strokeWidth={3}
              dot={false}
              activeDot={{
                r: 4,
                stroke: "var(--color-utils)",
                strokeWidth: 2,
                fill: "white",
              }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

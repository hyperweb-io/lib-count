"use client";

import Link from "next/link";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";

import { ModeToggle } from "@/components/theme-toggle";
import { CategoryStatsChart } from "@/components/category-stats-chart";

const queryClient = new QueryClient();

function CategoryAnalyticsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Ecosystem Analytics
          </h1>
          <p className="text-muted-foreground">
            Download trends for key package categories in the Cosmos ecosystem.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" asChild>
            <Link href="/stats/npm">
              <BarChart3 className="mr-2 h-5 w-5" />
              Package-Level Analytics
            </Link>
          </Button>
          <ModeToggle />
        </div>
      </div>

      <CategoryStatsChart />
    </div>
  );
}

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <CategoryAnalyticsPage />
    </QueryClientProvider>
  );
}

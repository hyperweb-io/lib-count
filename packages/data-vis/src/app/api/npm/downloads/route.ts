import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { packageGroupSchema } from "@/lib/types";

const searchParamsSchema = z.object({
  packageGroups: z.string().transform((str) => {
    const parsed = JSON.parse(str);
    return z.array(packageGroupSchema).parse(parsed);
  }),
  range: z.string(),
  binType: z.string(),
});

// Helper function to fetch NPM download data
async function fetchNpmDownloads(
  packageName: string,
  startDate: string,
  endDate: string
) {
  const url = `https://api.npmjs.org/downloads/range/${startDate}:${endDate}/${packageName}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return { downloads: [] };
    }
    throw new Error(
      `Failed to fetch data for ${packageName}: ${response.statusText}`
    );
  }

  return await response.json();
}

// Helper function to calculate date range based on range parameter
function getDateRange(range: string): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().split("T")[0];

  let startDate: string;

  switch (range) {
    case "7-days":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      break;
    case "30-days":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      break;
    case "90-days":
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      break;
    case "180-days":
      startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      break;
    case "365-days":
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      break;
    case "730-days":
      startDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      break;
    case "1825-days":
      startDate = new Date(now.getTime() - 1825 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      break;
    case "all-time":
      startDate = "2010-01-12"; // NPM was created around this time
      break;
    default:
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
  }

  return { startDate, endDate };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { packageGroups, range } = searchParamsSchema.parse({
      packageGroups: searchParams.get("packageGroups"),
      range: searchParams.get("range"),
      binType: searchParams.get("binType"),
    });

    const { startDate, endDate } = getDateRange(range);

    // Fetch data for each package group
    const results = await Promise.all(
      packageGroups.map(async (group) => {
        try {
          const packages = await Promise.all(
            group.packages.map(async (pkg) => {
              try {
                const downloadData = await fetchNpmDownloads(
                  pkg.name,
                  startDate,
                  endDate
                );

                return {
                  name: pkg.name,
                  hidden: pkg.hidden || false,
                  downloads: downloadData.downloads || [],
                };
              } catch (error) {
                console.error(`Failed to fetch data for ${pkg.name}:`, error);
                return {
                  name: pkg.name,
                  hidden: pkg.hidden || false,
                  downloads: [],
                };
              }
            })
          );

          return {
            packages,
            baseline: group.baseline || false,
            start: startDate,
            end: endDate,
            color: group.color,
            error: null,
          };
        } catch (error) {
          console.error(`Failed to fetch data for package group:`, error);
          return {
            packages: group.packages.map((pkg) => ({
              name: pkg.name,
              hidden: pkg.hidden || false,
              downloads: [],
            })),
            baseline: group.baseline || false,
            start: startDate,
            end: endDate,
            color: group.color,
            error: `Failed to fetch package data: ${(error as Error).message}`,
          };
        }
      })
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error("API Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

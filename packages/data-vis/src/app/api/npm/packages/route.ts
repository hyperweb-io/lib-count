import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { npmPackage } from "@stats-db/schema";
import { asc } from "drizzle-orm";

export async function GET() {
  try {
    const packages = await db
      .select({
        name: npmPackage.packageName,
      })
      .from(npmPackage)
      .orderBy(asc(npmPackage.packageName));

    const packageNames = packages.map((p) => p.name);

    return NextResponse.json(packageNames);
  } catch (error) {
    console.error("Failed to fetch packages:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

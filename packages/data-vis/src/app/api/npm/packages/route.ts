import { NextResponse } from "next/server";
import { getS3Database } from "@/lib/s3-db";

export async function GET() {
  try {
    const db = await getS3Database();

    const packages = db
      .prepare(
        `
      SELECT DISTINCT package_name as name 
      FROM npm_package 
      ORDER BY package_name ASC
    `
      )
      .all() as { name: string }[];

    const packageNames = packages.map((p) => p.name);

    // Close the database connection
    db.close();

    return NextResponse.json(packageNames);
  } catch (error) {
    console.error("Failed to fetch packages from S3 database:", error);
    return NextResponse.json(
      { error: "Failed to fetch packages" },
      { status: 500 }
    );
  }
}

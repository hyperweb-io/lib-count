import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { category, packageCategory, npmPackage } from "@stats-db/schema";
import { eq, asc } from "drizzle-orm";
import { PackageComparison } from "@/lib/types";

export async function GET() {
  try {
    const categories = await db
      .select({
        id: category.id,
        name: category.name,
      })
      .from(category)
      .orderBy(asc(category.name));

    const comparisons: PackageComparison[] = await Promise.all(
      categories.map(async (cat) => {
        const packages = await db
          .select({
            name: npmPackage.packageName,
          })
          .from(packageCategory)
          .innerJoin(
            npmPackage,
            eq(packageCategory.packageId, npmPackage.packageName)
          )
          .where(eq(packageCategory.categoryId, cat.id));

        return {
          title: cat.name,
          packageGroups: packages.map((p) => ({
            packages: [{ name: p.name }],
            color: null,
          })),
        };
      })
    );

    return NextResponse.json(comparisons);
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

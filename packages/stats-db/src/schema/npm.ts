import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const npmPackage = sqliteTable("npm_package", {
  packageName: text("package_name").primaryKey(),
  creationDate: integer("creation_date", { mode: "timestamp" }).notNull(),
  lastPublishDate: integer("last_publish_date", {
    mode: "timestamp",
  }).notNull(),
  lastFetchedDate: integer("last_fetched_date", { mode: "timestamp" }),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(new Date())
    .$onUpdate(() => new Date()),
});

export const dailyDownloads = sqliteTable(
  "daily_downloads",
  {
    id: text("id"),
    packageName: text("package_name")
      .notNull()
      .references(() => npmPackage.packageName),
    date: integer("date", { mode: "timestamp" }).notNull(),
    downloadCount: integer("download_count").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(new Date()),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.packageName, table.date] }),
    };
  }
);

export const category = sqliteTable("category", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(new Date()),
});

export const packageCategory = sqliteTable(
  "package_category",
  {
    packageId: text("package_id").references(() => npmPackage.packageName, {
      onDelete: "cascade",
    }),
    categoryId: text("category_id").references(() => category.id, {
      onDelete: "cascade",
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(new Date()),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.packageId, table.categoryId] }),
    };
  }
);

export const npmPackageRelations = relations(npmPackage, ({ many }) => ({
  dailyDownloads: many(dailyDownloads),
  packageCategories: many(packageCategory),
}));

export const dailyDownloadsRelations = relations(dailyDownloads, ({ one }) => ({
  npmPackage: one(npmPackage, {
    fields: [dailyDownloads.packageName],
    references: [npmPackage.packageName],
  }),
}));

export const categoryRelations = relations(category, ({ many }) => ({
  packageCategories: many(packageCategory),
}));

export const packageCategoryRelations = relations(
  packageCategory,
  ({ one }) => ({
    npmPackage: one(npmPackage, {
      fields: [packageCategory.packageId],
      references: [npmPackage.packageName],
    }),
    category: one(category, {
      fields: [packageCategory.categoryId],
      references: [category.id],
    }),
  })
);

#!/usr/bin/env node
/**
 * export-categories-csv.mjs — dump the package -> category -> brand mapping as a
 * spreadsheet, so the classification can be reviewed and corrected by hand.
 *
 *   node scripts/export-categories-csv.mjs [--out exports/categories.csv]
 *
 * Edit the `category` column and hand the file back; import-categories-csv.mjs
 * applies it to config/categories.ts. Everything else is context for the
 * decision: download volume tells you whether a row matters, `in_categories`
 * flags packages filed in more than one place (those get double-counted in the
 * brand totals), and npm_description/repo say what the package actually is.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/stats_dev";

const outArg = process.argv.indexOf("--out");
const OUT =
  outArg > -1 && process.argv[outArg + 1]
    ? path.resolve(process.argv[outArg + 1])
    : path.join(ROOT, "exports", "categories.csv");

/* ---------------------------------------------------- config: the mapping ---*/

const cfgPath = path.join(
  ROOT,
  "packages/stats-db/src/config/categories.ts"
);
const cfg = fs.readFileSync(cfgPath, "utf8");

function arrayNamed(name) {
  const m = cfg.match(
    new RegExp(`export const ${name}\\s*:\\s*string\\[\\]\\s*=\\s*\\[([\\s\\S]*?)\\];`)
  );
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
}

const chainCategories = arrayNamed("chainCategories");
const utilsCategories = arrayNamed("utilsCategories");
const hidden = arrayNamed("readmeHiddenCategories");
const rollupFor = (c) =>
  chainCategories.includes(c) ? "chain" : utilsCategories.includes(c) ? "utils" : "cloud";

// packages: { category: [ "pkg", ... ] }
const pkgBlockStart = cfg.indexOf("export const packages");
let depth = 0;
let i = cfg.indexOf("{", pkgBlockStart);
const blockStart = i + 1;
do {
  if (cfg[i] === "{") depth++;
  else if (cfg[i] === "}") depth--;
  i++;
} while (depth > 0 && i < cfg.length);
const block = cfg.slice(blockStart, i - 1);

const byCategory = new Map();
for (const m of block.matchAll(/([\w-]+|"[\w-]+")\s*:\s*\[([\s\S]*?)\]/g)) {
  const cat = m[1].replace(/"/g, "");
  byCategory.set(cat, [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

// package -> every category it appears in (more than one means double counting)
const memberships = new Map();
for (const [cat, pkgs] of byCategory) {
  for (const p of pkgs) {
    if (!memberships.has(p)) memberships.set(p, []);
    memberships.get(p).push(cat);
  }
}

/* ------------------------------------------------------- downloads from db ---*/

function query(sql) {
  try {
    return execFileSync("psql", [DB, "-X", "-tA", "-F", "\t", "-c", sql], {
      encoding: "utf8",
      maxBuffer: 1 << 28,
    })
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split("\t"));
  } catch (err) {
    console.error(`  ! query failed: ${err.message.split("\n")[0]}`);
    return [];
  }
}

const stats = new Map();
for (const [name, lifetime, monthly, weekly] of query(`
  SELECT d.package_name,
         sum(d.download_count),
         sum(d.download_count) FILTER (WHERE d.date >= current_date - 30),
         sum(d.download_count) FILTER (WHERE d.date >= current_date - 7)
  FROM npm_count.daily_downloads d GROUP BY d.package_name`)) {
  stats.set(name, {
    lifetime: Number(lifetime || 0),
    monthly: Number(monthly || 0),
    weekly: Number(weekly || 0),
  });
}

/* ------------------------------------------------------------------- write ---*/

const csv = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rows = [];
for (const [pkg, cats] of memberships) {
  const cat = cats[0];
  const s = stats.get(pkg) ?? { lifetime: 0, monthly: 0, weekly: 0 };
  rows.push({
    package: pkg,
    category: cat,
    brand: rollupFor(cat),
    lifetime: s.lifetime,
    monthly: s.monthly,
    weekly: s.weekly,
    hidden_from_readme: hidden.includes(cat) ? "yes" : "",
    in_categories: cats.length > 1 ? cats.join(" + ") : "",
  });
}
// Biggest first: the rows worth arguing about are at the top.
rows.sort((a, b) => b.lifetime - a.lifetime);

const header = [
  "package",
  "category",
  "brand",
  "lifetime",
  "monthly",
  "weekly",
  "hidden_from_readme",
  "in_categories",
];
const lines = [header.join(",")];
for (const r of rows) lines.push(header.map((h) => csv(r[h])).join(","));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join("\n") + "\n");

const brandTotals = rows.reduce((acc, r) => {
  acc[r.brand] = (acc[r.brand] ?? 0) + r.lifetime;
  return acc;
}, {});
const dupes = rows.filter((r) => r.in_categories);

console.log(`wrote ${path.relative(ROOT, OUT)}  (${rows.length} packages)`);
console.log(`  categories: ${byCategory.size}   chain: ${chainCategories.length}  utils: ${utilsCategories.length}`);
for (const [b, v] of Object.entries(brandTotals).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${b.padEnd(6)} ${v.toLocaleString().padStart(14)}`);
}
if (dupes.length) {
  console.log(`\n  ${dupes.length} packages are in more than one category (double-counted):`);
  for (const d of dupes.slice(0, 12)) {
    console.log(`    ${d.package.padEnd(30)} ${d.in_categories}  (${d.lifetime.toLocaleString()})`);
  }
}

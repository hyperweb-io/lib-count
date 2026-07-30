#!/usr/bin/env node
/**
 * import-categories-csv.mjs — apply an edited categories spreadsheet back to
 * config/categories.ts.
 *
 *   node scripts/import-categories-csv.mjs exports/categories.csv --dry-run
 *   node scripts/import-categories-csv.mjs exports/categories.csv
 *
 * Only the `category` column is read; everything else in the sheet is context for
 * the human. Rewrites each category array in place rather than regenerating the
 * file, so comments and the rollup config are preserved.
 *
 * Deliberately conservative: it reports what would change and refuses to write if
 * the sheet names a category that does not exist, since a typo would silently
 * create a new bucket that no rollup covers.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFG = path.join(ROOT, "packages/stats-db/src/config/categories.ts");

const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!file) {
  console.error("usage: import-categories-csv.mjs <csv> [--dry-run]");
  process.exit(1);
}

/* --------------------------------------------------------------- parse csv ---*/

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ""));
}

const rows = parseCsv(fs.readFileSync(file, "utf8"));
const header = rows.shift().map((h) => h.trim());
const iPkg = header.indexOf("package");
const iCat = header.indexOf("category");
if (iPkg < 0 || iCat < 0) {
  console.error("csv needs at least 'package' and 'category' columns");
  process.exit(1);
}

const wanted = new Map();
for (const r of rows) {
  const pkg = (r[iPkg] || "").trim();
  const cat = (r[iCat] || "").trim();
  if (pkg && cat) wanted.set(pkg, cat);
}

/* ------------------------------------------------------------ read current ---*/

let cfg = fs.readFileSync(CFG, "utf8");
const blockStart = cfg.indexOf("{", cfg.indexOf("export const packages")) + 1;
let depth = 1;
let i = blockStart;
while (depth > 0 && i < cfg.length) {
  if (cfg[i] === "{") depth++;
  else if (cfg[i] === "}") depth--;
  i++;
}
const blockEnd = i - 1;
const block = cfg.slice(blockStart, blockEnd);

const current = new Map();
for (const m of block.matchAll(/([\w-]+|"[\w-]+")\s*:\s*\[([\s\S]*?)\]/g)) {
  const cat = m[1].replace(/"/g, "");
  current.set(cat, [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

const unknown = [...new Set([...wanted.values()].filter((c) => !current.has(c)))];
if (unknown.length) {
  console.error(`refusing to write — csv names categories that do not exist:`);
  for (const c of unknown) console.error(`    ${c}`);
  console.error(`\nadd them to config/categories.ts first (and to a rollup list),`);
  console.error(`or fix the typo in the spreadsheet.`);
  process.exit(1);
}

/* ------------------------------------------------------------------- diff ----*/

const currentOf = new Map();
for (const [cat, pkgs] of current) for (const p of pkgs) if (!currentOf.has(p)) currentOf.set(p, cat);

const moves = [];
for (const [pkg, cat] of wanted) {
  const was = currentOf.get(pkg);
  if (was && was !== cat) moves.push({ pkg, from: was, to: cat });
  else if (!was) moves.push({ pkg, from: "(new)", to: cat });
}

if (!moves.length) {
  console.log("no changes — config already matches the spreadsheet");
  process.exit(0);
}

console.log(`${moves.length} change(s):`);
for (const m of moves.slice(0, 40)) {
  console.log(`    ${m.pkg.padEnd(38)} ${m.from} -> ${m.to}`);
}
if (moves.length > 40) console.log(`    ... and ${moves.length - 40} more`);

if (dryRun) {
  console.log("\n(dry run — nothing written)");
  process.exit(0);
}

/* ------------------------------------------------------------------ write ----*/

const next = new Map([...current].map(([c, p]) => [c, [...p]]));
for (const m of moves) {
  if (m.from !== "(new)") {
    next.set(m.from, next.get(m.from).filter((p) => p !== m.pkg));
  }
  const arr = next.get(m.to);
  if (!arr.includes(m.pkg)) arr.push(m.pkg);
}

// Rewrite each array in place so surrounding comments survive.
let updated = block;
for (const [cat, pkgs] of next) {
  const key = /^[\w]+$/.test(cat) ? cat : `"${cat}"`;
  const re = new RegExp(`(\\n  ${key.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&")}:\\s*\\[)([\\s\\S]*?)(\\n  \\]|\\])`);
  const body = pkgs.length
    ? "\n" + pkgs.map((p) => `    "${p}",`).join("\n") + "\n  ]"
    : "\n  ]";
  const m = updated.match(re);
  if (!m) {
    console.error(`  ! could not rewrite category ${cat}, skipping`);
    continue;
  }
  updated = updated.replace(re, `$1${body.slice(0, -3)}$3`);
}

fs.writeFileSync(CFG, cfg.slice(0, blockStart) + updated + cfg.slice(blockEnd));
console.log(`\nwrote ${path.relative(ROOT, CFG)}`);
console.log("next: npm run npm:categories:sync && npm run npm:report && npm run npm:badges && npm run npm:readme");

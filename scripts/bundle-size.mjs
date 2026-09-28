#!/usr/bin/env node
// Measures the client JS/CSS actually shipped from .next/static and, in CI,
// compares it against a baseline captured from main. Next 16's Turbopack
// build no longer prints a per-route size table (removed in v16.0.0), so this
// reads the built static assets directly instead of parsing build output.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { analyse, findDuplicateVersions } from "./bundle-composition.mjs";

const STATIC_DIR = ".next/static";
const TRACKED_EXTENSIONS = new Set([".js", ".css"]);
const CURRENT_FILE = "bundle-size-current.json";
const BASELINE_FILE = "bundle-size-baseline.json";
// Composition is kept in its own file so the size baseline stays byte-compatible
// with the one already cached from main (#266).
const COMPOSITION_FILE = "bundle-composition-current.json";
const COMPOSITION_BASELINE_FILE = "bundle-composition-baseline.json";

// A regression only fails the build once it clears both the relative and
// absolute floor -- this keeps content-hash-only rebuilds and few-KB noise
// from tripping the check, while still catching real regressions.
const MAX_RELATIVE_INCREASE = 0.05; // 5%
const MIN_ABSOLUTE_INCREASE_BYTES = 10 * 1024; // 10 KB gzip

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (TRACKED_EXTENSIONS.has(extname(entry.name))) out.push(full);
  }
  return out;
}

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function measure() {
  if (!existsSync(STATIC_DIR)) {
    console.error(`${STATIC_DIR} not found -- run \`npm run build\` first.`);
    process.exit(1);
  }
  const files = walk(STATIC_DIR);
  let rawBytes = 0;
  let gzipBytes = 0;
  for (const file of files) {
    const buf = readFileSync(file);
    rawBytes += buf.length;
    gzipBytes += gzipSync(buf, { level: 9 }).length;
  }
  const stats = {
    generatedAt: new Date().toISOString(),
    sha: process.env.GITHUB_SHA ?? null,
    fileCount: files.length,
    rawBytes,
    gzipBytes,
  };
  writeFileSync(CURRENT_FILE, JSON.stringify(stats, null, 2));
  console.log(
    `Measured ${files.length} static asset(s): ${formatKB(rawBytes)} raw / ${formatKB(gzipBytes)} gzip`,
  );

  // Composition needs the browser source maps that ANALYZE_BUNDLE=1 turns on
  // (see next.config.ts). Without them there is nothing to attribute, so record
  // that rather than reporting a misleading empty breakdown.
  const composition = analyse(STATIC_DIR);
  const duplicates = findDuplicateVersions();
  writeFileSync(
    COMPOSITION_FILE,
    JSON.stringify(
      {
        generatedAt: stats.generatedAt,
        sha: stats.sha,
        available: true,
        totalBytes: composition.totalBytes,
        packages: composition.packages,
        topSources: composition.topSources,
        unmappedFiles: composition.unmappedFiles,
        shippedPackages: [...composition.shippedPackages],
        duplicates,
      },
      null,
      2,
    ),
  );
  console.log(
    `Attributed ${formatKB(composition.totalBytes)} across ${composition.packages.length} package(s)/bucket(s)` +
      (composition.unmappedFiles.length ? `; ${composition.unmappedFiles.length} file(s) had no map` : ""),
  );
}

function appendSummary(content) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  writeFileSync(path, `${content}\n`, { flag: "a" });
}

function report() {
  if (!existsSync(CURRENT_FILE)) {
    console.error(`${CURRENT_FILE} not found -- run \`measure\` first.`);
    process.exit(1);
  }
  const current = JSON.parse(readFileSync(CURRENT_FILE, "utf8"));
  const lines = ["## Bundle size", ""];

  if (!existsSync(BASELINE_FILE)) {
    lines.push(
      "No baseline from `main` yet -- reporting current size only.",
      "",
      "| Metric | Size |",
      "| --- | --- |",
      `| Static assets (gzip) | ${formatKB(current.gzipBytes)} |`,
      `| Static assets (raw) | ${formatKB(current.rawBytes)} |`,
    );
    appendComposition();
    const text = lines.join("\n");
    console.log(text);
    appendSummary(text);
    return;
  }

  const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  const deltaGzip = current.gzipBytes - baseline.gzipBytes;
  const deltaRaw = current.rawBytes - baseline.rawBytes;
  const deltaPct = baseline.gzipBytes === 0 ? 0 : deltaGzip / baseline.gzipBytes;
  const sign = (n) => (n >= 0 ? "+" : "");

  lines.push(
    "| Metric | Baseline (main) | This build | Change |",
    "| --- | --- | --- | --- |",
    `| Static assets (gzip) | ${formatKB(baseline.gzipBytes)} | ${formatKB(current.gzipBytes)} | ${sign(deltaGzip)}${formatKB(deltaGzip)} (${sign(deltaPct)}${(deltaPct * 100).toFixed(1)}%) |`,
    `| Static assets (raw) | ${formatKB(baseline.rawBytes)} | ${formatKB(current.rawBytes)} | ${sign(deltaRaw)}${formatKB(deltaRaw)} |`,
    "",
  );

  const failed = deltaGzip > MIN_ABSOLUTE_INCREASE_BYTES && deltaPct > MAX_RELATIVE_INCREASE;
  if (failed) {
    lines.push(
      `**Gzip size grew ${(deltaPct * 100).toFixed(1)}%, over the ${(MAX_RELATIVE_INCREASE * 100).toFixed(0)}% / ${formatKB(MIN_ABSOLUTE_INCREASE_BYTES)} budget.** ` +
        "If that's expected, say why in the PR description; if not, check for an unintentionally bundled dependency.",
    );
  } else {
    lines.push(
      `Within budget (fails only above +${(MAX_RELATIVE_INCREASE * 100).toFixed(0)}% *and* +${formatKB(MIN_ABSOLUTE_INCREASE_BYTES)} gzip).`,
    );
  }

  appendComposition();

  const text = lines.join("\n");
  console.log(text);
  appendSummary(text);

  if (failed) process.exit(1);
}

/**
 * The per-package breakdown, with each package's change against the baseline
 * from `main`. This is the part that makes a regression attributable: the size
 * table above says the bundle grew, the rows below say which package grew.
 */
function compositionLines() {
  if (!existsSync(COMPOSITION_FILE)) return [];
  const current = JSON.parse(readFileSync(COMPOSITION_FILE, "utf8"));
  const out = ["", "### Bundle composition", ""];

  if (!current.available) {
    out.push(`_Unavailable: ${current.reason}_`);
    if (current.duplicates?.length) {
      out.push("", "Duplicate versions in the lockfile:", "");
      for (const d of current.duplicates) out.push(`- \`${d.name}\`: ${d.versions.join(", ")}`);
    }
    return out;
  }

  const baseline = existsSync(COMPOSITION_BASELINE_FILE)
    ? JSON.parse(readFileSync(COMPOSITION_BASELINE_FILE, "utf8"))
    : null;
  const before = new Map((baseline?.packages ?? []).map((p) => [p.name, p.bytes]));

  out.push("Attributed bytes per package, largest first. Attribution is per source map, so treat it as a strong signal rather than an exact byte count.");
  out.push("");
  out.push("| Package | This build | Share | Change vs main |");
  out.push("| --- | --- | --- | --- |");

  for (const pkg of current.packages.slice(0, 25)) {
    const was = before.get(pkg.name);
    const delta = was === undefined ? null : pkg.bytes - was;
    const change =
      delta === null
        ? was === undefined && baseline
          ? "new"
          : "—"
        : `${delta >= 0 ? "+" : ""}${formatKB(delta)}`;
    out.push(
      `| \`${pkg.name}\` | ${formatKB(pkg.bytes)} | ${(pkg.share * 100).toFixed(1)}% | ${change} |`,
    );
  }

  const grew = current.packages
    .map((pkg) => ({ name: pkg.name, delta: pkg.bytes - (before.get(pkg.name) ?? 0) }))
    .filter((row) => row.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);
  if (baseline && grew.length) {
    out.push("", "Largest increases since `main`:");
    for (const row of grew) out.push(`- \`${row.name}\`: +${formatKB(row.delta)}`);
  }

  // Turbopack emits no map for the CSS chunk or for one large runtime chunk, so
  // name them rather than letting the gap look like an attribution failure.
  if (current.unmappedFiles?.length) {
    out.push("", "Turbopack emitted no source map for:", "");
    for (const entry of current.unmappedFiles) {
      out.push(`- \`${entry.file}\` (${formatKB(entry.bytes)})`);
    }
  }

  appendStellarSdk(current, before, out);
  appendDuplicates(current, out);

  return out;
}

/**
 * The Stellar SDK is the dependency whose shipped size depends most on import
 * shape, so it gets its own section: the total, and which SDK modules are
 * actually responsible. A jump in `curr_generated.js` in particular means an
 * XDR-typed import crept in and pulled the whole currency table along.
 */
function appendStellarSdk(current, before, out) {
  const sdk = current.packages.find((row) => row.name === "@stellar/stellar-sdk");
  if (!sdk) return;

  const was = before.get("@stellar/stellar-sdk");
  const delta = was === undefined ? null : sdk.bytes - was;

  out.push("", "#### Stellar SDK", "");
  out.push(
    `${formatKB(sdk.bytes)} (${(sdk.share * 100).toFixed(1)}% of attributed bytes)` +
      (delta === null ? "" : `, ${delta >= 0 ? "+" : ""}${formatKB(delta)} vs \`main\``),
  );
  out.push("");
  out.push("| SDK module | Bytes |");
  out.push("| --- | --- |");
  for (const source of current.topSources
    .filter((s) => s.source.includes("node_modules/@stellar/stellar-sdk/"))
    .slice(0, 8)) {
    const name = source.source.split("node_modules/@stellar/stellar-sdk/")[1];
    out.push(`| \`${name}\` | ${formatKB(source.bytes)} |`);
  }
}

/**
 * Only duplicates that reach the browser are worth a line in a bundle report —
 * the lockfile is full of build-tool duplicates that never ship. The rest are
 * counted so the omission is deliberate rather than accidental.
 */
function appendDuplicates(current, out) {
  const duplicates = current.duplicates ?? [];
  const shipped = new Set(current.shippedPackages ?? []);
  const inBrowser = duplicates.filter((d) => shipped.has(d.name));
  const buildOnly = duplicates.length - inBrowser.length;

  out.push("");
  if (inBrowser.length === 0) {
    out.push("No dependency that reaches the browser appears at more than one version.");
  } else {
    out.push("**Shipped at more than one version** — each version is a separate copy:", "");
    for (const d of inBrowser) out.push(`- \`${d.name}\`: ${d.versions.join(", ")}`);
  }
  if (buildOnly > 0) {
    out.push("", `_${buildOnly} further duplicate(s) in the lockfile are build- or dev-only and do not reach the browser._`);
  }
}

function appendComposition() {
  const lines = compositionLines();
  if (!lines.length) return;
  const text = lines.join("\n");
  console.log(text);
  appendSummary(text);
}

function composition() {
  if (!existsSync(STATIC_DIR)) {
    console.error(`${STATIC_DIR} not found -- run \`npm run build\` first.`);
    process.exit(1);
  }
  const result = analyse(STATIC_DIR);
  const text = compositionLines().join("\n") || JSON.stringify(result.packages, null, 2);
  console.log(text);
  appendSummary(text);
}

const command = process.argv[2];
if (command === "measure") measure();
else if (command === "report") report();
else if (command === "composition") composition();
else {
  console.error("Usage: bundle-size.mjs <measure|report|composition>");
  process.exit(1);
}

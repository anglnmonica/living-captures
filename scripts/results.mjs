#!/usr/bin/env node
// Reads Doc Detective's results and writes site/data/results.json: each
// test's ID, its result (PASS, FAIL, WARNING, or SKIPPED), and when the run
// happened, so each card on the page can show its own test.
//
// Run after Doc Detective: node scripts/results.mjs [RESULTS_FOLDER]

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = process.argv[2] || path.join(ROOT, "results");

// Every report file under the results folder. Doc Detective names them
// testResults*.json, in a folder per run.
function reports(d) {
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return reports(p);
    return /^testResults.*\.json$/.test(e.name) ? [p] : [];
  });
}

const tests = {};
for (const file of reports(dir)) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    continue;
  }
  for (const spec of report.specs || []) {
    for (const test of spec.tests || []) {
      if (!test.testId) continue;
      tests[test.testId] = {
        result: test.result || "UNKNOWN",
        description: test.description || "",
        spec: spec.specId || "",
      };
    }
  }
}

const out = {
  runAt: new Date().toISOString(),
  runUrl: process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
  tests,
};
fs.mkdirSync(path.join(ROOT, "site", "data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "site", "data", "results.json"), JSON.stringify(out, null, 2) + "\n");

const counts = Object.values(tests).reduce((c, t) => ({ ...c, [t.result]: (c[t.result] || 0) + 1 }), {});
console.log(`results.json: ${Object.keys(tests).length} tests`, counts);
if (!Object.keys(tests).length) console.log("No test results found. Did Doc Detective run with the runFolder reporter?");

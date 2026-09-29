import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  appliedProductionMigrations,
  latestAppliedProductionMigrationNumber,
} from "./migration-safety-policy.mjs";

const root = process.cwd();
const migrationsDir = path.join(root, "migrations");

const fail = (message) => {
  console.error(`Migration safety check failed: ${message}`);
  process.exitCode = 1;
};

const gitBlobSha = (content) => {
  const body = Buffer.from(content);
  const header = Buffer.from(`blob ${body.length}\0`);
  return crypto.createHash("sha1").update(header).update(body).digest("hex");
};

const stripSqlComments = (sql) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

for (const [name, expectedSha] of Object.entries(appliedProductionMigrations)) {
  const filePath = path.join(migrationsDir, name);
  if (!fs.existsSync(filePath)) {
    fail(`Production-applied migration ${name} was removed`);
    continue;
  }
  const actualSha = gitBlobSha(fs.readFileSync(filePath));
  if (actualSha !== expectedSha) {
    fail(
      `Production-applied migration ${name} is immutable (expected ${expectedSha}, got ${actualSha})`,
    );
  }
}

const newMigrations = migrationFiles.filter(
  (name) => !Object.hasOwn(appliedProductionMigrations, name),
);

const forbiddenPatterns = [
  ["DROP TABLE", /\bDROP\s+TABLE\b/i],
  ["DROP COLUMN", /\bDROP\s+COLUMN\b/i],
  ["DELETE FROM", /\bDELETE\s+FROM\b/i],
  ["REPLACE INTO", /\bREPLACE\s+INTO\b/i],
  ["INSERT OR REPLACE", /\bINSERT\s+OR\s+REPLACE\b/i],
  ["writable_schema", /\bPRAGMA\s+writable_schema\b/i],
];

for (const name of newMigrations) {
  const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(name);
  if (!match) {
    fail(`New migration ${name} must use NNNN_snake_case.sql naming`);
    continue;
  }
  const sequence = Number(match[1]);
  if (sequence <= latestAppliedProductionMigrationNumber) {
    fail(
      `New migration ${name} must be numbered after ${String(latestAppliedProductionMigrationNumber).padStart(4, "0")}`,
    );
  }

  const sql = stripSqlComments(
    fs.readFileSync(path.join(migrationsDir, name), "utf8"),
  );
  for (const [label, pattern] of forbiddenPatterns) {
    if (pattern.test(sql)) {
      fail(
        `${name} contains destructive pattern ${label}; use a separately approved destructive-migration procedure`,
      );
    }
  }
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const productionMigrationCommand = packageJson.scripts?.["db:migrate:prod"] ?? "";
if (!/wrangler\s+d1\s+migrations\s+apply\s+DB\s+--remote/.test(productionMigrationCommand)) {
  fail("db:migrate:prod must remain a Wrangler D1 migrations apply command");
}
if (/\b(?:execute|reset|clean|seed)\b/i.test(productionMigrationCommand)) {
  fail("db:migrate:prod must not execute data reset/seed commands");
}

const extractConfigValue = (text, key) => {
  const match = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`).exec(text);
  return match?.[1] ?? "";
};

const productionConfig = fs.readFileSync(
  path.join(root, "wrangler.jsonc"),
  "utf8",
);
const performanceConfig = fs.readFileSync(
  path.join(root, "wrangler.performance.jsonc"),
  "utf8",
);
const productionId = extractConfigValue(productionConfig, "database_id");
const previewId = extractConfigValue(productionConfig, "preview_database_id");
const performanceId = extractConfigValue(performanceConfig, "database_id");

if (!productionId || !previewId || !performanceId) {
  fail("Production / Preview / Performance D1 database IDs must all be explicit");
} else if (new Set([productionId, previewId, performanceId]).size !== 3) {
  fail("Production / Preview / Performance D1 database IDs must be distinct");
}

const productionWorkflow = fs.readFileSync(
  path.join(root, ".github/workflows/deploy-production.yml"),
  "utf8",
);
if (/wrangler\s+d1\s+execute/i.test(productionWorkflow)) {
  fail("Production deploy workflow must not use raw 'wrangler d1 execute'");
}
if (/performance-output|generate-[^\n]*fixture/i.test(productionWorkflow)) {
  fail("Production deploy workflow must not contain fixture/seed paths");
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  `Migration safety check passed: ${Object.keys(appliedProductionMigrations).length} immutable Production migrations, ${newMigrations.length} new migration(s) checked.`,
);

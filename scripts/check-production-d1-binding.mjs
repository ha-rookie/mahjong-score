import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mode = process.argv[2] ?? "build";

const fail = (message) => {
  console.error(`Production D1 binding check failed: ${message}`);
  process.exit(1);
};

const extractConfigValue = (text, key) => {
  const match = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`).exec(text);
  return match?.[1] ?? "";
};

const sourceConfigText = fs.readFileSync(
  path.join(root, "wrangler.jsonc"),
  "utf8",
);
const expectedProductionId = extractConfigValue(sourceConfigText, "database_id");
const expectedPreviewId = extractConfigValue(sourceConfigText, "preview_database_id");

if (!expectedProductionId || !expectedPreviewId) {
  fail("wrangler.jsonc must explicitly define Production database_id and preview_database_id");
}
if (expectedProductionId === expectedPreviewId) {
  fail("Production and Preview D1 IDs must be distinct");
}

const findD1Binding = (bindings, name = "DB") =>
  Array.isArray(bindings)
    ? bindings.find(
        (binding) =>
          binding?.name === name ||
          binding?.binding === name,
      )
    : undefined;

if (mode === "build") {
  const generatedPath = path.join(root, "dist/mahjong_score/wrangler.json");
  if (!fs.existsSync(generatedPath)) {
    fail("generated dist/mahjong_score/wrangler.json is missing; run build first");
  }

  const generated = JSON.parse(fs.readFileSync(generatedPath, "utf8"));
  const productionBinding = findD1Binding(generated.d1_databases);
  const previewBinding = findD1Binding(generated.previews?.d1_databases);

  if (!productionBinding) {
    fail("generated deploy config does not contain Production DB binding");
  }
  if (productionBinding.database_id !== expectedProductionId) {
    fail(
      `generated Production DB ID ${productionBinding.database_id ?? "<missing>"} does not match source ${expectedProductionId}`,
    );
  }
  if (productionBinding.preview_database_id !== expectedPreviewId) {
    fail(
      `generated preview_database_id ${productionBinding.preview_database_id ?? "<missing>"} does not match source ${expectedPreviewId}`,
    );
  }
  if (!previewBinding) {
    fail("generated deploy config does not contain Preview DB binding");
  }
  if (previewBinding.database_id !== expectedPreviewId) {
    fail(
      `generated Preview DB ID ${previewBinding.database_id ?? "<missing>"} does not match source ${expectedPreviewId}`,
    );
  }

  console.log(
    `Production D1 build binding check passed: Production=${expectedProductionId}, Preview=${expectedPreviewId}`,
  );
  process.exit(0);
}

if (mode === "deployment") {
  const versionFile = process.argv[3] ?? "/tmp/production-worker-version.json";
  if (!fs.existsSync(versionFile)) {
    fail(`deployed Worker version metadata is missing: ${versionFile}`);
  }

  const version = JSON.parse(fs.readFileSync(versionFile, "utf8"));
  const deployedBinding = findD1Binding(version.resources?.bindings);
  if (!deployedBinding || deployedBinding.type !== "d1") {
    fail("active Production Worker version does not contain D1 binding DB");
  }

  const deployedId = deployedBinding.database_id ?? deployedBinding.id ?? "";
  if (deployedId !== expectedProductionId) {
    fail(
      `active Production Worker DB ID ${deployedId || "<missing>"} does not match intended Production ${expectedProductionId}`,
    );
  }
  if (deployedId === expectedPreviewId) {
    fail("active Production Worker is bound to the Preview D1 database");
  }

  console.log(
    `Production D1 deployed binding check passed: active Worker DB=${deployedId}`,
  );
  process.exit(0);
}

fail(`unknown mode '${mode}'; expected 'build' or 'deployment'`);

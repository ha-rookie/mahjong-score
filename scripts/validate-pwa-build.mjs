import { readFileSync, existsSync } from "node:fs";

const fail = (message) => {
  console.error(`PWA validation failed: ${message}`);
  process.exitCode = 1;
};

const read = (path) => readFileSync(path, "utf8");

const manifestPath = "dist/client/manifest.webmanifest";
const swPath = "dist/client/service-worker.js";
const indexPath = "dist/client/index.html";
const iconPath = "dist/client/mahjong-score-icon.png";

for (const path of [manifestPath, swPath, indexPath, iconPath]) {
  if (!existsSync(path)) fail(`missing build artifact: ${path}`);
}

if (process.exitCode) process.exit();

const manifest = JSON.parse(read(manifestPath));
if (manifest.name !== "三麻スコア") fail("manifest name is unexpected");
if (manifest.short_name !== "三麻スコア") fail("manifest short_name is unexpected");
if (manifest.start_url !== "/") fail("manifest start_url must be /");
if (manifest.scope !== "/") fail("manifest scope must be /");
if (manifest.display !== "standalone") fail("manifest display must be standalone");
if (!Array.isArray(manifest.icons) || !manifest.icons.some((icon) => icon.src === "/mahjong-score-icon.png")) {
  fail("manifest must reference the app icon");
}

const index = read(indexPath);
if (!index.includes('rel="manifest"') || !index.includes('/manifest.webmanifest')) {
  fail("built index.html must link the manifest");
}

const sw = read(swPath);
if (!sw.includes('url.pathname.startsWith("/api/")')) {
  fail("Service Worker must explicitly bypass /api/");
}
if (sw.includes('caches.put(')) {
  fail("Service Worker must not dynamically cache runtime/API responses");
}

console.log("PWA build artifact validation passed.");

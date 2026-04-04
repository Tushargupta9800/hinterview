import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

const requiredPaths = [
  "packages/shared/dist/index.js",
  "apps/server/dist/index.js",
  "apps/renderer/dist/index.html",
  "apps/desktop/dist/main.js",
  "apps/desktop/src/native/speech-transcribe.swift",
  "codex/release-checklist.md"
];

const missing = requiredPaths.filter((relativePath) => !fs.existsSync(path.join(repoRoot, relativePath)));

if (missing.length > 0) {
  console.error("Release check failed. Missing required files:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log("Release check passed.");

import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(root);
const functionRoot = join(projectRoot, ".vercel", "output", "functions", "__server.func");
const destinationRoot = join(functionRoot, "node_modules");

const packages = [
  "playwright-core",
  "@sparticuz/chromium",
  "tar-fs",
  "tar-stream",
  "pump",
  "b4a",
  "fast-fifo",
  "end-of-stream",
  "once",
  "wrappy",
  "fs-constants",
  "streamx",
  "bare-fs",
  "bare-path",
];

async function copyPackage(packageName) {
  const source = join(projectRoot, "node_modules", packageName);
  const target = join(destinationRoot, packageName);
  try {
    await stat(source);
  } catch {
    return;
  }
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: true });
}

try {
  await stat(functionRoot);
} catch {
  process.exit(0);
}

await Promise.all(packages.map(copyPackage));
console.log("Copied PDF runtime dependencies into the Vercel function.");

/**
 * cf-build.mjs
 *
 * Wrapper for `opennextjs-cloudflare build` that ensures the OS temp directory
 * is an ASCII path on Windows. Without this, Node.js `fs.cpSync` fails when the
 * user's home directory contains non-ASCII characters (e.g. Chinese/Japanese
 * user names), causing the build to exit silently with code 127.
 *
 * This is a Windows-specific workaround; on Linux/macOS the script is a no-op
 * (os.tmpdir() will return an ASCII path in typical CI/production environments).
 */
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform === "win32") {
  const tmpDir = join(process.env.SystemDrive ?? "C:", "tmp");
  mkdirSync(tmpDir, { recursive: true });
  process.env.TEMP = tmpDir;
  process.env.TMP = tmpDir;
  process.env.TMPDIR = tmpDir;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
// Path must match the "bin" entry (dist/cli/index.js) of @opennextjs/cloudflare; re-verify on upgrade.
const cliPath = join(
  __dirname,
  "..",
  "node_modules",
  "@opennextjs",
  "cloudflare",
  "dist",
  "cli",
  "index.js"
);

const result = spawnSync(process.execPath, [cliPath, "build"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error("cf-build: failed to spawn the OpenNext CLI:", result.error.message);
}
process.exit(result.status ?? 1);

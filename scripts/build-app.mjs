// Deliberately bypass with-app-env and all migration/mail release steps.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const env = {};
const target = process.argv[2];
if (!["node", "vercel"].includes(target)) throw new Error("Expected build target: node or vercel");
// OS essentials only. No inherited DB, SMTP, Vercel, NODE_OPTIONS or VITE secrets.
for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "CI"]) {
  if (process.env[key] !== undefined) env[key] = process.env[key];
}
Object.assign(env, {
  NODE_ENV: "production",
  INC_SOUL_BUILD_TARGET: target,
  VITE_AUTH_ENABLED: "false",
});
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)), "build",
], { cwd: fileURLToPath(new URL("../", import.meta.url)), env, stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);

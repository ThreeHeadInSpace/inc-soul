// Run INSIDE incsoul-stage. No dotenv, credentials in arguments or URL logging.
const token = process.env.AMVERA_DIAGNOSTICS_TOKEN;
if (!token) {
  console.error("DB_CHECK_TOKEN_MISSING");
  process.exitCode = 1;
} else {
  try {
    const port = Number(process.env.NITRO_PORT ?? process.env.PORT ?? 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error();
    const response = await fetch(`http://127.0.0.1:${port}/_internal/db-check`, {
      method: "POST", headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000), redirect: "error",
    });
    const result = await response.json();
    const allowed = ["DB_READY", "DB_NOT_CONFIGURED", "DB_UNAVAILABLE", "DB_IDENTITY_MISMATCH", "DB_SCHEMA_UNAVAILABLE"];
    console.log(allowed.includes(result.code) ? result.code : "DB_CHECK_FAILED");
    if (!response.ok || result.ok !== true) process.exitCode = 1;
  } catch { console.error("DB_CHECK_FAILED"); process.exitCode = 1; }
}

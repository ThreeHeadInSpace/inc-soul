import { Pool, type PoolConfig } from "pg";
import { timingSafeEqual } from "node:crypto";
import { amveraEnvironment } from "../../scripts/amvera-environment.mjs";

const tableNames = ["user", "session", "account", "verification", "strips", "order_seq",
  "print_orders", "print_order_items", "print_uploads", "print_order_limits"];

export function runtimePoolConfig(env: NodeJS.ProcessEnv): PoolConfig {
  const profile = amveraEnvironment(env);
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ""); } catch { throw new Error("PostgreSQL configuration is invalid"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== profile.host || url.pathname !== `/${profile.database}` ||
      decodeURIComponent(url.username) !== "incsoulApp" || !url.password ||
      (url.port && url.port !== "5432") || url.hash ||
      [...url.searchParams.keys()].some((key) => key !== "sslmode")) {
    throw new Error("PostgreSQL configuration is invalid");
  }
  return { connectionString: url.href, max: 4, connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000, statement_timeout: 3000, query_timeout: 5000,
    idle_in_transaction_session_timeout: 5000, application_name: profile.app };
}

export function createAmveraPostgres(
  factory: (config: PoolConfig) => Pool = (config) => new Pool(config),
  env: NodeJS.ProcessEnv = process.env,
) {
  let pool: Pool | undefined;
  let closing: Promise<void> | undefined;
  function getPool() {
    if (closing) throw new Error("PostgreSQL is stopping");
    if (!pool) {
      pool = factory(runtimePoolConfig(env));
      // Never log the driver error: it can contain credentials/infrastructure.
      pool.on("error", () => console.error("[amvera-db] Idle connection unavailable"));
    }
    return pool;
  }
  return {
    async query(text: string, params: unknown[] = []) {
      try { return await getPool().query(text, params); }
      catch { throw new Error("PostgreSQL is unavailable"); }
    },
    async diagnose(): Promise<{ ok: boolean; code: string }> {
      if (!env.DATABASE_URL?.trim()) return { ok: false, code: "DB_NOT_CONFIGURED" };
      let client;
      let failed = false;
      let code = "DB_UNAVAILABLE";
      try {
        const profile = amveraEnvironment(env);
        client = await getPool().connect();
        await client.query("BEGIN READ ONLY");
        const { rows: [identity] } = await client.query(`select current_database() as db,
          current_user as role, session_user as login, current_setting('server_version_num')::int as version,
          (select rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls
           from pg_roles where rolname=current_user) as elevated`);
        if (identity?.db !== profile.database || identity.role !== "incsoulApp" ||
            identity.login !== "incsoulApp" || identity.version < 170000 || identity.version >= 180000 ||
            identity.elevated !== false) return { ok: false, code: "DB_IDENTITY_MISMATCH" };
        code = "DB_SCHEMA_UNAVAILABLE";
        // Fixed identifiers only. SELECT privileges + relation/column resolution,
        // zero customer rows returned. Runtime has no migration-history access.
        for (const name of tableNames) await client.query(`SELECT * FROM public."${name}" LIMIT 0`);
        return { ok: true, code: "DB_READY" };
      } catch {
        failed = true;
        return { ok: false, code };
      } finally {
        if (client) {
          try { await client.query("ROLLBACK"); } catch { failed = true; }
          client.release(failed);
        }
      }
    },
    close() {
      closing ??= pool ? pool.end().catch(() => { console.error("[amvera-db] Pool shutdown failed"); }) : Promise.resolve();
      return closing;
    },
  };
}

const state = globalThis as typeof globalThis & { __amveraPostgres?: ReturnType<typeof createAmveraPostgres> };
export function amveraPostgres() {
  return state.__amveraPostgres ??= createAmveraPostgres();
}

export async function handleDbDiagnostic(
  request: Pick<Request, "method" | "headers">,
  nodeBuild: boolean,
  env: NodeJS.ProcessEnv = process.env,
  diagnose = () => amveraPostgres().diagnose(),
) {
  const token = env.AMVERA_DIAGNOSTICS_TOKEN ?? "";
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  const authorized = nodeBuild && env.AMVERA_DB_DIAGNOSTICS === "1" && request.method === "POST" &&
    token.length >= 32 && token.length <= 256 && supplied.length === expected.length;
  const suppliedBytes = Buffer.from(authorized ? supplied : "");
  const expectedBytes = Buffer.from(expected);
  if (!authorized || suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
  }
  let result;
  try { result = await diagnose(); } catch { result = { ok: false, code: "DB_UNAVAILABLE" }; }
  return Response.json(result, { status: result.ok ? 200 : 503,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

#!/usr/bin/env node
// No dotenv loading. Default --plan is offline; only --apply writes to the DB.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";

export const migrationName = "0001_baseline.sql";
export const tables = ["account", "order_seq", "print_order_items", "print_order_limits",
  "print_orders", "print_uploads", "session", "strips", "user", "verification"];

export async function loadPlan() {
  const sql = (await readFile(new URL("../migrations/amvera/0001_baseline.sql", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  return { name: migrationName, sql, sha256: createHash("sha256").update(sql).digest("hex") };
}

export function validateTarget(env) {
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error("DATABASE_URL is required (not logged)"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !/^(?:amvera-[a-z0-9-]+-)?cnpg-incsoul-db-stage-rw$/.test(url.hostname) ||
      url.hostname !== env.AMVERA_DB_HOST || url.pathname !== "/incsoulStage" ||
      decodeURIComponent(url.username) !== "incsoul_migrator" || !url.password ||
      (url.port && url.port !== "5432") || url.hash ||
      [...url.searchParams.keys()].some((key) => key !== "sslmode")) {
    throw new Error("Refusing target: require pinned internal stage -rw host, incsoulStage and incsoul_migrator");
  }
  return url.href;
}

export async function inspectIdentity(client) {
  const { rows: [state] } = await client.query(`
    select current_database() as db, current_user as role, session_user as login,
      current_setting('server_version_num')::int as version,
      (select rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls from pg_roles where rolname=current_user) as elevated,
      (select rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls from pg_roles where rolname='incsoulApp') as app_elevated,
      pg_has_role('incsoulApp','incsoul_migrator','MEMBER') as app_member,
      has_schema_privilege('incsoulApp','public','CREATE') as app_create,
      has_database_privilege('incsoulApp',current_database(),'CREATE') as app_db_create,
      (select pg_get_userbyid(datdba) from pg_database where datname=current_database()) as owner
  `);
  if (state.db !== "incsoulStage" || state.role !== "incsoul_migrator" || state.login !== state.role ||
      state.version < 170000 || state.version >= 180000 || state.elevated !== false ||
      state.app_elevated !== false || state.app_member !== false || state.app_create !== false || state.app_db_create !== false ||
      state.owner !== "incsoul_migrator") {
    throw new Error("Database identity/version/role isolation check failed; review bootstrap-roles.sql");
  }
}

export async function inspectHistory(client, plan) {
  const { rows: [{ exists }] } = await client.query("select to_regclass('public._amvera_migrations') is not null as exists");
  if (exists) {
    const { rows } = await client.query("select name,sha256 from public._amvera_migrations order by name");
    if (rows.length !== 1 || rows[0].name !== plan.name || rows[0].sha256 !== plan.sha256) {
      throw new Error("Migration history/checksum mismatch; refusing to modify database");
    }
    const found = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename`);
    const expected = ["_amvera_migrations", ...tables].sort();
    if (JSON.stringify(found.rows.map((r) => r.tablename)) !== JSON.stringify(expected)) {
      throw new Error("Baseline table inventory mismatch");
    }
    return true;
  }
  // Never adopt a partially initialized/legacy database, including routines/views.
  const { rows: [{ occupied }] } = await client.query(`select
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public')
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')
    or exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public')
    as occupied`);
  if (occupied) throw new Error("Baseline requires an empty public schema; no automatic reset or data import");
  return false;
}

export async function applyBaseline(client, plan) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SET LOCAL search_path = public, pg_catalog");
    await client.query("SELECT pg_advisory_xact_lock(731402, 1)");
    const applied = await inspectHistory(client, plan);
    if (!applied) {
      await client.query(`create table public._amvera_migrations (
        name text primary key, sha256 text not null check(length(sha256)=64),
        applied_at timestamptz not null default now())`);
      await client.query('revoke all on public._amvera_migrations from public,"incsoulApp"');
      await client.query("alter table public._amvera_migrations enable row level security");
      await client.query(plan.sql);
      await client.query("insert into public._amvera_migrations(name,sha256) values($1,$2)", [plan.name, plan.sha256]);
    }
    await client.query("COMMIT");
    return applied ? "Already applied; checksum verified" : "Baseline applied atomically";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

export function parseMigrationArgs(args) {
  const mode = args[0] ?? "--plan";
  if (!["--plan", "--check", "--apply"].includes(mode) ||
      args.slice(1).some((arg) => arg !== "--confirm=incsoulStage") ||
      (mode === "--apply" && !args.includes("--confirm=incsoulStage"))) {
    throw new Error("Usage: amvera-migrate.mjs [--plan | --check | --apply --confirm=incsoulStage]");
  }
  return mode;
}

async function main() {
  const mode = parseMigrationArgs(process.argv.slice(2));
  const plan = await loadPlan();
  if (mode === "--plan") {
    console.log(`Offline plan: ${plan.name}; SHA256 ${plan.sha256}; ${tables.length} app tables + _amvera_migrations`);
    return;
  }
  const connectionString = validateTarget(process.env);
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000,
    query_timeout: 70000, application_name: "incsoul-stage-schema-migration" });
  try {
    await client.connect();
    await inspectIdentity(client);
    if (mode === "--check") {
      await client.query("BEGIN READ ONLY");
      try {
        console.log(await inspectHistory(client, plan) ? "Baseline already applied; checksum verified" : "Empty stage database ready for baseline");
      } finally { await client.query("ROLLBACK"); }
    } else {
      console.log(await applyBaseline(client, plan));
    }
  } finally { await client.end().catch(() => {}); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Driver messages/details may include connection credentials or row values.
    console.error("[amvera-migrate] failed:", error instanceof pg.DatabaseError ? `SQLSTATE ${error.code}` :
      (error.code ? `connection/system error ${error.code}` :
        /DATABASE_URL|Refusing target|identity\/version|Migration history|Baseline|Usage:/.test(error.message)
          ? error.message : "operation failed; no credentials logged"));
    process.exitCode = 1;
  });
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createAmveraPostgres, runtimePoolConfig, handleDbDiagnostic } from "../src/lib/amvera-postgres.server.ts";

const env = { DATABASE_URL:"postgresql://incsoulApp:test-only@cnpg-incsoul-db-stage-rw:5432/incsoulStage",
  AMVERA_DB_DIAGNOSTICS:"1", AMVERA_DIAGNOSTICS_TOKEN:"local-test-token-12345678901234567890" };
const identity = { db:"incsoulStage",role:"incsoulApp",login:"incsoulApp",version:170000,elevated:false };
function fixture({ row = identity, connectError = false, tableError = false, rollbackError = false } = {}) {
  const calls = [];
  let created = 0, ended = 0;
  const client = {
    async query(sql) {
      calls.push(sql);
      if (tableError && sql.startsWith("SELECT *")) throw new Error("private SQL secret");
      if (rollbackError && sql === "ROLLBACK") throw new Error("private host");
      return { rows: sql.includes("current_database()") ? [row] : [] };
    },
    release(destroy) { calls.push(["release",destroy]); },
  };
  let onError;
  const pool = {
    on(_name, fn) { onError = fn; },
    async connect() { if (connectError) throw new Error(env.DATABASE_URL); return client; },
    async query() { throw new Error(env.DATABASE_URL); },
    async end() { ended++; },
  };
  const runtime = createAmveraPostgres((config) => { created++; assert.equal(config.max,4); return pool; },env);
  return { runtime,calls, counts:() => ({created,ended}), error:() => onError };
}

test("Amvera config pins runtime identity, bounds pool/timeouts and never accepts migration/admin roles", () => {
  const config = runtimePoolConfig(env);
  assert.equal(config.max,4); assert.equal(config.connectionTimeoutMillis,3000);
  assert.equal(config.statement_timeout,3000); assert.equal(config.query_timeout,5000);
  for (const DATABASE_URL of [undefined,"",env.DATABASE_URL.replace("incsoulApp","postgres"),
    env.DATABASE_URL.replace("incsoulApp","incsoul_migrator"),env.DATABASE_URL.replace("incsoulStage","other"),
    env.DATABASE_URL.replace("cnpg-incsoul-db-stage-rw","example.test"),env.DATABASE_URL+"?options=-cfoo=bar"]) {
    assert.throws(() => runtimePoolConfig({DATABASE_URL}),/configuration is invalid/);
  }
});

test("diagnostic uses one read-only transaction and zero customer rows; releases client", async () => {
  const f = fixture();
  assert.equal(f.counts().created,0);
  assert.deepEqual(await f.runtime.diagnose(),{ok:true,code:"DB_READY"});
  assert.equal(f.calls[0],"BEGIN READ ONLY");
  assert.equal(f.calls.filter((sql) => typeof sql === "string" && sql.startsWith("SELECT *")).length,10);
  for (const sql of f.calls.filter((q) => typeof q === "string")) {
    assert.match(sql,/^(BEGIN READ ONLY|select |SELECT .* LIMIT 0|ROLLBACK)/);
    assert.doesNotMatch(sql,/INSERT|UPDATE|CREATE|DELETE|_migrations/);
  }
  assert.deepEqual(f.calls.at(-1),["release",false]);
  await f.runtime.diagnose();
  assert.equal(f.counts().created,1);
  await Promise.all([f.runtime.close(),f.runtime.close()]);
  assert.equal(f.counts().ended,1);
  await assert.rejects(f.runtime.query("SELECT 1"),/^Error: PostgreSQL is unavailable$/);
  assert.equal(f.counts().created,1);
});

test("connection, schema and identity failures are safe; failed sessions destroyed without fallback", async () => {
  for (const [options,code] of [[{connectError:true},"DB_UNAVAILABLE"],
    [{tableError:true},"DB_SCHEMA_UNAVAILABLE"], [{row:{...identity,db:"other"}},"DB_IDENTITY_MISMATCH"],
    [{row:{...identity,role:"postgres"}},"DB_IDENTITY_MISMATCH"],
    [{row:{...identity,elevated:true}},"DB_IDENTITY_MISMATCH"]]) {
    const f = fixture(options);
    assert.deepEqual(await f.runtime.diagnose(),{ok:false,code});
    if (options.tableError) assert.deepEqual(f.calls.at(-1),["release",true]);
    if (code === "DB_IDENTITY_MISMATCH") assert.ok(!f.calls.some((s) => typeof s === "string" && s.startsWith("SELECT *")));
    await f.runtime.close();
  }
  const f = fixture({rollbackError:true});
  await f.runtime.diagnose();
  assert.deepEqual(f.calls.at(-1),["release",true]);
  await assert.rejects(f.runtime.query("SELECT 1"),/^Error: PostgreSQL is unavailable$/);
  const original = console.error;
  const logs=[];
  try { console.error=(...args) => logs.push(args.join(" ")); f.error()(new Error(env.DATABASE_URL)); }
  finally { console.error=original; }
  assert.doesNotMatch(logs.join(""),/test-only|cnpg-|postgresql:/);
  await f.runtime.close();
  let constructed=false;
  const missing = createAmveraPostgres(() => { constructed=true; throw new Error(); },{});
  assert.deepEqual(await missing.diagnose(),{ok:false,code:"DB_NOT_CONFIGURED"});
  assert.equal(constructed,false);
});

test("HTTP diagnostic is closed by default, Node-only, token protected, and never leaks raw errors", async () => {
  let count=0;
  const request=(token=env.AMVERA_DIAGNOSTICS_TOKEN,method="POST") => new Request("http://localhost/_internal/db-check",
    {method,headers:{authorization:`Bearer ${token}`}});
  for (const [req,node,settings] of [[request(),false,env],[request(),true,{}],
    [request("wrong"),true,env],[request("é".repeat(env.AMVERA_DIAGNOSTICS_TOKEN.length)),true,env],
    [request(undefined,"GET"),true,env],
    [request(),true,{...env,AMVERA_DB_DIAGNOSTICS:"0"}]]) {
    assert.equal((await handleDbDiagnostic(req,node,settings,async () => {count++;})).status,404);
  }
  assert.equal(count,0);
  const success=await handleDbDiagnostic(request(),true,env,async () => ({ok:true,code:"DB_READY"}));
  assert.equal(success.status,200); assert.equal(success.headers.get("cache-control"),"no-store");
  const failure=await handleDbDiagnostic(request(),true,env,async () => {throw new Error(env.DATABASE_URL);});
  assert.equal(failure.status,503); assert.deepEqual(await failure.json(),{ok:false,code:"DB_UNAVAILABLE"});
});

test("Node build/start stay migration-free and checkout/auth gates remain closed", async () => {
  const read=(p) => readFile(new URL(p, new URL("../",import.meta.url)),"utf8");
  const pkg=JSON.parse(await read("package.json"));
  assert.equal(pkg.scripts.start,"node .output/server/index.mjs");
  assert.equal(pkg.scripts["build:node"],"node scripts/build-app.mjs node");
  assert.doesNotMatch(await read("Dockerfile"),/RUN .*migrat/);
  assert.doesNotMatch(await read("scripts/build-app.mjs"),/spawn.*migrat/);
  assert.match(await read("src/lib/pricing.ts"),/FREE_MVP = true/);
  assert.match(await read("src/lib/free-print-orders.ts"),/!import.meta.env.INC_SOUL_NODE_BUILD/);
  assert.match(await read("src/routes/api/auth/$.ts"),/if \(FREE_MVP\) return new Response\("Not Found"/);
});

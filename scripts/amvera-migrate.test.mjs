import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { loadPlan, applyBaseline, validateTarget, inspectHistory, inspectIdentity } from "./amvera-migrate.mjs";
import { registerCartPrintOrder } from "../src/lib/free-print-store.server.ts";

const host = "amvera-test-cnpg-incsoul-db-stage-rw";
const target = { AMVERA_DB_HOST: host,
  DATABASE_URL: `postgresql://incsoul_migrator:test-only@${host}:5432/incsoul_stage` };

test("target guard rejects runtime, external, wrong database and connection options", () => {
  assert.ok(validateTarget(target));
  assert.ok(validateTarget({ AMVERA_DB_HOST:"cnpg-incsoul-db-stage-rw",
    DATABASE_URL:target.DATABASE_URL.replace(host,"cnpg-incsoul-db-stage-rw") }));
  for (const env of [ {}, { ...target, AMVERA_DB_HOST: "other" },
    ...[target.DATABASE_URL.replace(host,"localhost"),
      target.DATABASE_URL.replace("incsoul_stage","production"),
      target.DATABASE_URL.replace("incsoul_migrator","incsoulApp"),
      target.DATABASE_URL + "?options=-csearch_path=other", target.DATABASE_URL.replace("-rw", "-ro")]
      .map((DATABASE_URL) => ({ ...target, DATABASE_URL })) ]) {
    assert.throws(() => validateTarget(env));
  }
});

async function createDb() {
  const db = new PGlite();
  // pg uses the simple-query protocol for parameterless multi-statement SQL.
  const query = db.query.bind(db);
  db.query = (sql, params) => params ? query(sql,params) : db.exec(sql).then((r) => r.at(-1));
  await db.exec(`create role incsoul_migrator login; create role "incsoulApp" login;
    revoke create on schema public from public;
    grant usage,create on schema public to incsoul_migrator;
    set role incsoul_migrator`);
  return db;
}
const columns = `select table_name,column_name,data_type,is_nullable,column_default
  from information_schema.columns where table_schema='public'
  and table_name not in ('_migrations','_amvera_migrations') order by table_name,column_name`;
const constraints = `select c.relname,pg_get_constraintdef(k.oid) as definition from pg_constraint k
  join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname not in ('_migrations','_amvera_migrations')
  order by c.relname,definition`;

test("identity guard reads actual role flags and rejects elevated app and direct/indirect migration membership", async () => {
  const db = await createDb();
  try {
    await db.exec('reset role; revoke create on database postgres from public,"incsoulApp"; set role incsoul_migrator');
    // PGlite is PG18 in a single local database; emulate ONLY the deployment
    // identity fields. Role flags/memberships/privileges come from real SQL.
    const client = { query: async (text) => {
      const result = await db.query(text);
      return { rows: [{ ...result.rows[0], db:"incsoul_stage", version:170000,
        login:"incsoul_migrator", owner:"incsoul_migrator" }] };
    } };
    const admin = async (sql) => {
      await db.exec(`reset role; ${sql}; set role incsoul_migrator`);
    };
    await inspectIdentity(client);
    for (const attribute of ["superuser","createdb","createrole","replication","bypassrls"]) {
      await admin(`alter role "incsoulApp" ${attribute}`);
      await assert.rejects(inspectIdentity(client),/role isolation check failed/);
      await admin(`alter role "incsoulApp" no${attribute}`);
      await inspectIdentity(client);
    }
    await admin('grant incsoul_migrator to "incsoulApp"');
    await assert.rejects(inspectIdentity(client),/role isolation check failed/);
    await admin('revoke incsoul_migrator from "incsoulApp"');
    await inspectIdentity(client);
    // A NOLOGIN group exists only inside this disposable embedded test DB.
    await admin('create role fixture_migration_group nologin; grant incsoul_migrator to fixture_migration_group; grant fixture_migration_group to "incsoulApp"');
    await assert.rejects(inspectIdentity(client),/role isolation check failed/);
    await admin('revoke fixture_migration_group from "incsoulApp"');
    await inspectIdentity(client);
    await admin('grant create on schema public to "incsoulApp"');
    await assert.rejects(inspectIdentity(client),/role isolation check failed/);
    await admin('revoke create on schema public from "incsoulApp"');
    await admin('grant create on database postgres to "incsoulApp"');
    await assert.rejects(inspectIdentity(client),/role isolation check failed/);
    await admin('revoke create on database postgres from "incsoulApp"');
    await inspectIdentity(client);
    await admin('alter role "incsoulApp" rename to incsoulapp');
    await assert.rejects(inspectIdentity(client)); // Unquoted lowercase is a different role.
  } finally { await db.close(); }
});

test("baseline matches legacy column/constraint contract without importing Supabase objects", async () => {
  const fresh = await createDb();
  const legacy = new PGlite();
  try {
    console.log("Embedded test engine:", (await fresh.query("select version() as v")).rows[0].v);
    await applyBaseline(fresh, await loadPlan());
    await legacy.exec("create table _migrations(name text primary key)");
    const dir = new URL("../migrations/", import.meta.url);
    for (const name of (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort()) {
      await legacy.exec(await readFile(new URL(name,dir),"utf8"));
    }
    // Normalize serial regclass qualification only; names/types/defaults/nullability must agree.
    const normalize = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r)
      .map(([k,v]) => [k,typeof v === "string" ? v.replaceAll("public.","") : v])));
    assert.deepEqual(normalize((await fresh.query(columns)).rows), normalize((await legacy.query(columns)).rows));
    assert.deepEqual(normalize((await fresh.query(constraints)).rows), normalize((await legacy.query(constraints)).rows));
    assert.equal((await fresh.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n,11);
    assert.deepEqual((await fresh.query("select n from order_seq")).rows,[{n:0}]);
  } finally { await fresh.close(); await legacy.close(); }
});

test("atomic history, safe rerun, altered checksums and partial databases", async () => {
  const db = await createDb();
  const plan = await loadPlan();
  try {
    await assert.rejects(applyBaseline(db,{ ...plan, sql: plan.sql + "; select missing_column;" }));
    assert.equal((await db.query("select to_regclass('public.print_orders') as t")).rows[0].t,null);
    assert.equal((await db.query("select to_regclass('public._amvera_migrations') as t")).rows[0].t,null);
    await db.exec("create table unexpected(id int)");
    await assert.rejects(applyBaseline(db,plan),/empty public/);
    await db.exec("drop table unexpected");
    assert.match(await applyBaseline(db,plan),/applied atomically/);
    assert.match(await applyBaseline(db,plan),/Already applied/);
    await assert.rejects(inspectHistory(db,{ ...plan, sha256:"0".repeat(64) }),/checksum mismatch/);
  } finally { await db.close(); }
});

test("non-owner runtime can use real cart SQL/number trigger and auth FK but cannot DDL or write history", async () => {
  const db = await createDb();
  try {
    await applyBaseline(db,await loadPlan());
    await db.exec('reset role; set session authorization "incsoulApp"');
    const sql = async (parts,...args) => (await db.query(
      parts.reduce((q,p,i) => q + (i ? "$"+i : "") + p,""),args)).rows;
    const requestId = randomUUID(), stripId = randomUUID();
    await db.query("insert into print_uploads(request_id,strip_id,png,options) values($1,$2,$3,'{}')",
      [requestId,stripId,Buffer.from("synthetic-local-fixture")]);
    const input = { requestId,lines:[{stripId,quantity:2}], delivery:{customerName:"Local test",
      postalCode:"000001",region:"test",city:"test",street:"test",building:"1",buildingExtension:"",
      apartment:"",phone:"",email:"test@example.test"} };
    const result = await registerCartPrintOrder(sql,input,async () => false);
    assert.equal(result.ok,true);
    assert.equal(result.orderNumber,"000-001");
    assert.equal((await registerCartPrintOrder(sql,input,async () => false)).orderNumber,"000-001");
    assert.equal((await db.query("select n from order_seq")).rows[0].n,1);
    await db.exec("update print_orders set notification_status='sending'");
    await assert.rejects(db.exec("update print_order_items set quantity=13")); // No UPDATE grant.
    await assert.rejects(db.query("insert into print_order_items(order_id,strip_id,quantity,png,options) values(1,$1,13,'x','{}')",[randomUUID()]));
    await assert.rejects(db.exec("create table forbidden(id int)"));
    await assert.rejects(db.exec("drop table print_orders"));
    await assert.rejects(db.exec("select * from _amvera_migrations"));
    await assert.rejects(db.exec("set role incsoul_migrator"));
    await db.exec(`insert into "user"(id,name,email,"emailVerified") values('test','Test','local@example.test',false);
      insert into "session"(id,"expiresAt",token,"updatedAt","userId") values('s',now(),'token',now(),'test');
      delete from "user" where id='test'`);
    assert.equal((await db.query('select count(*)::int as n from "session"')).rows[0].n,0);
  } finally { await db.close(); }
});

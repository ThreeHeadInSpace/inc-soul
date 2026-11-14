import { definePlugin } from "nitro";
import { amveraPostgres } from "../../src/lib/amvera-postgres.server";

export default definePlugin((app) => {
  if (!import.meta.env.INC_SOUL_NODE_BUILD) return;
  // srvx closes HTTP on these signals. Drain the shared DB pool alongside it;
  // do not call process.exit or replace srvx's shutdown listeners.
  const close = () => { void amveraPostgres().close(); };
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
  app.hooks.hook("close", async () => {
    process.off("SIGTERM", close);
    process.off("SIGINT", close);
    await amveraPostgres().close();
  });
});

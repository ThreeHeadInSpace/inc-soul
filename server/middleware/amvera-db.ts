import { handleDbDiagnostic } from "../../src/lib/amvera-postgres.server";

export default function amveraDbMiddleware(
  event: { url: URL; req: Request }, next: () => unknown | Promise<unknown>,
) {
  if (event.url.pathname !== "/_internal/db-check") return next();
  return handleDbDiagnostic(event.req, import.meta.env.INC_SOUL_NODE_BUILD);
}

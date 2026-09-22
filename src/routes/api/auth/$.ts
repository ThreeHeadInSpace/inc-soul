import { createFileRoute } from "@tanstack/react-router";
import { FREE_MVP } from "@/lib/pricing";

async function handleAuth(request: Request) {
  if (FREE_MVP) return new Response("Not Found", { status: 404 });
  const { auth } = await import("@/lib/auth/server");
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuth(request),
      POST: ({ request }) => handleAuth(request),
    },
  },
});

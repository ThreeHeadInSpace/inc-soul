import { PRODUCTION_URL } from "@/lib/share";
import { createFileRoute } from "@tanstack/react-router";
import { BoothSession } from "@/components/booth/BoothApp";

export const Route = createFileRoute("/booth")({
  head: () => ({ links: [{ rel: "canonical", href: new URL("booth", PRODUCTION_URL).href }] }),
  component: BoothSession,
});

import { PRODUCTION_URL } from "@/lib/share";
import { createFileRoute } from "@tanstack/react-router";
import { HomeHub } from "@/components/booth/BoothApp";

export const Route = createFileRoute("/")({
  head: () => ({ links: [{ rel: "canonical", href: PRODUCTION_URL }] }),
  component: HomeHub,
});

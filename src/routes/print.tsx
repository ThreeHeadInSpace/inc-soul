import { FREE_MVP } from "@/lib/pricing";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { PrintSession } from "@/components/booth/BoothApp";

export const Route = createFileRoute("/print")({
  beforeLoad: () => {
    if (FREE_MVP) throw redirect({ to: "/" });
  },
  component: PrintSession,
});

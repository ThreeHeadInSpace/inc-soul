import { createFileRoute } from "@tanstack/react-router";
import { HomeHub } from "@/components/booth/BoothApp";

export const Route = createFileRoute("/")({ component: HomeHub });

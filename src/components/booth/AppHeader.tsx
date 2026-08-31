import { Link } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const { user, isPending } = useCurrentUserState();

  return (
    <header className="mb-2 flex flex-wrap items-center justify-between gap-3">
      <Link to="/" className="text-left">
        <span className="font-script text-3xl leading-none text-paper">inc&soul</span>
        <span className="mt-1 block text-xs uppercase tracking-caps text-fg-subtle">
          Photobooth
        </span>
      </Link>
      <nav className="flex items-center gap-2">
        <Button variant="primary" asChild>
          <Link to="/cabinet">
            <span className="sm:hidden">Кабинет</span>
            <span className="hidden sm:inline">Личный кабинет</span>
          </Link>
        </Button>
        {isPending ? (
          <div className="h-8 w-16 animate-pulse rounded-full bg-bg-subtle" />
        ) : user ? (
          <UserButton />
        ) : (
          <Button variant="outline" asChild>
            <Link to="/login">Войти</Link>
          </Button>
        )}
      </nav>
    </header>
  );
}

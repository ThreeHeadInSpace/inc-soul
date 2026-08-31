import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  GROK_PROVIDERS,
  authClient,
  authEnabled,
  signIn,
} from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageFrame } from "@/components/booth/BoothApp";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "up") {
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: name.trim() || email,
          callbackURL: "/",
        });
        if (err) throw new Error(err.message);
      } else {
        const { error: err } = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/",
        });
        if (err) throw new Error(err.message);
      }
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame>
        <main className="mx-auto grid w-full max-w-sm gap-6 py-6">
          <div>
            <p className="text-xs uppercase tracking-caps text-fg-subtle">Аккаунт</p>
            <h1 className="font-display text-3xl tracking-tight">
              {mode === "in" ? "Войти" : "Регистрация"}
            </h1>
            <p className="mt-2 text-sm text-fg-muted">
              Google, X или почта. Шаблоны сохраняются в кабинете.
            </p>
          </div>

          {authEnabled ? (
            <>
              <div className="flex flex-col gap-2">
                {GROK_PROVIDERS.map((p) => (
                  <Button
                    key={p.providerId}
                    variant="outline"
                    onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
                  >
                    Продолжить с {p.label}
                  </Button>
                ))}
              </div>

              <p className="text-center text-xs uppercase tracking-caps text-fg-subtle">
                или почта
              </p>

              <form onSubmit={(e) => void onEmail(e)} className="flex flex-col gap-3">
                {mode === "up" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="name">Имя</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Почта</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">Пароль</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "up" ? "new-password" : "current-password"}
                  />
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button type="submit" disabled={busy}>
                  {busy ? "Секунду…" : mode === "in" ? "Войти" : "Создать аккаунт"}
                </Button>
              </form>

              <button
                type="button"
                className="text-sm text-fg-muted hover:text-fg"
                onClick={() => {
                  setMode(mode === "in" ? "up" : "in");
                  setError(null);
                }}
              >
                {mode === "in" ? "Нет аккаунта — зарегистрироваться" : "Уже есть аккаунт — войти"}
              </button>
            </>
          ) : (
            <p className="text-sm text-fg-muted">Вход временно выключен.</p>
          )}

          <Link to="/" className="text-sm text-fg-subtle hover:text-fg">
            Назад к будке
          </Link>
        </main>
    </PageFrame>
  );
}

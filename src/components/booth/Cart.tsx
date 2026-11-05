import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FreePrintCheckout } from "./FreePrintCheckout";
import { getPreviewPrintAvailability } from "@/lib/free-print-orders";
import { changeCart, readCart, readPrintAsset, type CartLine } from "@/lib/cart-store";
import { CART_LIMITS } from "@/lib/cart-limits";

export function StripLightbox({
  children,
  load,
}: {
  children: ReactNode;
  load: () => Promise<Blob>;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let url = "";
    setError("");
    void load()
      .then((blob) => {
        if (!disposed) {
          url = URL.createObjectURL(blob);
          setUrl(url);
        }
      })
      .catch(() => setError("Не удалось прочитать оригинал."));
    return () => {
      disposed = true;
      URL.revokeObjectURL(url);
      setUrl("");
    };
  }, [open, load]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/90" />
        <Dialog.Content
          className="strip-lightbox"
          style={{ zIndex: 71 }}
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Фотолента целиком</Dialog.Title>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" aria-label="Закрыть просмотр">
              <X />
            </Button>
          </Dialog.Close>
          {url && <img src={url} alt="Фотолента целиком" className="strip-lightbox-image" />}
          {error && <p role="alert">{error}</p>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type CartContext = {
  enabled: boolean;
  lines: CartLine[];
  add: (id: string, checkout?: boolean) => Promise<void>;
  openCart: () => void;
};
const Context = createContext<CartContext>({
  enabled: false,
  lines: [],
  add: async () => {},
  openCart: () => {},
});
export const useCart = () => useContext(Context);

function CartPreview({ line }: { line: CartLine }) {
  // The original is loaded only when the lightbox opens.
  async function load() {
    const asset = await readPrintAsset(line.stripId);
    if (!asset?.png) throw new Error();
    return asset.png;
  }
  return (
    <StripLightbox load={load}>
      <button type="button" aria-label="Увеличить фотоленту">
        <img src={line.preview} alt="Фотолента · 3 кадра" className="h-28 w-14 object-contain" />
      </button>
    </StripLightbox>
  );
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    void getPreviewPrintAvailability()
      .then(setEnabled)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const refresh = () => {
      void readCart()
        .then((cart) => {
          setLines(cart.lines);
          setPending(Boolean(cart.pending));
          setError("");
        })
        .catch(() =>
          setError("Не удалось прочитать корзину. Разрешите доступ к хранилищу браузера."),
        );
    };
    refresh();
    window.addEventListener("incsoul-cart", refresh);
    return () => window.removeEventListener("incsoul-cart", refresh);
  }, []);
  async function add(id: string, checkout = false) {
    try {
      await changeCart(id, "add");
      toast.success("Фотолента в корзине", {
        action: {
          label: "Перейти в корзину",
          onClick: () => {
            setCheckout(false);
            setOpen(true);
          },
        },
      });
      if (checkout) {
        setCheckout(true);
        setOpen(true);
      }
    } catch {
      toast.error(
        "Не удалось добавить фотоленту. Проверьте оригинал, свободное место или незавершённый заказ.",
      );
    }
  }
  async function update(id: string, quantity: number) {
    try {
      await changeCart(id, quantity);
    } catch {
      setError("Не удалось изменить корзину.");
    }
  }
  return (
    <Context.Provider
      value={{
        enabled,
        lines,
        add,
        openCart: () => {
          setCheckout(false);
          setOpen(true);
        },
      }}
    >
      {children}
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl bg-bg-elevated p-5"
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              if (busy) e.preventDefault();
            }}
          >
            {checkout ? (
              <FreePrintCheckout
                lines={lines}
                onBusy={setBusy}
                onBack={() => setCheckout(false)}
                draft={draft}
                onDraft={setDraft}
              />
            ) : (
              <>
                <Dialog.Title className="font-display text-2xl">Корзина</Dialog.Title>
                <Dialog.Description className="text-sm">
                  Печать и доставка бесплатны на этапе тестирования.
                </Dialog.Description>
                {!lines.length ? (
                  <>
                    <p>В корзине пока нет фотолент</p>
                    <Dialog.Close asChild>
                      <Button asChild>
                        <Link to="/booth">Создать фотоленту</Link>
                      </Button>
                    </Dialog.Close>
                  </>
                ) : (
                  <>
                    {pending && (
                      <p role="status" className="text-sm">
                        Проверяемый заказ сохранён. Продолжите оформление, чтобы безопасно проверить
                        результат.
                      </p>
                    )}
                    {lines.map((line) => (
                      <div
                        key={line.stripId}
                        className="flex flex-wrap items-center gap-3 rounded-lg border border-fg-subtle/20 p-2"
                      >
                        <CartPreview line={line} />
                        <div className="min-w-0 flex-1 text-sm">
                          <p>Фотолента · 3 кадра</p>
                          <div className="mt-2 flex items-center gap-2">
                            <Button
                              aria-label="Уменьшить количество"
                              size="icon"
                              variant="outline"
                              disabled={pending || line.quantity <= 1}
                              onClick={() => void update(line.stripId, line.quantity - 1)}
                            >
                              −
                            </Button>
                            <span aria-live="polite">{line.quantity}</span>
                            <Button
                              aria-label="Увеличить количество"
                              size="icon"
                              variant="outline"
                              disabled={pending || line.quantity >= CART_LIMITS.perStrip}
                              onClick={() => void update(line.stripId, line.quantity + 1)}
                            >
                              +
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={pending}
                              onClick={() => void update(line.stripId, 0)}
                            >
                              Удалить
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <p>
                      Разных фотолент: {lines.length}. Всего экземпляров:{" "}
                      {lines.reduce((sum, line) => sum + line.quantity, 0)}.
                    </p>
                    <p className="text-xs text-fg-muted">
                      Технические пределы Preview: до {CART_LIMITS.strips} фотолент,{" "}
                      {CART_LIMITS.perStrip} экземпляров одной, {CART_LIMITS.copies} всего, до 9 МБ
                      файлов.
                    </p>
                    <Button onClick={() => setCheckout(true)}>Оформить заказ</Button>
                  </>
                )}
                <Dialog.Close asChild>
                  <Button variant="outline">Продолжить съёмку</Button>
                </Dialog.Close>
              </>
            )}
            {error && <p role="alert">{error}</p>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Context.Provider>
  );
}

export function CartButton() {
  const cart = useCart();
  if (!cart.enabled) return null;
  const count = cart.lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <Button variant="outline" onClick={cart.openCart}>
      <ShoppingCart className="size-4" />
      Корзина{count > 0 ? ` · ${count}` : ""}
    </Button>
  );
}

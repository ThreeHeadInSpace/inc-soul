import { useCallback, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/booth/AppHeader";
import { CameraStage } from "@/components/booth/CameraStage";
import { GalleryRail } from "@/components/booth/GalleryRail";
import { LayoutPicker } from "@/components/booth/LayoutPicker";
import { OrderPane } from "@/components/booth/OrderPane";
import { ReviewPane } from "@/components/booth/ReviewPane";
import { compressDataUrl, downloadDataUrl } from "@/lib/compose";
import type { FilterId } from "@/lib/filters";
import {
  BOOTH_LAYOUTS,
  INSTANT_LAYOUTS,
  SALON_LAYOUTS,
  type Layout,
  type LayoutId,
} from "@/lib/layouts";
import { useGallery } from "@/lib/gallery-store";
import { EXTRA_AFTER, EXTRA_STEP_RUB, PRINT_PRICE_RUB, SHIPPING_PRICE_RUB } from "@/lib/pricing";
import { formatRub } from "@/lib/utils";

type Step = "home" | "shoot" | "review" | "order" | "done";
type RetakeDraft = {
  token: symbol;
  shots: Array<string | null>;
  filterId: FilterId;
};

const MVP_LAYOUT = BOOTH_LAYOUTS.find((layout) => layout.id === "S3")!;
const MVP_LAYOUTS = [MVP_LAYOUT];

export function HomeHub() {
  return (
    <Shell boothMode="home">
      <section className="max-w-2xl pb-10 pt-2">
        <p className="text-xs uppercase tracking-caps text-fg-subtle">
          Классическая фотобудка
        </p>
        <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-6xl">
          Зайдите за занавес.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-fg-muted">
          Три снимка — одна вертикальная ленточка, как из классической фотобудки.
          Добавьте фильтр и подпись, затем скачайте результат.
        </p>
      </section>
      <div className="grid max-w-2xl gap-4">
        <HubCard
          to="/booth"
          kicker="Три кадра"
          title="Начать фотобудку"
          body="Откройте камеру и снимите серию — мы соберём фотографии в ленточку."
        />
      </div>
      <GalleryRail />
    </Shell>
  );
}

function HubCard({
  to,
  kicker,
  title,
  body,
}: {
  to: "/booth" | "/print";
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl bg-bg-elevated p-6 shadow-[var(--shadow-border)] transition-[transform,background-color] duration-150 hover:bg-bg-subtle active:scale-95"
    >
      <p className="text-xs uppercase tracking-caps text-fg-subtle">{kicker}</p>
      <h2 className="mt-2 font-display text-3xl tracking-tight">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">{body}</p>
      <span className="mt-6 inline-block text-sm text-paper">Открыть →</span>
    </Link>
  );
}

export function BoothSession() {
  return (
    <SessionFlow
      layouts={MVP_LAYOUTS}
      fixedLayout={MVP_LAYOUT}
      kicker="Фотобудка"
      title="Ленточка из автомата"
      blurb="Три снимка — одна вертикальная ленточка."
    />
  );
}

export function PrintSession() {
  return (
    <SessionFlow
      layouts={[...INSTANT_LAYOUTS, ...SALON_LAYOUTS]}
      kicker="Печать"
      title="Instax, Polaroid и салон"
      blurb={`Мгновенная плёнка — ${formatRub(PRINT_PRICE_RUB)} за кадр, первые ${EXTRA_AFTER} по этой цене, дальше +${EXTRA_STEP_RUB} ₽. Салон — по размеру, до А3. Доставка ${formatRub(SHIPPING_PRICE_RUB)}.`}
      groups
    />
  );
}

function SessionFlow({
  layouts,
  kicker,
  title,
  blurb,
  groups = false,
  fixedLayout,
}: {
  layouts: Layout[];
  kicker: string;
  title: string;
  blurb: string;
  groups?: boolean;
  fixedLayout?: Layout;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(fixedLayout ? "shoot" : "home");
  const [layoutId, setLayoutId] = useState<LayoutId | null>(fixedLayout?.id ?? null);
  const [shots, setShots] = useState<Array<string | null>>(() =>
    Array.from({ length: fixedLayout?.poses ?? 0 }, () => null),
  );
  const [filterId, setFilterId] = useState<FilterId>("none");
  const [retake, setRetake] = useState<RetakeDraft | null>(null);
  const [composite, setComposite] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [orderTotalValue, setOrderTotalValue] = useState<number | null>(null);
  const addToGallery = useGallery((s) => s.add);
  const markOrdered = useGallery((s) => s.markOrdered);
  const [galleryId, setGalleryId] = useState<string | null>(null);

  const layout = layoutId ? layouts.find((l) => l.id === layoutId) ?? null : null;

  const pickLayout = (next: Layout) => {
    setLayoutId(next.id);
    setShots(Array.from({ length: next.poses }, () => null));
    setComposite(null);
    setOrderNumber(null);
    setStep("shoot");
  };

  const handleComposite = useCallback(async (url: string) => {
    setComposite(url);
    if (!layoutId) return;
    const thumb = await compressDataUrl(url, 720, 0.72);
    const id = galleryId ?? `g-${Date.now()}`;
    if (!galleryId) setGalleryId(id);
    addToGallery({
      id,
      layoutId,
      filterId,
      composite: thumb,
    });
  }, [addToGallery, filterId, galleryId, layoutId]);

  function retakeSlot(index: number) {
    if (layout?.id === "S3" && shots[index]) {
      setRetake({
        token: Symbol("retake"),
        shots: shots.map((shot, i) => i === index ? null : shot),
        filterId,
      });
      return;
    }
    setShots((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
    setStep("shoot");
  }

  function retakeAll() {
    if (!layout) return;
    setShots(Array.from({ length: layout.poses }, () => null));
    setComposite(null);
    setGalleryId(null);
    setStep("shoot");
  }

  function resetHome() {
    setStep(fixedLayout ? "shoot" : "home");
    setLayoutId(fixedLayout?.id ?? null);
    setShots(Array.from({ length: fixedLayout?.poses ?? 0 }, () => null));
    setComposite(null);
    setOrderNumber(null);
    setGalleryId(null);
    setFilterId("none");
  }

  return (
    <Shell boothMode={layout?.id === "S3" && (step === "shoot" || step === "review") ? "workspace" : undefined}>
      {step === "home" && !fixedLayout && (
        <div className="flex flex-col">
          <section className="max-w-2xl pb-8 pt-2">
            <p className="text-xs uppercase tracking-caps text-fg-subtle">{kicker}</p>
            <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-fg-muted">{blurb}</p>
          </section>
          {groups ? (
            <>
              <h2 className="mb-3 font-display text-2xl tracking-tight">Polaroid и Instax</h2>
              <LayoutPicker
                layouts={layouts.filter((l) => l.kind === "instant")}
                selectedId={layoutId}
                onSelect={pickLayout}
              />
              <h2 className="mb-3 mt-10 font-display text-2xl tracking-tight">Фотосалон до А3</h2>
              <LayoutPicker
                layouts={layouts.filter((l) => l.kind === "salon")}
                selectedId={layoutId}
                onSelect={pickLayout}
              />
            </>
          ) : (
            <>
              <h2 className="mb-3 font-display text-2xl tracking-tight">Выберите ленточку</h2>
              <LayoutPicker layouts={layouts} selectedId={layoutId} onSelect={pickLayout} />
            </>
          )}
          <GalleryRail />
        </div>
      )}

      {(step === "shoot" || retake) && layout && (
        <CameraStage
          layout={layout}
          shots={retake?.shots ?? shots}
          // Ignore a late capture/upload from an attempt that was already cancelled.
          onShots={retake ? (next) => setRetake((current) =>
            current?.token === retake.token ? { ...current, shots: next } : current,
          ) : setShots}
          filterId={retake?.filterId ?? filterId}
          onFilter={retake ? (next) => setRetake((current) =>
            current?.token === retake.token ? { ...current, filterId: next } : current,
          ) : setFilterId}
          onBack={retake ? () => setRetake(null) : fixedLayout ? () => void navigate({ to: "/" }) : resetHome}
          backLabel={retake ? "Отмена" : fixedLayout ? "На главную" : "Назад к макетам"}
          onComplete={() => {
            if (retake) {
              setShots(retake.shots);
              setFilterId(retake.filterId);
              setRetake(null);
            } else {
              setStep("review");
            }
          }}
        />
      )}

      {step === "review" && layout && (
        // Keep the caption and finished JPEG alive while the camera edits a draft.
        <div className={retake ? "hidden" : "contents"}>
          <ReviewPane
            layout={layout}
            shots={shots}
            filterId={filterId}
            onFilter={setFilterId}
            onRetakeSlot={retakeSlot}
            onRetakeAll={retakeAll}
            onOrder={() => setStep("order")}
            onComposite={(url) => void handleComposite(url)}
          />
        </div>
      )}

      {step === "order" && layout && (
        <OrderPane
          layout={layout}
          shots={shots}
          composite={composite}
          filterId={filterId}
          onBack={() => setStep("review")}
          onDone={(num, total) => {
            setOrderNumber(num);
            setOrderTotalValue(total);
            if (galleryId) markOrdered(galleryId, num);
            setStep("done");
          }}
        />
      )}

      {step === "done" && orderNumber && (
        <SuccessPane
          orderNumber={orderNumber}
          total={orderTotalValue ?? 0}
          composite={composite}
          onAgain={resetHome}
        />
      )}
    </Shell>
  );
}

function Shell({ children, boothMode }: { children: ReactNode; boothMode?: "home" | "workspace" }) {
  return <PageFrame boothMode={boothMode}>{children}</PageFrame>;
}

export function PageFrame({ children, boothMode }: { children: ReactNode; boothMode?: "home" | "workspace" }) {
  return (
    <div className="relative min-h-dvh bg-bg text-fg" data-booth-mode={boothMode}>
      <div className="booth-curtain absolute inset-y-0 left-0 w-8 sm:w-12" />
      <div className="booth-curtain absolute inset-y-0 right-0 w-8 sm:w-12" />
      <div className="booth-grain absolute inset-0" />
      <div className="booth-frame relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-10 pb-16 pt-5 sm:px-16">
        <AppHeader />
        {children}
      </div>
      <footer aria-label="Версия приложения" className="absolute inset-x-0 bottom-0 text-center text-[10px] leading-3 text-fg-subtle">
        {import.meta.env.VITE_APP_VERSION_LABEL}
      </footer>
    </div>
  );
}

function SuccessPane({
  orderNumber,
  total,
  composite,
  onAgain,
}: {
  orderNumber: string;
  total: number;
  composite: string | null;
  onAgain: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 py-8 text-center">
      <p className="text-xs uppercase tracking-caps text-fg-subtle">Заказ принят</p>
      <h2 className="font-display text-4xl tracking-tight">Спасибо</h2>
      <p className="font-display text-6xl tabular-nums tracking-tight text-paper">
        №{orderNumber}
      </p>
      <p className="max-w-md text-sm leading-relaxed text-fg-muted">
        Макет, адрес и кадры ушли в студию. Распечатаем и отправим Почтой России. Сумма{" "}
        {formatRub(total)}.
      </p>
      {composite && (
        <img
          src={composite}
          alt=""
          className="max-h-80 w-full bg-paper object-contain"
        />
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {composite && (
          <Button
            variant="outline"
            onClick={() =>
              downloadDataUrl(composite, `inc-soul-${orderNumber}.jpg`)
            }
          >
            Скачать макет
          </Button>
        )}
        <Button onClick={onAgain}>Снять ещё</Button>
        <Button variant="ghost" asChild>
          <Link to="/cabinet">В кабинет</Link>
        </Button>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { PageFrame } from "@/components/booth/BoothApp";
import { privacySections, consentDraft, PRIVACY_DRAFT_VERSION } from "@/lib/privacy-draft";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Проект политики обработки данных · inc&Soul" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Неутверждённый проект политики обработки персональных данных inc&Soul.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PageFrame>
      <article className="mx-auto grid w-full max-w-3xl gap-8 pb-8">
        <header className="grid gap-3">
          <p className="text-xs uppercase tracking-caps text-fg-subtle">Документы</p>
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">
            Обработка персональных данных
          </h1>
          <div
            role="note"
            className="rounded-xl border border-paper/40 bg-bg-elevated p-4 text-sm leading-relaxed"
          >
            <strong>Черновик. Не утверждён.</strong> Редакция {PRIVACY_DRAFT_VERSION}. Публичное
            оформление заказов закрыто до согласования документов и проверки требований к обработке
            данных.
          </div>
          <nav aria-label="Разделы проекта" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {privacySections.map((section) => (
              <a className="underline underline-offset-4" key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
            <a className="underline underline-offset-4" href="#consent">
              Отдельный проект согласия
            </a>
          </nav>
        </header>
        {privacySections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-6">
            <h2 className="mb-3 font-display text-2xl">{section.title}</h2>
            <div className="grid gap-3 text-sm leading-relaxed text-fg-muted">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
        <section id="consent" className="scroll-mt-6 rounded-xl bg-bg-elevated p-4">
          <h2 className="mb-3 font-display text-2xl">Отдельный проект согласия</h2>
          <div className="grid gap-3 text-sm leading-relaxed text-fg-muted">
            {consentDraft.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>
        <p className="text-xs text-fg-subtle">
          Квадратные скобки обозначают сведения, которые необходимо заполнить владельцу.
          Утверждённая редакция будет опубликована отдельно после проверки фактических процессов.
        </p>
        <Link to="/" className="text-sm underline underline-offset-4">
          Вернуться на главную
        </Link>
      </article>
    </PageFrame>
  );
}

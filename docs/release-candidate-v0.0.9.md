# Release Candidate v0.0.9

> Исторический отчёт RC. Владелец подтвердил физические устройства, native Share,
> контрольную печать и branding/date/logo — PASS. Production checklist ниже
> заменён аудитом бесплатного MVP+ в [v0.1.0](release-preparation-v0.1.0.md):
> создавать БД/auth/OAuth secrets для текущего релиза не требуется.

18 сентября 2026. Ветка `pre-prod`. Feature freeze.
База/rollback: `48500689da9e82cbed6c8d7bc179014256144649` (`v0.0.8`).

## Выполнено

Технический regression S3. После подтверждённых исправлений patch-версия
увеличена один раз: 0.0.8 → 0.0.9. Новых функций, изменений layout, фильтров,
typography, pricing, auth/accounts/payment нет. Branding v0.0.8 сохранён.

## Самостоятельно найдено и исправлено

1. **Главная падала при повреждённом recent storage.** Zustand восстанавливал
   `items: null`/строку без валидации; GalleryRail обращался к length/map.
   Hydration теперь принимает корректные записи, сохраняет исправные снимки,
   убирает дубликаты и ограничивает историю прежними 16 записями. Persisted
   данные не заменяют store actions. Unit-тесты и browser cold-start regression
   проверяют повреждённые и смешанные данные, recovery и рабочие действия.
2. **iOS install page называла приложение Grok App.** Имя выводилось из hostname,
   в отличие от manifest/OG. Dev middleware и packaged Nitro теперь передают
   имя из существующего site identity; HTML escaping сохранён. Проверены
   local/Preview/custom-host fixtures и страница упакованной сборки.

Исправлен также тестовый стенд: статический canvas в queue-b мог потерять
единственный resize frame при pause/resume. Synthetic track теперь регулярно
получает requestFrame до остановки. Новый RC harness использует `--disable-gpu`,
как остальные camera suites: без него fake track на Windows завершался после
grantPermissions (ended зафиксирован в диагностике). Assertions не ослаблены;
camera runtime не менялся.

## Проверки

Node.js 24.18.0, Chrome + Playwright. Baseline: 204 tests PASS. RC: 207 tests
PASS, 0 fail/skip; typecheck PASS; lint 0 errors / те же 2 предупреждения
(button.tsx Fast Refresh, use-current-user.ts unused eslint-disable).
Auth invariant PASS. Production-mode build и Preview build PASS.
Build Output API v3, nodejs24.x, routing, запуск упакованного PGLite/WASM PASS.

| Область | Проверено |
| --- | --- |
| Camera | cold entry, permission deny/retry, missing API, front/back, late/old tracks, serialized acquisition, exit/re-entry |
| Capture | single ×3, timer 3/5/10, remaining 3/2/1, double click, capture error/retry |
| Background | pagehide/pageshow, visibility, live/ended recovery, countdown cancellation, stream orientation |
| Retake/cancel | каждый слот; остальные кадры, caption/filter/JPEG/print сохранены; late upload ignored |
| Upload | corrupt file/retry, оставшиеся кадры, задержка, upload без камеры |
| Result | filters, caption, fullscreen, generation failure/retry, stale actions disabled |
| Recent | три сессии подряд, late thumbnail, reload, modal/download/delete, legacy record, corrupt storage |
| Share | один JPEG + общий text, exact bytes, activation, unsupported/cancel/failure/double click в result/recent |
| Print | pending/error/retry, stale URL invalidate/revoke, weak-source warning, PNG 600×1800, pHYs 11811 px/m (300 DPI) |
| Responsive | 360/390/430/768/1024/1280/1366/1440 px, camera/result, closed/print, overflow, controls/footer, touch targets |
| Metadata/PWA | title, description, OG, favicon, manifest, apple icon, install page, прямые маршруты |
| Slow startup | новый browser context, задержка JavaScript, camera/upload/print/gallery promises |
| Output pixels | crop/mirror, digital/print sources, дата/логотип при 300/600 DPI, веб-шрифты и fallback |

Production build: `VERCEL_ENV=production`; Preview build:
`VERCEL_ENV=preview`, `VERCEL_GIT_COMMIT_REF=pre-prod`. Оба через `npm run build`.
DATABASE_URL отсутствовала: внешние БД/миграции не затрагивались.
`npm run preview -- --port 8091` проверял production пакет; `--port 8092` — Preview.
Проверены метки `v0.0.9` и `v0.0.9 · pre-prod` соответственно.

Пройдены `booth-regression`, `queue-a-regression`, `queue-b-regression`,
`queue-c-regression`, новый `rc-regression`, `output-regression`,
`queue-c-output-regression`. UI suites используют BOOTH_BASE_URL, новый RC
для Preview также RC_PREVIEW=1. Output suites требуют dev localhost:8080.
Финальный полный UI набор пройден на упакованном Preview.

Логи: `artifacts/rc/`; UI screenshots/results: `artifacts/queue-{a,b,c}/rc-final/`.
Контрольный PNG: `artifacts/owner-feedback/brand-print-300dpi.png`.
Артефакты игнорируются Git. Исходные сбои стенда и диагностические повторные
проверки сохранены в логах; не выдаются за успешные прогоны.

## RC STATUS: READY

Технически готов к финальной приёмке на физических устройствах и настройке
production. Это не разрешение на production deploy. Cloud Preview после push
проверяется по точному SHA; ID, URL и статус указаны в итоговом сообщении задачи.

## Остановлено

Feature freeze сохранён. `prod` и `main` не изменяются. Production deploy и
перенос в prod не выполняются. Исходная generated отметка routeTree.gen.ts
не включается в commit. Новых secrets/env/generated artifacts и debug/test
content в runtime нет.

## Нужно от владельца / Production checklist

- [ ] Финальная приёмка RC на iPhone/Safari, Android/Chrome и физическом планшете:
  permission recovery, front/back, rotate, background/foreground, 3/5/10,
  повторные сессии, download и native Share → нужные мессенджеры. Payload
  проверен; отображение caption зависит от receiving app.
- [ ] Контрольная печать PNG: 50,8×152,4 мм, 300 DPI, без fit-to-page;
  crop, поля, подпись/дата/логотип и фактическое качество.
- [ ] Vercel: Production Branch=`prod`, Node=24.x, команды vercel.json,
  отсутствие Output Directory override, системные env включены.
- [ ] Production HTTPS domain/DNS и environment по README: отдельная постоянная
  DATABASE_URL, BETTER_AUTH_URL на production origin, отдельный BETTER_AUTH_SECRET,
  VITE_AUTH_ENABLED для существующей конфигурации; credentials/callback уже
  существующих провайдеров — если используются. VITE_PUBLIC_HOSTNAME — production
  hostname, если нужен фиксированный OG origin. Preview/Production БД раздельные;
  секреты только в окружении, не в Git.
- [ ] Backup БД перед release: build применяет ожидающие миграции при наличии
  DATABASE_URL. Эта RC-итерация миграций не добавляет.
- [ ] Явно разрешить production deploy проверенного SHA. Затем `pre-prod` → `prod`
  через PR/merge по README; после релиза проверить HTTPS, прямой /booth,
  assets/OG/PWA и короткий capture→print/share flow.

Физическая камера, native share sheet, принтер, production credentials/DNS и
реальная production БД локальной автоматизацией не проверены.

## Rollback

База: `48500689da9e82cbed6c8d7bc179014256144649`, v0.0.8. Её Preview deployment
6518827329 имел success до итерации:
[v0.0.8 Preview](https://inc-soul-c6dcm6z9f-happyigor5-6037.vercel.app).

Отмена RC: обычный `git revert <RC_COMMIT_SHA>` в pre-prod, проверки и push
в origin/pre-prod, без force/reset истории. Перед будущим production deploy
записать действующий Production deployment ID. Production rollback после
явного разрешения: прежний working deployment Vercel или revert release commit.
Откат deployment не откатывает данные/миграции; backup БД нужен отдельно.

Контрольные неизменяемые refs:
`main=3fea86b58896650984813c2423f783c81e397f05`,
`prod=e844acc8a529eec5b189ad9e48ce6e23471feaed`.

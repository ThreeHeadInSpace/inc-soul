# Release preparation v0.1.0

22 сентября 2026. Ветка `pre-prod`. Первый публичный бесплатный MVP+.
Основа/rollback подготовки: `ccefd8de76a16353ed6292bf18761a9b89ccc462` (v0.0.9).

## Выполнено

Владелец принял RC: iPhone/Android/tablet, native Share, физическая контрольная
печать и branding/date/logo — PASS. Это подтверждение RC, а не повторная
физическая проверка v0.1.0. В этой итерации выполнена доступная автоматизация.

Feature freeze сохранён. Payment, DB, email, analytics, layouts, filters и
новые UX-функции не добавлены. `prod` не изменяется, production deploy и tag
release не выполняются. Версия обновлена `npm version minor --no-git-tag-version`.

## Бесплатный MVP+ / pricing

`FREE_MVP=true` и текст «Бесплатно на этапе тестирования» находятся в pricing
config. Коммерческие суммы сохранены для будущего этапа. Нет 0 ₽, скидок,
зачёркнутых цен, доставки или текста акции в публичном UI.

Аудит выявил доступные остатки template: `/print` со старыми ценами,
кабинет/login, заказ и сохранение в кабинет из Result/recent. В бесплатном
режиме скрыты эти CTA; `/print`, `/login`, `/cabinet`, `/studio` перенаправляются
на главную. Код будущих сценариев сохранён. Auth API возвращает 404; middleware
защищённых server functions отклоняет запрос до auth resolution и запросов к БД.
Client user hook возвращает guest без `useSession`/запроса к auth API.

## Share production URL

Оба Share используют общий `jpegSharePayload`:

```
Сделано в сервисе inc&soul
https://incsoul.ru/
```

Один `navigator.share({ files: [JPEG], text })` на действие, исходные JPEG bytes
и user activation сохранены. Print PNG не участвует, clipboard/Telegram hacks нет.

## Production environment audit

**Обязательные пользовательские production environment variables: нет.**

| Переменные | Решение для v0.1.0 |
| --- | --- |
| `DATABASE_URL` | Не задавать. Без неё deploy-time миграции пропускаются |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `VITE_AUTH_ENABLED` | Не нужны; accounts недоступны независимо от template auth flag |
| `GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET` | Не нужны; OAuth не используется |
| `GROK_PROJECT_ID`, `GROK_GATE_ORIGIN`, `GROK_CONNECTORS_URL` | Не нужны; gate/connectors не входят в MVP+ |
| Payment/email secrets | Не нужны; публичный flow не использует эти backend |
| `VITE_PUBLIC_HOSTNAME` | Не требуется при normal custom-domain Host/forwarded host. Только при переписывании origin: `incsoul.ru` |
| `VITE_APP_VERSION_LABEL` | Не задавать; вычисляется из package.json |
| `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF` | Автоматические системные Vercel env для метки Preview, не secrets |

Код PGLite остаётся в template/server package и может инициализировать локальный
fallback при импорте DB-модуля; это не новая/постоянная production DB. Публичный
MVP+ не делает DB/auth/order запросов. Проверка packaged PGLite/WASM — проверка
комплектности унаследованного пакета, не provisioning базы.

Production-mode и Preview build проверены без перечисленных env/secrets.
Отсутствие `.grok/app-env.json` не блокирует сборку. Существующий auth invariant
проверяет согласованность template flag (on по умолчанию), а не включение accounts
в MVP+: `FREE_MVP` закрывает их отдельно. При будущем коммерческом включении
потребуются самостоятельный аудит и регрессия, одного возврата цены недостаточно.

### Vercel configuration

- В коде Node.js `24.x`; packaged runtime `nodejs24.x`.
- `vercel.json`: framework Other/null, install `npm ci`, build `npm run build`,
  `outputDirectory: null`; Git deployment разрешён только pre-prod/prod.
- В Dashboard Node.js должен быть `24.x`; Production Branch — `prod`.
- Output Directory override в Dashboard должен отсутствовать.
- Automatically expose System Environment Variables должен быть включён.
- `incsoul.ru` должен быть назначен Production с Valid Configuration.

Dashboard-настройки требуют подтверждения владельца:
доступный connector не возвращает команды, get_project имеет несовместимые
схемы, браузер Dashboard требует входа. Конфигурация в репозитории не выдаётся
за доказательство текущих cloud settings. Production settings не изменялись.

## Domain readiness

Публичный origin — `https://incsoul.ru/`. Canonical главной и `/booth` указывают
на production domain. OG/PWA существующего middleware не переписаны:
custom forwarded host `incsoul.ru` в packaged сборке даёт
`https://incsoul.ru/og.jpg`; manifest/icons доступны. Vercel host исключён
существующим resolver. DNS: A `216.198.79.1`; live HTTPS — 200, Server Vercel,
HSTS. Это подтверждает DNS/TLS/HTTP, но не branch assignment в Dashboard.

## Проверки

- Node.js 24.18.0; typecheck PASS; full tests 207 PASS, 0 fail/skip.
- Lint: 0 errors, прежние 2 warnings (button Fast Refresh и unused eslint-disable).
- Production-mode и Preview build; packaged startup/Build Output API v3,
  routing, Node 24, PGLite/WASM — PASS.
- `booth-regression`, `queue-a-regression`, `queue-b-regression`,
  `queue-c-regression`, `rc-regression`, `output-regression`,
  `queue-c-output-regression` — PASS на локальных сборках.
- Camera/capture, deny/retry, foreground/background, front/back, stale tracks;
  timer 3/5/10 и оставшиеся 3/2/1; retake/cancel; upload/errors — PASS.
- 7 filters, caption, recent/reload/delete/corrupt storage, fullscreen — PASS.
- Result/recent Share: exact JPEG + новый text, single call, cancel/failure,
  unsupported/double click, после подготовки print — PASS.
- PNG 600×1800, pHYs 11811 px/m (300 DPI), invalidation/retry/download;
  branding/date при 300/600 DPI, web fonts и fallback — PASS.
- Responsive 360/390/430/768/1024/1280/1366/1440, closed/print, touch targets,
  отсутствие overflow — PASS. Screenshot проверен визуально.
- PWA/title/OG/description/icons/install page, canonical; отсутствие цен,
  auth/order CTA и сетевых backend-запросов в публичном flow — PASS.

Legacy order regression заменена проверкой недоступности заказа для текущего
MVP+, остальные проверки Share/recent/print сохранены. Логи и screenshots:
`artifacts/release-v0.1.0/`, `artifacts/queue-{a,b,c}/release-v0.1.0-final/` (gitignored).
Финальные cloud Preview ID, URL, SHA и статус фиксируются в итоговом сообщении
после push; локальный PASS не подменяет cloud deployment status.

## RELEASE STATUS: NOT READY

Код и локальная регрессия готовы. Для снятия статуса NOT READY нужны успешный
cloud Preview точного итогового SHA и подтверждение Dashboard checklist выше.
Даже после READY production deploy требует отдельной фразы владельца.

## Нужно от владельца

Подтвердить Dashboard checklist (или предоставить доступ к вошедшей сессии).
Создание secrets/БД/OAuth и повторная физическая приёмка RC не требуются.
Разрешение на production не запрашивается автоматически этой подготовкой.

## Production deployment plan

Только после «Разрешаю production deploy v0.1.0»: записать текущий working
Production deployment ID и SHA; повторно проверить origin/pre-prod, затем
перенести проверенный SHA в prod штатным PR/merge. Дождаться Production READY,
проверить `https://incsoul.ru/`, прямой `/booth`, v0.1.0 без pre-prod suffix,
capture/upload → Share → PNG, recent, metadata/PWA, отсутствие старых цен.

## Rollback

До production: revert release-preparation commit в pre-prod, проверки и push
только origin/pre-prod, без force/reset. База — принятый RC v0.0.9 (SHA выше).
RC содержит коммерческие CTA/цены и не является готовым бесплатным production.
После разрешённого deployment: вернуть предварительно записанный working
Production deployment либо согласованный revert в prod. В этой итерации нет
внешних DB-миграций; отдельный DB rollback не нужен. Текущий неизменяемый
remote prod: `e844acc8a529eec5b189ad9e48ce6e23471feaed`.

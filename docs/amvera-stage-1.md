# Amvera: переносимая сборка, этап 1

> Исторический отчёт предыдущей подготовки. Актуальная инструкция для `pre-prod`
> и `incsoul-stage`: [amvera-deploy.md](amvera-deploy.md), 13 ноября 2026 года.
> Указанные ниже старая рабочая ветка и результаты относятся к тому этапу.

Дата: 7 ноября 2026 года (Asia/Yekaterinburg).
Основа: [аудит миграции](amvera-migration-audit.md).
Локальная ветка: `codex/amvera-portable-build`, от актуальной `origin/pre-prod`
(`d70586361a54c30aae1f7cafa283b71322150f04`, проверено через fetch).
Исходный незакоммиченный аудит сохранён без изменений. Push/deployment не выполнялись.

## Реализация

- `npm run build:node` — production Vite + Nitro `node-server`, результат `.output`.
  Запускается через `scripts/build-app.mjs node` на Node.js 24.
- Launcher передаёт дочернему процессу только системные переменные и явные
  `NODE_ENV=production`, build target, `VITE_AUTH_ENABLED=false`.
  DB/SMTP/Vercel-переменные, `NODE_OPTIONS`, пользовательские `VITE_*` не наследуются.
  Vite не читает `.env*` при явном build target. `.grok/app-env.json` не используется.
  Миграции, `check-preview-print` и mail scripts в эту команду не входят.
- `npm start` — `node .output/server/index.mjs`. Статика, SSR, server functions и
  PWA middleware остаются внутри Nitro. Нужна вся `.output`, а не только entrypoint.
- `Dockerfile`: Node 24 Debian slim в обоих stages, `npm ci` по lockfile,
  компиляция отдельным `RUN --network=none`, runtime только из `.output`, пользователь `node`.
  Сеть нужна установке npm-зависимостей и загрузке базового образа, но компиляция
  приложения принудительно выполняется без сети (требуется Docker BuildKit).
- `.dockerignore` использует allowlist исходников, public, migrations и scripts.
  `.env*`, `.git`, `.vercel`, `.grok`, node_modules, attachments, отчёты,
  логи, локальные артефакты и ключи не входят в контекст. Секретных build args нет.
- Контейнер по умолчанию слушает `0.0.0.0:3000`. `PORT` задаётся при запуске;
  Nitro также понимает `NITRO_PORT`/`NITRO_HOST` (имеют приоритет).
  `amvera.yaml` выбирает Dockerfile и `containerPort: 3000`. При смене `PORT`
  нужно согласовать порт контейнера и конфигурацию маршрутизации Amvera.
- В Node-артефакте без `DATABASE_URL` источник БД — `disabled`:
  eager bootstrap PGLite не запускается, `getSql()` явно отклоняет запрос.
  Встроенная БД не используется для сохранения заказов.
- Preview checkout отключён в Node-артефакте на этапе компиляции,
  включая случай случайного появления `VERCEL_ENV=preview` в runtime.
  Старые orders/strips защищены существующим `FREE_MVP` middleware;
  `/print`, `/studio`, `/cabinet`, `/login` перенаправляют на главную, auth API отдаёт 404.
  Новые runtime environment gates не вводились; их проектирование — следующий этап.

## Совместимость Vercel

`vercel.json`, обычная `npm run build`, dev/preview-команды и версия сайта не изменены.
Без явного target Nitro по-прежнему выбирает `vercel`; существующий PGLite fallback
и Preview gate сохраняют прежнее поведение. Старая `build` по-прежнему включает
`db:migrate` и `check-preview-print`: в этой работе она намеренно не запускалась.

Для безопасной локальной проверки добавлена `npm run build:vercel:app`:
тот же Vercel preset, но без локальных env, миграций и проверки внешних сервисов.
Эта команда использует auth=false и не заменяет настройки действующих deployments.
Для создания артефакта с текущими платформенными env сохраняется исходная команда Vercel.
Отдельная команда миграции `npm run db:migrate` существует, но здесь не выполнялась.
В Docker runtime нет исходных release scripts и автоматического migration step.

## Локальный запуск Docker

Нужны Docker Engine/Desktop с BuildKit и доступ к npm registry / базовому образу.
Не передавать `.env`, DB/SMTP-секреты или Vercel-переменные.

```sh
docker build --progress=plain -t inc-soul:amvera-stage1 .
docker run --detach --name inc-soul-stage1 -p 127.0.0.1:3000:3000 -e PORT=3000 inc-soul:amvera-stage1
```

Открыть `http://localhost:3000`, `/booth`, `/privacy`,
`/__grok/manifest.webmanifest`, `/?install=1&platform=ios`.
Проверить `/print` и `/api/auth/get-session`: редирект и 404 соответственно.
В PowerShell HTTP можно проверить через `curl.exe -i http://localhost:3000/booth`.

```sh
docker logs inc-soul-stage1
docker restart --time 10 inc-soul-stage1
docker exec inc-soul-stage1 node --input-type=module -e "const r = await fetch('http://127.0.0.1:' + process.env.PORT + '/booth'); if (r.status !== 200) process.exit(1); console.log(r.status)"
docker stop --time 10 inc-soul-stage1
docker rm inc-soul-stage1
```

Для проверки полного отсутствия внешней сети в runtime можно запустить отдельный
контейнер с `--network none` и выполнить HTTP-запрос через `docker exec`, как выше
(публикация порта и браузер тогда недоступны).

## Выполненные проверки

Среда: Windows, Node.js `24.18.0`. Секреты из локального `.env` не читались вручную,
production PostgreSQL/SMTP не использовались, заказы не создавались.

| Проверка | Результат |
| --- | --- |
| `npm run build:node` | PASS, `.output/nitro.json`: `node-server` |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 ошибок, 4 существующих предупреждения |
| Безопасные unit tests | 182 PASS: brand, camera, capture timer, gallery, PWA, migration plan, print output, sharing, sign-out, app-data и gate identity с mocks |
| Wrapper/auth invariant tests | 26 PASS после запуска вне Windows-песочницы; первоначальные 2 EPERM на symlink устранены сменой режима проверки |
| `npm run build:vercel:app` | PASS, только сборка, без release steps |
| `node scripts/check-preview-build.mjs` | PASS: Vercel output v3, routing, Node 24, traced PGLite из артефакта (локальная пустая БД, без заказов) |
| `npm run check:node -- --browser --channel=chrome` | PASS: изолированная копия `.output` во временной папке вне проекта |
| Docker build/run/restart | НЕ ПРОВЕРЕНО: Docker/Podman отсутствуют, WSL не установлен |

`check:node` проверяет SSR `/`, `/booth`, `/privacy` и их JS/CSS-ресурсы;
редиректы закрытых разделов, 404, auth API, PWA manifest и локальные иконки,
install page; HTTP server function возвращает недоступность checkout;
`getSql()` без БД отклоняется. Chrome проходит страницы без ошибок JavaScript,
все внешние запросы блокируются. Проверяется остановка и повторный запуск Node,
после которого `/booth` снова отвечает 200. Во время теста runtime получает
ложные Preview-флаги без БД, оформление остаётся недоступным.
На этой машине HTTP smoke, повторная сборка PWA-файлов и symlink-тесты
потребовали запуска вне ограничений Windows-песочницы. Итог: 208 unit tests PASS.

Логи проверок находятся в игнорируемой `artifacts/amvera-*.log`.
Полная `npm test` намеренно не выполнялась: `free-print-order` и `group-print-order`
создают заказы в локальной PGLite. Почтовые/production/browser scripts из аудита,
не предназначенные для изолированного smoke, не запускались.

## Ограничения и готовность

Код переносимой сборки подготовлен, Node-артефакт и Vercel output локально проверены.
**Этап 1 нельзя считать полностью принятым до успешной проверки Docker на машине
с Docker Engine.** Linux image, слои образа, права runtime-пользователя,
SIGTERM как PID 1, рестарт контейнера и сборка с `RUN --network=none` пока не подтверждены.
Проверка повторного запуска Windows Node не заменяет эти проверки.

Браузерная проверка не включает реальную камеру, физические устройства,
установку PWA на iOS/Android, offline-режим и Web Share. HTTPS/proxy ingress,
лимиты Amvera, память/нагрузка, сеть к будущим PostgreSQL и SMTP не проверялись.
Существующие внешние шрифты, extensions.js и OG-зависимости не удалялись:
локальный smoke блокировал их, их перенос остаётся отдельной задачей аудита.

К следующему этапу можно переходить после Docker-приёмки и отдельного задания:
environment gates, staging PostgreSQL, release migrations, pool/timeouts,
readiness/shutdown и staging Amvera ещё не реализованы.
Наличие `DATABASE_URL` само по себе не открывает checkout в Node-артефакте этапа 1.
Production, DNS и настройки Vercel не менялись; staging/оплата не создавались.

Справочная конфигурация сверена с первичными источниками:
[Amvera Docker](https://docs.amvera.ru/applications/configuration/docker.html),
[Nitro Node.js](https://nitro.build/deploy/runtimes/node).

# Первый запуск incsoul-stage на Amvera

Подготовка: 13 ноября 2026 года, Asia/Yekaterinburg. Целевая ветка — `pre-prod`.
Приложение `incsoul-stage`, Moscow-1, репозиторий `inc-soul` уже подключены владельцем.
Эта инструкция не означает, что деплой выполнен. Commit/push не выполняются без подтверждения.

## Архитектура и выбор запуска

React 19 + TanStack Start обрабатывают страницы и server functions; Vite 8 собирает
клиент и SSR, Nitro 3 упаковывает сервер и раздаёт статику/PWA middleware.
Это полноценное Node-приложение, не статический сайт. Фотобудка обрабатывает фото
в браузере; закрытый серверный flow заказов использует PostgreSQL (`pg`) и SMTP
(Nodemailer). Авторизация Better Auth сейчас закрыта существующим FREE_MVP.

Выбран двухэтапный Dockerfile с Node.js 24 Debian slim: одинаковый runtime,
установка через lockfile, отдельный непривилегированный пользователь, только
самостоятельная `.output` в конечном образе. `amvera.yaml` выбирает Docker и порт.
Это позволяет не зависеть от версий встроенного Node-окружения Amvera.

Обычная `npm run build` ориентирована на Vercel и **включает миграции БД и
проверку тестовой печати**. Для Amvera она не применяется:

```sh
npm ci
npm run build:node
# Только для локального запуска без Docker:
npm start
```

`build:node` выбирает Nitro `node-server`, отключает чтение `.env*` и наследование
прикладных переменных, не запускает миграции/почтовые проверки. `start` запускает
`node .output/server/index.mjs`; переносить нужно всю `.output`.
Docker задаёт `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3000`.
При запуске напрямую задайте эти переменные в своей оболочке.

В каталоге уже была подготовка этапа 1: отдельная Node-сборка, конфигурации Docker,
запрет PGLite без DATABASE_URL и запрет Vercel Preview checkout в Node-артефакте.
Она сохранена. Цены, обработка фото и алгоритмы заказов в текущей подготовке не менялись.
Vercel-конфигурация и обычная команда сборки сохранены.

## Настройки Amvera

1. Проверить приложение `incsoul-stage`, регион Moscow-1, источник `inc-soul`,
   **ветку `pre-prod`**. Не менять приложения production, `prod`/`main` и incsoul.ru.
2. Использовать файлы из корня репозитория: `amvera.yaml` и `Dockerfile`.
   Не задавать поверх них старую команду `npm run build`, Vite preview/dev,
   `run.command` или `run.args`: Docker CMD уже запускает сервер.
3. Порт контейнера — **3000** (`run.containerPort`). При необходимости проверить
   соответствие PORT=3000 в интерфейсе. NITRO_PORT/NITRO_HOST не задавать:
   они имеют приоритет над PORT/HOST. NITRO_UNIX_SOCKET также не задавать.
4. Для доступа использовать выданный Amvera тестовый HTTPS-домен. HTTPS нужен
   браузерной камере; локально исключение действует для localhost.
   TLS завершается на ingress Amvera, сервер внутри контейнера использует HTTP.
5. Первый тест провести без DATABASE_URL, SMTP и Vercel Preview переменных.
   Постоянный диск не нужен: БД и фотографии на этом этапе не переносятся.

Docker требует BuildKit для `RUN --network=none`. Доступ к registry Docker и npm
нужен при получении образа и `npm ci`; компиляция выполняется без сети.
Если сборщик Amvera не поддерживает этот синтаксис, сначала проверить его возможности
по логу сборки; локальная проверка Docker на этой машине невозможна.

## Переменные окружения (без значений секретов)

| Переменная | Первый тест | Назначение |
| --- | --- | --- |
| `NODE_ENV` | `production`, уже в образе | Режим Node |
| `HOST` | `0.0.0.0`, уже в образе | Прослушивание всех интерфейсов |
| `PORT` | `3000`, уже в образе | Совпадает с containerPort |
| `VITE_AUTH_ENABLED` | При сборке принудительно `false` | Runtime-переменная не включает клиентскую авторизацию |
| `DATABASE_URL` | **Не задавать** | Секрет подключения PostgreSQL для будущего этапа |
| `SMTP_HOST`, `SMTP_PORT` | Не нужны | В текущем коде Яндекс SMTP, порт 465 |
| `SMTP_USER`, `SMTP_PASSWORD` | **Не задавать** | Учётная запись и пароль приложения SMTP, секреты |
| `PRINT_ORDERS_TO_EMAIL` | Не задавать | Получатель заказов; персональные данные |
| `PRINT_PREVIEW_ACCESS_CODE` | **Не задавать** | Секрет старого закрытого Vercel Preview flow |
| `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF` | Не задавать | Переменные старой платформы; не нужны Amvera |

Для текущего бесплатного smoke **прикладные секреты не требуются**. Наличие
DATABASE_URL само по себе не включает оформление: оно закрыто в Node-артефакте.
Не копировать production `.env` в Amvera и не передавать секреты как Docker ARG.
`.dockerignore` исключает env-файлы, ключи, локальные артефакты и метаданные Git.

Для будущей авторизации код также содержит `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
`GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET`, `GROK_PROJECT_ID`,
`GROK_GATE_ORIGIN`; для коннекторов — `GROK_CONNECTORS_URL`,
`GROK_CONNECTOR_ACCESS_TOKEN`. Сейчас они не нужны. Включение этих интеграций
требует отдельной настройки и проверки callback-доменов.
Есть необязательные публичные настройки PWA/OG/STUN (`VITE_PUBLIC_HOSTNAME`,
`VITE_PROJECT_ID`, `VITE_OG_SERVICE_URL`, `VITE_STUN_URLS`, `X_CREATOR`,
`X_CREATOR_ID`). Build launcher их не наследует; изменение build-настроек
делается отдельно, секреты в `VITE_*` недопустимы.

## Приёмка первого тестового деплоя

- В логах сервер слушает `0.0.0.0:3000`, нет перезапусков/ошибок запуска.
- `/`, `/booth`, `/privacy` и JS/CSS отвечают 200; камера доступна по HTTPS.
- Работают создание ленты и скачивание, PWA manifest и `/?install=1&platform=ios`.
- `/print`, `/studio`, `/cabinet`, `/login` перенаправляют на главную;
  `/api/auth/get-session` возвращает 404; заказы недоступны.
- После перезапуска фотобудка снова доступна. Реальную камеру, Web Share и
  установку PWA проверить на телефоне; серверный smoke их не подтверждает.

Ссылки: [Amvera Docker](https://docs.amvera.ru/applications/configuration/docker.html),
[сеть и порты Amvera](https://docs.amvera.ru/applications/configuration/network.html),
[Nitro Node](https://nitro.build/deploy/runtimes/node).

## Локальная проверка 13 ноября

Среда: Windows, Node.js 24.18.0, установленные зависимости из рабочего каталога.

| Проверка | Результат |
| --- | --- |
| `npm run build:node` | PASS, `.output/nitro.json`: `node-server` |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS: 0 ошибок, 4 существующих предупреждения |
| `npm run check:node` | PASS: SSR и JS/CSS для `/`, `/booth`, `/privacy`; закрытые маршруты, auth 404, PWA, server function availability, отказ embedded DB, остановка и повторный запуск |
| `git diff --check` | PASS |
| Docker build/run | Не проверено: Docker не установлен |

Первый build упёрся в EPERM Windows-песочницы при записи `.output`, первый HTTP
smoke — в недоступность loopback fetch. Повторные проверки вне песочницы прошли.
Smoke запускает изолированную копию `.output` во временном каталоге с чистым env,
HOST=0.0.0.0 и нестандартным PORT=3187 (подтверждает runtime-настройку порта).
БД/SMTP не подключались, миграции и создание заказов не выполнялись.
Текущие логи: игнорируемые `artifacts/amvera-current-build.log` и
`artifacts/amvera-current-smoke.log`. Исторический отчёт предыдущей подготовки
хранится в `amvera-stage-1.md`; его browser/unit результаты здесь не повторялись.

**Готовность: можно пробовать первый тестовый деплой бесплатной фотобудки без БД**
после подтверждения владельцем отправки файлов. Успешная Linux/Docker-сборка,
доступность registry/npm из Amvera, ресурсы сборщика, HTTPS ingress и камера
должны быть подтверждены на `incsoul-stage`. Это не готовность серверного
оформления заказов: база, фотографии, почта и авторизация остаются отдельным этапом.

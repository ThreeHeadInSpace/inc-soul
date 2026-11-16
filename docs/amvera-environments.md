# Два независимых окружения Amvera

Подготовлено 16 ноября 2026 года. Изменения отправляются **только в pre-prod**.
Staging DB_READY и применение baseline подтверждены владельцем. Здесь ни к одной
реальной БД не подключаемся; создание ресурсов, SQL, DNS и cutover не выполняются.

| Параметр | Staging (существует) | Production (подготовлено, создаётся вручную) |
| --- | --- | --- |
| Ветка | pre-prod | prod, обновление пока запрещено |
| Приложение | incsoul-stage | incsoul-prod |
| Проект PostgreSQL | incsoul-db-stage | incsoul-db-prod |
| PostgreSQL | 17, Moscow-1 | 17, Moscow-1, отдельный кластер |
| База (регистр обязателен) | incsoulStage | incsoulProd |
| Внутренний host | cnpg-incsoul-db-stage-rw | cnpg-incsoul-db-prod-rw |
| Runtime role | incsoulApp | incsoulApp, в новом кластере |
| Migration owner/login | incsoul_migrator | incsoul_migrator, в новом кластере |
| AMVERA_ENV | staging | production |
| AMVERA_APP_NAME | incsoul-stage | incsoul-prod |

Роли одинаково называются в независимых кластерах, но имеют **разные пароли**.
Базы, данные, секреты, backups и диагностические токены не разделяются.
Профили задаёт `scripts/amvera-environment.mjs`: runtime и мигратор используют
один allowlist. URL никогда не определяет окружение автоматически.

## Совместимость и защита от перепутанных настроек

Для существующего staging отсутствие AMVERA_ENV/AMVERA_APP_NAME сохраняет прежнее
поведение. Рекомендуется вручную явно задать staging/incsoul-stage. Production
требует **обе** переменные production/incsoul-prod. NODE_ENV=production — обычный
режим Node для обоих приложений, он не выбирает целевую БД. VERCEL_ENV также не
влияет на выбор. Dockerfile один, build:node создаёт один runtime-артефакт для обоих.

Runtime допускает только точные host/database/port=5432 и username=incsoulApp
своего профиля. Migrator использует тот же профиль с username=incsoul_migrator и
дополнительным явным совпадением AMVERA_DB_HOST с URL; для старого stage migrator
сохранён прежний допустимый префикс hostname. Никаких произвольных DB overrides.
Диагностика и migrator сверяют реальное current_database()/current_user/версию,
не выводя секреты или драйверные ошибки наружу. Роли с повышенными атрибутами
отклоняются; migrator также проверяет отсутствие CREATE и членства runtime в owner.

Примеры, которые должны быть отклонены до открытия пула/соединения:
staging + prod URL, production + stage URL, host одного окружения с именем базы
другого, production без AMVERA_APP_NAME, несовпадение app name и AMVERA_ENV.
Это защита от несовместимых настроек, а не способ доказать фактическое имя приложения
на платформе: если вручную скопировать **все** настройки staging в чужое приложение,
код не узнает о неверном выборе. Перед сохранением секретов сверять название
приложения в Amvera с таблицей выше; не копировать набор env между приложениями.

## Секреты и переменные (без настоящих значений)

Для **каждого сайта отдельно**:

- Секрет DATABASE_URL: собственный существующий пароль runtime-роли, собственный
  internal -rw host, собственное case-sensitive имя БД. URL-encode пароль.
- Для временной диагностики — свой случайный секрет AMVERA_DIAGNOSTICS_TOKEN
  длиной 32–256 символов, обычная переменная AMVERA_DB_DIAGNOSTICS=1.
- Обычные AMVERA_ENV и AMVERA_APP_NAME из таблицы. PORT=3000, HOST=0.0.0.0,
  NODE_ENV=production и VITE_AUTH_ENABLED=false уже заданы Docker-образом.
- После DB_READY удалить диагностический токен и выключить флаг. DATABASE_URL
  оставить. Не задавать SMTP, платёжные ключи, VERCEL_ENV=preview или preview access code.

Для **временного production мигратора отдельно от сайта**:

- Секрет DATABASE_URL с **incsoul_migrator**, новым prod-паролем и prod host/database.
- AMVERA_ENV=production, AMVERA_APP_NAME=incsoul-prod (это целевое приложение, даже
  если временный сервис называется incsoul-migrate-prod),
  AMVERA_DB_HOST=cnpg-incsoul-db-prod-rw.
- После приёмки удалить migration secret из временного сервиса и остановить его.
  Runtime-сайту migration credentials никогда не передавать.

Пароли и URL вводятся вручную только в Amvera Secrets; не в Git/Docker ARG/команды,
чат или логи. Открытый POSTGRES-домен не нужен. Сервисы должны быть в одном регионе.
TLS-параметры согласовать с фактической конфигурацией кластера; не отключать
проверку сертификатов глобально. Обычные URL допускают только параметр sslmode.

## Ручная подготовка production — после отдельного разрешения

1. **Не обновлять prod сейчас.** Сначала владелец отдельно принимает решение
   об отключении Vercel auto-deploy для prod и проверяет, что обновление этой
   ветки уже не запустит Vercel build с прежним доступом к Supabase. Этот шаг
   здесь не выполнен; vercel.json и существующая Vercel build command не менялись.
2. Создать новый managed PostgreSQL 17 `incsoul-db-prod` в Moscow-1: база
   **incsoulProd**, runtime user **incsoulApp**, новый независимый пароль.
   Не использовать существующий stage кластер или копию его пользовательских данных.
   Убедиться, что фактический internal hostname — **cnpg-incsoul-db-prod-rw**.
   При отличии остановиться и согласовать профиль, не ослаблять проверки URL.
3. Через административный инструмент внутри Amvera создать в **новом кластере**
   LOGIN-роль **incsoul_migrator** с новым отдельным паролем; никаких повышенных
   атрибутов SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS. Пароли вводить
   через защищённый UI и сохранять в Secrets, а не в SQL-файл репозитория.
4. Подключившись администратором к **incsoulProd**, просмотреть и вручную выполнить
   `deploy/amvera/bootstrap-prod-roles.sql`. Он проверяет точное имя prod БД и
   наличие ролей, передаёт владение БД/public мигратору, отзывает CREATE/TEMP у
   runtime/PUBLIC, прямое членство runtime в migrator и повышенные атрибуты.
   Сам роли/пароли не создаёт. Затем подтвердить отсутствие косвенных memberships,
   отсутствие CREATE у incsoulApp и пустую public. Старый stage bootstrap не трогать.
5. Временно подготовить **отдельный** сервис `incsoul-migrate-prod` из проверенного
   коммита с `deploy/amvera/Dockerfile.migrations` и примером
   `deploy/amvera/migrations.amvera.yaml`. Использовать конфигурацию отдельной
   копии исходников/отдельного сервиса, не заменять корневой amvera.yaml сайта
   в pre-prod/prod. Старую amvera-migrate-stage не переиспользовать для prod:
   она историческая и не содержит новой поддержки production.
6. Установить перечисленные production migration env/secrets. Оставить args
   `scripts/amvera-migrate.mjs --plan`. Runtime-лог должен показать
   **Environment: production** и SHA-256 baseline ниже. Сборочный RUN --plan
   без runtime-env по умолчанию показывает staging: это только offline smoke
   того же неизменённого SQL, он ничего не применяет и не определяет runtime-профиль.
7. Остановить сервис → сменить args на `scripts/amvera-migrate.mjs --check` →
   запустить → проверить `Empty production database ready for baseline` → остановить. При любой
   ошибке/неожиданной истории не продолжать, не очищать схему и не править checksum.
8. **Только по отдельному разрешению на production SQL** установить args
   `scripts/amvera-migrate.mjs --apply --confirm=incsoulProd`. Неподходящее
   подтверждение staging отвергается. После `Baseline applied atomically` остановить.
   Повтор того же apply безопасен по истории/checksum, advisory lock сериализует
   два runner-а; миграция целиком транзакционна. При цикле перезапусков остановить
   сервис, а не оставлять apply постоянно активным.
9. Проверить через --check и существующий внутренний pgAdmin: 10 прикладных таблиц
   + `_amvera_migrations` (1 запись), владелец incsoul_migrator, order_seq=(1,0),
   пользовательских данных нет. Вернуть args --plan, удалить migration secret,
   остановить временный сервис. Существующий baseline не переписывается, данные
   из Supabase/staging не переносятся.
10. Создать **отдельное** приложение `incsoul-prod` с root Dockerfile/amvera.yaml
    сайта и новой runtime-конфигурацией. До разрешения шага 1 не привязывать его
    к обновляемой prod. После разрешённого выпуска подключить repo/ветку prod;
    первый запуск — на временном HTTPS-домене Amvera, без incsoul.ru.
11. Добавить runtime secrets/env production и проверить через защищённую диагностику:
    `node scripts/check-amvera-db.mjs` внутри контейнера. Ожидается **DB_READY**.
    При отсутствии консоли — защищённый POST с Bearer token, как в
    [runtime-инструкции](amvera-runtime-db.md). Затем закрыть диагностику.

Baseline остаётся **0001_baseline.sql**, checksum
`bf2255ca9b7b1a99a5889fc8b623ac8c43be50016b4a6e9d07c2b0a3d9b94e5f`.
Он использует одинаковые имена ролей в независимых кластерах, поэтому не требует
изменения схемы для prod. `db:migrate`, обычный `npm run build` и startup-сервера
для production-инициализации не используются. Новые файлы runner/config включены
в отдельный Dockerfile мигратора. В сайт они не добавляют migration step.

## Процесс pre-prod → тестирование → prod

1. Разработка/commit/push только pre-prod. Проверить staging DB_READY, HTTPS,
   камеру/PWA, статические ресурсы, закрытые auth/заказы и повторный запуск.
2. Зафиксировать конкретный проверенный SHA и результаты. Не включать в перенос
   миграционную ветку или её корневой YAML.
3. **Отдельное решение владельца об отключении Vercel auto-deploy prod** — обязательный
   барьер перед первым обновлением prod. Пока решение не принято, этот процесс
   останавливается здесь; никакого merge/push prod агентом автоматически нет.
4. После разрешения владельца перенести проверенный SHA в prod согласованным
   review/merge-процессом и проверить diff, конфиг сайта и независимые секреты.
5. Amvera incsoul-prod разворачивает prod; оба приложения используют один Dockerfile,
   но каждый получает только собственные runtime secrets/env. Проверить DB_READY
   на prod и базовые сценарии на временном HTTPS-домене. Откат к предыдущему
   app-коммиту не должен автоматически откатывать/пересоздавать схему БД.

## Перед переключением incsoul.ru — отдельный список

- Production ресурсы/схема/права и независимые секреты проверены; получен реальный
  DB_READY именно на incsoul-prod. В этой подготовке такого подключения нет.
- Завершены нужные редизайн и stage/prod-приёмка; подтверждены нагрузка/пул,
  камера/PWA/Web Share на устройствах, HTTPS/proxy, остановка и перезапуск.
- Включены и проверены backups production, восстановление, мониторинг и логи.
- FREE_MVP=true, авторизация/физические заказы/SMTP/платежи по-прежнему закрыты.
  Их включение — отдельная задача с отдельной приёмкой и секретами.
- Подготовлены DNS/TLS шаги, окно переключения, ответственный, критерии успеха
  и возврата; PWA/кеши/cookies после смены origin проверяются отдельно.
- После отдельного разрешения владельца — DNS incsoul.ru, проверка на домене.
  Отключение/удаление Vercel/Supabase — отдельные действия; тестовые старые данные
  не переносятся. Здесь ни DNS, ни старые сервисы не изменяются.

## Локальные проверки

PASS: TypeScript; ESLint (0 ошибок, 4 прежних предупреждения); **21 тест**
(runtime mocks, изоляция профилей, migration guardrails, прежний SQL-контракт);
build:node; HTTP smoke **одного** Node-артефакта с staging и production env;
offline --plan обоих профилей без DB secrets; COPY/ignore/YAML и quoting prod
bootstrap; неизменность SHA-256 baseline; git diff --check. Дополнительно PASS
build:vercel:app и check-preview-build (Node 24/output v3/PGLite fallback).
Vercel release migrations не выполнялись. Логи — игнорируемые artifacts/amvera-env-*.

Реальных подключений к БД нет. Тесты используют моки и локальный PGlite/PG18.3;
HTTP smoke задаёт заведомо невалидный URL, который отклоняется до TCP. Это не
реальная проверка production DB_READY. Staging DB_READY принят из отчёта владельца.
Docker Engine отсутствует: проверены Node-артефакт и исходники Docker-конфигурации,
не Linux-образ. Реальный build/run, DNS/TLS, PG17 и production SQL нужно подтвердить
позднее в разрешённом ручном прогоне. Baseline, root Dockerfile/amvera.yaml сайта,
Vercel config, prod/main и amvera-migrate-stage не изменены.

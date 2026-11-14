# Чистая схема PostgreSQL для incsoul-stage

Подготовлено 14 ноября 2026 года. Ветка `pre-prod`. База назначения:
`incsoul-db-stage`, PostgreSQL 17, Moscow-1, database `incsoul_stage`.
**Это подготовленные файлы, не выполненные операции в Amvera.** Commit/push и
любые изменения целевой базы требуют отдельного подтверждения владельца.

## Какие объекты нужны

Бесплатная фотобудка обрабатывает фото в браузере и не нуждается в серверной БД.
Для существующего кода заказов, сохранённых лент и будущей авторизации создаются:

| Таблица | Назначение / обращения в коде |
| --- | --- |
| `print_orders` | Заказ, доставка, суммы, согласие, тип, статус уведомления; `orders.ts`, `free-print-store.server.ts`, `free-print-mail.server.ts` |
| `print_order_items` | Позиции заказа: UUID ленты, количество, PNG bytea, параметры jsonb; групповой заказ и подготовка вложений |
| `print_uploads` | Временные PNG и параметры до подтверждения; `free-print-orders.ts` |
| `print_order_limits` | Часовые лимиты оформления/загрузок |
| `order_seq` | Транзакционный счётчик человекочитаемых номеров `000-001`–`999-999` |
| `strips` | Сохранённые ленты старого кабинета; `strips.ts`; пока закрыты FREE_MVP |
| `user` | Пользователь Better Auth (это **public.user**, не Supabase auth.users) |
| `session` | Сессии Better Auth |
| `account` | OAuth-аккаунты / поля учётных данных Better Auth |
| `verification` | Проверочные токены Better Auth |
| `_amvera_migrations` | Отдельная служебная история: имя, SHA-256 SQL, applied_at |

Выбран совместимый полный набор прикладных таблиц: удаление `strips` и auth-таблиц
сделало бы существующие закрытые обработчики несовместимыми с БД при будущем включении.
Создание таблиц не включает эти обработчики. Исходники сайта и gates не меняются.

Baseline сохраняет поля, типы, nullable/default, PK, unique, check и связи результата
`migrations/0001_auth.sql`–`0007_group_print_orders.sql`. В частности:

- `session.userId` и `account.userId` → `user.id`, `ON DELETE CASCADE`.
- `print_order_items.order_id` → `print_orders.id`; существующий запрет удаления
  родителя с позициями сохранён. Unique `(order_id, strip_id)` также индексирует FK.
- Уникальные request_id/order_number обеспечивают повторные запросы без дублей.
- Сохранены ограничения product_type=`S3`, количества позиции 1–12, upload PNG ≤3,3 МБ.
- Нумерация — прежний AFTER INSERT trigger, обычная SECURITY INVOKER функция,
  атомарное обновление счётчика и номера. У приложения есть нужные SELECT/UPDATE.
- Исходные индексы сохранены; добавлены `(user_id, id DESC)` на orders и strips
  под реальные запросы кабинета. PK/unique уже создают остальные нужные индексы.

У `print_orders.user_id` и `strips.user_id` **не добавляется новый FK на user**:
существующий гостевой flow использует пустой user_id, а старый dev-flow — `dev-user`.
Новые ограничения бизнес-данных и новые правила удаления требуют отдельной задачи.
В таблицах сохранены legacy JPEG/print_png поля: они ещё читаются существующим кодом.
Создаются только пустые таблицы, техническая строка `order_seq(1,0)` и запись истории.
Пользователи, заказы, фотографии и данные Supabase не импортируются.

Не создаются схемы `auth`, `storage`, `realtime`, `vault`, API-роли `anon`,
`authenticated`, `service_role`, Supabase Auth/Storage, publications, cron jobs,
платформенные расширения или дамп Supabase. UUID генерируется стандартной функцией
PostgreSQL 17 `gen_random_uuid()`, дополнительных расширений не требуется.

## Файлы и отдельная цепочка миграций

- `migrations/amvera/0001_baseline.sql` — чистая конечная схема и runtime grants/RLS.
- `scripts/amvera-migrate.mjs` — только для Amvera stage, по умолчанию offline plan.
- `deploy/amvera/bootstrap-roles.sql` — проверяемый административный шаблон прав.
- `deploy/amvera/Dockerfile.migrations` — отдельный временный migration-сервис.
- `deploy/amvera/migrations.amvera.yaml` — пример его конфигурации.
- `scripts/amvera-migrate.test.mjs` — изолированные локальные SQL/permission tests.

Старые SQL и `scripts/migrate.mjs` оставлены без изменений. Вложенная папка amvera
не попадает в их нерекурсивный поиск. `_migrations` на новой базе не создаётся:
записи о старых файлах не подделываются. **Нельзя запускать `npm run db:migrate`
или обычную `npm run build` против Amvera.** Сайт собирается через `build:node`,
runtime по-прежнему не применяет миграции PostgreSQL автоматически.
Следующее изменение Amvera-схемы потребует нового файла и расширения manifest
runner: сейчас он намеренно принимает только один неизменяемый baseline.

## Роли и подготовка владельцем — только после подтверждения

1. Сделать контрольный backup новой БД и убедиться, что `public` пустая.
2. Через административный инструмент **внутри Amvera** создать отдельную login-роль
   `incsoul_migrator` с собственным паролем. Это владелец схемы, не superuser.
   Административные права нужны только подготовке ролей/владения, не приложению.
3. Просмотреть и выполнить `deploy/amvera/bootstrap-roles.sql` администратором,
   подключённым к `incsoul_stage`. Шаблон не создаёт роль и не содержит пароль.
   Он передаёт владение БД/public migrator-у, отзывает CREATE/TEMP у PUBLIC/app,
   исключает прямое членство app в migrator и убирает повышенные атрибуты ролей.
   Если Amvera не разрешает эти операции текущей admin-роли, запросить подходящий
   административный доступ; не давать приложению superuser/BYPASSRLS для обхода.
4. Проверить, что `incsoul_app` не состоит через другие роли в migrator/admin и
   не получает CREATE через другие memberships. Runner откажется при основных
   обнаруженных нарушениях. Административный шаблон рассчитан на новую выделенную БД.

Runtime `incsoul_app` получает DML только для нужных операций, USAGE на две serial
sequence и EXECUTE на функцию нумерации. Он не владеет таблицами и не имеет доступа
к истории миграций. На всех десяти таблицах включён RLS с явной policy для server-role.
Это доступ доверенного backend ко всем строкам, **не** разграничение пользователей
сайта: user_id по-прежнему проверяет серверная авторизация.
Owner обходит обычный RLS, поэтому владелец и runtime разделены.
[Правила RLS PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

## Однократный запуск по внутренней сети

После отдельного подтверждения push и применения:

1. Создать временный сервис миграций в том же аккаунте/регионе Amvera. Не заменять
   настройки `incsoul-stage`. Использовать Dockerfile `deploy/amvera/Dockerfile.migrations`
   и конфигурацию из `deploy/amvera/migrations.amvera.yaml` в настройках **этого** сервиса.
   Если интерфейс требует файл из корня — перенести пример в корень отдельной копии
   исходников временного сервиса, не менять корневой amvera.yaml сайта в pre-prod.
2. Не создавать HTTP/POSTGRES публичный домен для мигратора или БД, оставить одну
   реплику, отключить автоматические запуски при каждом push. Мигратор не web-сервер.
3. Взять **точный** внутренний hostname с суффиксом `-rw` на вкладке «Инфо» проекта
   `incsoul-db-stage`. Не угадывать username аккаунта. Задать переменную
   `AMVERA_DB_HOST` равной этому hostname. Runner проверяет его совпадение с URL,
   форму `cnpg-incsoul-db-stage-rw` (также допускается старый префикс
   `amvera-<account>-`), порт 5432 и имя БД.
   [Внутренняя сеть Amvera](https://docs.amvera.ru/applications/configuration/network.html).
4. В **секретах Amvera временного сервиса** задать `DATABASE_URL` для пользователя
   `incsoul_migrator`, базы `incsoul_stage`, внутреннего `-rw` host. Пароль URL-encode,
   не вставлять URL в Git, чат, Docker ARG, командную строку или логи.
   Для внутреннего HTTP/TCP контура Amvera шифрование сетью не предоставляется;
   TLS PostgreSQL включать согласно фактической конфигурации кластера. Для подключения
   без TLS допустим `sslmode=disable`; для TLS использовать проверяемый сертификат,
   не отключать проверку сертификата глобально. Из query params runner допускает
   только `sslmode`; `options` и подмена search_path через URL запрещены.
5. Сначала запустить без доступа к БД (аргументы по умолчанию):

   ```sh
   node scripts/amvera-migrate.mjs --plan
   ```

   Затем команда в контейнере/аргументы временного сервиса для **read-only проверки**:

   ```sh
   node scripts/amvera-migrate.mjs --check
   ```

   Проверяются PG17, имя БД, role/login, отсутствие superuser/CREATEDB/CREATEROLE/
   BYPASSRLS, изоляция runtime, пустая public либо совпадающая история.
   Команда не создаёт таблицы и не берёт write-lock.
6. Только после подтверждения владельца изменить args временного сервиса на:

   ```sh
   node scripts/amvera-migrate.mjs --apply --confirm=incsoul_stage
   ```

   Успех: `Baseline applied atomically`. Advisory transaction lock исключает
   одновременную работу двух таких runner-ов; есть lock/statement/connect timeouts.
   Схема, grants и история создаются одной транзакцией. Ошибка откатывает весь baseline.
   Непустая неизвестная public, старый `_migrations`, чужая история или изменённый
   SHA-256 приводят к отказу; очистки/пересоздания данных автоматически нет.
7. Повторить `--check`: `Baseline already applied; checksum verified`. Проверка
   подтверждает историю и набор таблиц, не заменяет полный schema-diff при ручных
   правках БД. Остановить временный сервис и удалить его DATABASE_URL secret.
   Если платформа перезапустит завершившийся process, повторный apply той же версии
   безопасен: `Already applied; checksum verified`, новая запись не создаётся.
   Не оставлять apply-команду в постоянно работающем сервисе.

Постоянный сайт позже получает **свой** `DATABASE_URL` с `incsoul_app`, а не
`incsoul_migrator`. Пароль хранится только в секретах Amvera. На этом этапе можно
оставить URL сайта незаданным: схема подготовлена независимо от включения сайта.
SMTP_USER/SMTP_PASSWORD/PRINT_PREVIEW_ACCESS_CODE и VERCEL_ENV не задавать.
Node gate продолжает блокировать оформление даже после подключения БД.

## Проверки и пределы проверки

Локально выполнены изолированные тесты на PGlite 0.5.5, **PostgreSQL 18.3 WASM**:
четыре теста прошли — контракт колонок/ограничений старой и новой схемы, полный
rollback, повторное применение и checksum, отказ частичной БД, runtime DDL/history
запреты, гостевая корзина с trigger/счётчиком и повторным request_id, auth FK cascade.
Созданы только синтетические локальные строки; уведомление заменено заглушкой,
SMTP не импортируется/не вызывается. Настоящие DATABASE_URL/env tests не читают.

Совместный запуск новых и существующих migration-plan tests: **11 PASS**.
`npm run typecheck` — PASS; `npm run lint` — 0 ошибок, четыре существующих
предупреждения; YAML временного сервиса и `git diff --check` — PASS.

```sh
npm run db:amvera:plan
node --test scripts/amvera-migrate.test.mjs
```

**Полноценный PostgreSQL 17 и Docker здесь не установлены.** Не проверены реальный
PG17 по протоколу `pg`, конкуренция двух сетевых сессий, Linux migration image,
внутренний DNS/TLS и административные возможности Amvera. Это нужно подтвердить
в разрешённом stage-прогоне. Runner намеренно отказывается работать с PG18:
локальные тесты вызывают SQL-часть напрямую, а не обходят ограничения remote-команды.
В Amvera/Supabase ничего не выполнялось, старые данные не читались и не переносились.

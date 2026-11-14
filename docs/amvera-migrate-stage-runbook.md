# Временное приложение incsoul-migrate

Ветка: **amvera-migrate-stage**, создана от актуальной `pre-prod`.
Это конфигурация отдельного мигратора, **не сайта incsoul-stage**.
Не сливать эту ветку в pre-prod/prod/main и не подключать к ней работающий сайт.
Корневой `amvera.yaml` сайта в pre-prod остаётся прежним.

## Состав и исходное состояние

Корневой `amvera.yaml` взят из `deploy/amvera/migrations.amvera.yaml`:
Docker, `deploy/amvera/Dockerfile.migrations`, команда `node`,
args `scripts/amvera-migrate.mjs --plan`. Порт/HTTP-сервер мигратору не нужны.
Выбор Dockerfile и run.command/run.args предусмотрены
[документацией Amvera](https://docs.amvera.ru/applications/configuration/docker.html).

Образ устанавливает зависимости через `npm ci --omit=dev --ignore-scripts`
по lockfile (включая `pg` и его зависимости), копирует мигратор и SQL-папку.
Секреты, `.env*`, `.git`, локальные node_modules исключены `.dockerignore`.
На сборке выполняется только offline `--plan`: он проверяет импорт `pg`,
наличие SQL и вычисляет checksum, не обращаясь к DATABASE_URL и БД.
CMD образа также по умолчанию содержит только `--plan`.

Baseline не изменён. Ожидаемый SHA-256 (нормализация CRLF → LF как в runner):
`bf2255ca9b7b1a99a5889fc8b623ac8c43be50016b4a6e9d07c2b0a3d9b94e5f`.

Владелец сообщил, что bootstrap уже выполнен: владельцы БД и public —
`incsoul_migrator`, `incsoulApp` не член migrator, CREATE отсутствует, public пустая.
Повторно bootstrap не запускается; новые пользователи и пароли не создаются.
Это исходные сведения владельца, не результат подключения из этой подготовки.

## Создание временного приложения

1. Создать отдельное приложение **incsoul-migrate** в **Moscow-1** того же аккаунта.
   Не изменять существующий incsoul-stage или проект БД incsoul-db-stage.
2. Подключить GitHub `ThreeHeadInSpace/inc-soul`, ветку **amvera-migrate-stage**.
   Проверить SHA выбранного коммита. В корне этой ветки уже лежит нужный amvera.yaml.
   Оставить одну реплику; не настраивать HTTP health check для этого CLI-процесса.
3. Не создавать домены для мигратора или публичный POSTGRES-домен базы.
   Отключить автозапуски/автодеплой при push, если интерфейс это позволяет;
   каждый этап запускать вручную. Автоматический рестарт контейнера учитывается ниже.
4. На первом этапе оставить args **scripts/amvera-migrate.mjs --plan**.
   Не задавать DATABASE_URL до проверки offline-плана. Дождаться сборки образа.
5. Убедиться в логе сборки и запуска:

   ```text
   Offline plan: 0001_baseline.sql; SHA256 bf2255ca9b7b1a99a5889fc8b623ac8c43be50016b4a6e9d07c2b0a3d9b94e5f; 10 app tables + _amvera_migrations
   ```

   Зафиксировать время/SHA/результат и **остановить приложение**.

## Последовательность с контролем перезапусков

Перед сменой режима: **остановить → убедиться, что нет работающих экземпляров →
изменить args → проверить сохранённые args → запустить → проверить свежие логи →
остановить**. Не менять args на работающем экземпляре: старый процесс может ещё
завершаться. Команда на всех этапах — `node`; меняется только строка args.
Пароль и URL никогда не передаются в args.

| Этап | args | Ожидаемый результат | Действие |
| --- | --- | --- | --- |
| 1. Offline | `scripts/amvera-migrate.mjs --plan` | `Offline plan: ...` и точный SHA-256 выше | Остановить, настроить секрет |
| 2. Read-only | `scripts/amvera-migrate.mjs --check` | `Empty stage database ready for baseline` | Сохранить результат, остановить; ждать отдельного разрешения на apply |
| 3. Создание схемы — только после разрешения | `scripts/amvera-migrate.mjs --apply --confirm=incsoulStage` | `Baseline applied atomically` | Сохранить результат и сразу остановить |
| 4. Проверка | `scripts/amvera-migrate.mjs --check` | `Baseline already applied; checksum verified` | Проверить каталог в pgAdmin; остановить |

После этапа 1 в **секретах только incsoul-migrate** задать `DATABASE_URL` для
существующей роли `incsoul_migrator`, host **cnpg-incsoul-db-stage-rw**, порт 5432,
путь **/incsoulStage**. Пароль URL-encode и сохранить исключительно в Amvera Secrets.
Как обычную переменную задать `AMVERA_DB_HOST=cnpg-incsoul-db-stage-rw`.
TLS-параметры согласовать с конфигурацией кластера; runner допускает только
query-параметр sslmode. Не копировать production env, SMTP, Vercel env или
DATABASE_URL в GitHub, чат, командную строку или логи.

Этап 2 проверяет PG17, точное имя БД, роль мигратора, безопасные атрибуты ролей,
отсутствие членства приложения в migrator и CREATE, пустую public/историю.
Если уже получен `Baseline already applied; checksum verified`, не считать БД
пустой и не переходить к созданию таблиц: сначала выяснить, когда baseline применён.
Ошибка на любом этапе — **остановить и разобраться**; не удалять таблицы, историю
и не отключать защитные проверки. Наличие DATABASE_URL само не включает apply.

**Если Amvera перезапускает завершившийся контейнер:**

- Повторные plan не обращаются к БД; повторные check выполняют только чтение.
- После успешного apply повтор той же версии выдаст `Already applied; checksum verified`:
  baseline и запись истории повторно не создаются. Предыдущий успех обязательно
  сопоставить с текущими SHA и свежими логами, затем остановить приложение.
- Одновременные apply этого runner сериализуются advisory lock; схема и история
  коммитятся вместе. Если процесс погиб до commit — транзакция откатится;
  если после commit — следующий запуск распознает историю. Это защита от рестарта,
  не разрешение оставлять apply в постоянно работающем приложении.
- Если есть цикл ошибок/рестартов, остановить приложение. Не принимать статус
  «перезапускается» или отсутствие HTTP-ответа за результат миграции: CLI завершается
  и результат определяется его логом/кодом выхода и последующей проверкой истории.
- После этапа apply обязательно вернуть args в **--plan**, пока приложение
  остановлено. Это исключает новый apply при будущем ручном старте.

## Приёмка в pgAdmin и завершение

Использовать уже существующее административное подключение **внутри Amvera** к
`incsoulStage` через `cnpg-incsoul-db-stage-rw`. Не открывать базу наружу.
В public ожидаются **10 прикладных таблиц**:
`user`, `session`, `account`, `verification`, `strips`, `order_seq`, `print_orders`,
`print_order_items`, `print_uploads`, `print_order_limits`.
Плюс **11-я служебная** `_amvera_migrations`: одна запись baseline с checksum выше.
Все таблицы принадлежат incsoul_migrator; incsoulApp получает только ранее
подготовленные DML/sequence/function grants и server-role RLS policy.
Пользовательских записей нет; `order_seq` содержит только техническую строку (1,0).
Не создавать тестовый реальный заказ и не настраивать SMTP для проверки схемы.

После приёмки остановить incsoul-migrate, вернуть args --plan, удалить его
DATABASE_URL secret и отключить автоматические запуски. Сайт остаётся на pre-prod;
runtime-подключение сайта через incsoulApp — отдельный следующий этап.
Роли/БД/схему не удалять. Полный разбор схемы и прав:
[amvera-postgres-stage.md](amvera-postgres-stage.md).

## Локальная проверка подготовки

Результат: YAML совпадает с шаблоном по структуре; COPY-источники доступны с
текущими ignore-правилами, `pg` указан в production dependencies и lockfile,
offline plan выдаёт ожидаемый checksum. **14 тестов PASS** (мигратор и migration-plan),
TypeScript PASS, ESLint — 0 ошибок/4 существующих предупреждения,
`git diff --check` PASS. SQL baseline и Git blob сайта amvera.yaml в pre-prod
сохранены без изменений; миграционный SQL/код runner в этой ветке не менялись.

Docker/Podman в этой Windows-среде отсутствуют: Linux-образ здесь не собран.
Проверяются root YAML относительно шаблона, COPY-источники/Dockerignore,
production dependency pg в lockfile, offline plan и существующие SQL/role tests
на PGlite (PostgreSQL 18.3 WASM). Проверка Docker build в Amvera остаётся необходимой;
встроенный RUN --plan завершит сборку ошибкой при отсутствии мигратора, SQL или pg.
Реальный PostgreSQL 17, внутренние DNS/TLS и restart-поведение платформы локальными
проверками не подтверждаются. В этой подготовке подключений к БД нет.

# inc&soul

Фотобудка и печать Polaroid / Instax / фотосалона до А3.

- Живая камера, фильтры, обратный отсчёт
- Классические ленточки из будки
- Polaroid, Instax Mini / Square / Wide и размеры до A3
- Личный кабинет (Google, X, почта)
- Заказ печати с доставкой Почтой России

```bash
npm install
npm run dev
```

Используйте Node.js 24.x. Локальный адрес — http://localhost:8080.
Для установки строго по `package-lock.json` можно использовать `npm ci`.
Локальные команды `dev`, `build:dev` и `preview` сохранены.

## Два контура: GitHub → Vercel

Один проект Vercel с обычной GitHub-интеграцией:

| Ветка | Окружение Vercel | Когда обновляется |
| --- | --- | --- |
| `pre-prod` | Preview | После каждого push в `pre-prod` |
| `prod` | Production | После merge/push в `prod` |

Работа ведётся в `pre-prod`. Проверенная версия переносится в `prod` через
pull request с base `prod` и compare `pre-prod`. Обе ветки постоянные;
после merge `pre-prod` не удалять. Для релизных PR используйте **Create a merge
commit**, чтобы сохранять общую историю двух долгоживущих веток.

`vercel.json` разрешает автоматические Git-деплои только для этих двух веток.
Правило `"**": false` охватывает также имена со слешем (например, `feature/ui`);
явные `true` для `pre-prod` и `prod` разрешают их деплой. Один `*` не охватывает
такие имена, а ветки без совпавшего правила Vercel разрешает по умолчанию.
Правила действуют для коммитов, содержащих этот файл. Выбор Production Branch
выполняется отдельно в Vercel; имя `prod` само по себе окружение не назначает.
GitHub Actions и Vercel-токен для такого процесса не нужны.

## Первичная настройка GitHub

При подготовке созданы локальные `pre-prod` и `prod` от коммита `3fea86b`.
Активна `pre-prod`; прежняя `main` сохранена. Новые правки ещё не закоммичены,
ветки не отправлены в GitHub. Локальная `prod` пока лишь начальная точка,
а не подтверждённый стабильный релиз.

1. Проверьте незакоммиченные изменения и сохраните нужные изменения приложения
   и конфигурацию деплоя коммитом в `pre-prod`.
2. Опубликуйте ветки: `git push -u origin pre-prod` и `git push -u origin prod`.
   Второй push публикует только начальную точку `prod`; текущие изменения
   попадут туда через первый проверенный релизный PR.
3. В GitHub → Settings → General → Default branch выберите `pre-prod`.
   Это ветка для повседневной работы; production branch задаётся в Vercel.
4. В Settings → Rules → Rulesets (либо Branches → Branch protection)
   настройте для `prod` обязательный PR, запрет force push и удаления.
   Для `pre-prod` запретите удаление и force push, сохранив обычные push.
   Доступность правил зависит от тарифа и видимости репозитория.
5. Отключите Automatically delete head branches, чтобы GitHub не удалял
   `pre-prod` после релизного PR.

Не назначайте отсутствующие CI-проверки обязательными. GitHub-интеграция Vercel
проверяет деплой, но сама по себе не запускает `typecheck`, `lint` и `test`.

## Настройка Vercel

1. Add New → Project → Import Git Repository: выберите
   `ThreeHeadInSpace/inc-soul`. Разрешите приложению Vercel доступ к этому
   репозиторию в GitHub.
2. Root Directory — корень репозитория (`.`). Framework Preset — **Other**.
   Конфигурация в `vercel.json` задаёт Install Command `npm ci`, Build Command
   `npm run build`, отсутствие ручного Output Directory. Node.js — **24.x**.
3. Settings → Environments → Production → Branch Tracking: укажите **`prod`**.
   В Preview сохраните отслеживание остальных веток, включая `pre-prod`.
   Custom Environment с именем `pre-prod` создавать не требуется.
4. В Settings → Git проверьте подключение репозитория и отсутствие правила
   Ignored Build Step, пропускающего сборки `pre-prod` или `prod`.
5. Настройте переменные окружения ниже отдельно для **Preview / `pre-prod`**
   и **Production**. Изменения переменных применяются при новой сборке.
6. После настройки запустите Preview из ветки `pre-prod` (новым push либо
   Create Deployment с Git reference `pre-prod`) и проверьте его.
7. Создайте PR `pre-prod` → `prod` и слейте после проверки. Первый релиз должен
   включать `vercel.json`, `package.json`, `package-lock.json` и нужные правки
   приложения. Убедитесь, что deployment от `prod` помечен Production.

При импорте Vercel может первоначально выбрать `main` и создать начальный
Production deployment. До подключения рабочего домена явно установите
`prod` и выполните первый проверенный релиз из этой ветки.

Для тестирования используйте постоянный branch URL из Vercel для `pre-prod`
(он обновляется с веткой), а не URL отдельного коммита. При необходимости
в Settings → Domains привяжите тестовый поддомен к `pre-prod`, основной —
к Production. Для работы камеры открывайте приложение по HTTPS.

## Переменные окружения

Файл `.grok/app-env.json` локальный и игнорируется Git. Его значения не
переносятся в Vercel автоматически. Секреты задавайте в интерфейсе Vercel.

| Переменная | Preview / `pre-prod` | Production |
| --- | --- | --- |
| `DATABASE_URL` | Отдельная тестовая PostgreSQL БД | Production PostgreSQL БД |
| `VITE_AUTH_ENABLED` | `true` для проверки с реальной БД | `true` |
| `BETTER_AUTH_URL` | Полный постоянный HTTPS-адрес тестового контура | Полный HTTPS-адрес production |
| `BETTER_AUTH_SECRET` | Постоянный случайный секрет тестового контура | Отдельный постоянный случайный секрет production |

Проверяйте вход с адреса, указанного в `BETTER_AUTH_URL`: текущая настройка
auth доверяет этому origin, а случайные адреса отдельных Preview-деплоев
могут не пройти проверку origin.

Для существующего входа через Google/X дополнительно нужны выданные приложению
`GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET` и разрешённые
callback URL для обоих контуров у брокера. Встроенный sandbox OAuth-клиент
не является готовой настройкой для доменов Vercel. Email/password уже включён
в коде и не требует OAuth-клиента брокера. Логика авторизации здесь не менялась.

Если используются Grok connectors/gate, им также нужна действующая внешняя
настройка (`GROK_CONNECTORS_URL`, а для gate identity — `GROK_PROJECT_ID` и
`GROK_GATE_ORIGIN`) и инфраструктура, передающая проверенные credentials.
Один импорт репозитория в Vercel эти сервисы не создаёт.

Текущий `npm run build` после сборки запускает `db:migrate` и применяет
ожидающие миграции к `DATABASE_URL` своего окружения. Поэтому Preview и
Production должны использовать разные БД. При отсутствии `DATABASE_URL`
шаг миграций пропускается; встроенный PGLite не заменяет постоянную БД для
production. Сочетание реальной БД с `VITE_AUTH_ENABLED=false` отклоняет
защищённые запросы в существующей реализации.

## Сборка и проверка

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Для проверки только артефактов сборки запускайте последнюю команду без
`DATABASE_URL` в окружении процесса, чтобы не применять миграции.

Nitro уже настроен с `preset: "vercel"` в `vite.config.ts` и формирует
Build Output API v3: `.vercel/output/config.json`, статические assets и
серверную функцию `.vercel/output/functions/__server.func` с Node.js 24.x.
Output Directory оставьте без override: не задавайте `dist` или только
`.vercel/output/static`, иначе можно потерять серверную часть приложения.
Сборочные каталоги не включаются в Git; Vercel собирает проект из исходников.

После первого облачного деплоя проверьте открытие `/booth`, прямую загрузку
страниц, камеру на телефоне, три кадра S3, JPEG/download, повторную сессию,
а при настроенной БД — вход и сохранение. Успешная локальная сборка не
подтверждает работу внешних сервисов и устройства.

Документация: [Git integration и Production Branch](https://vercel.com/docs/git),
[ограничение веток](https://vercel.com/docs/project-configuration/git-configuration),
[Build Output API](https://vercel.com/docs/build-output-api).

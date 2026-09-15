# inc&soul

Текущий MVP — фотобудка S3: три снимка в одной вертикальной ленточке.

- «Снять кадр» — один снимок сразу; «С таймером» — оставшиеся кадры с отсчётом 3/5/10 секунд.
- Фильтры, подпись, пересъёмка любого кадра с отменой, полноэкранный просмотр.
- Цифровой JPEG 520 × 1560 для Web Share при поддержке браузером и recent photos.
- Отдельный candidate PNG для печати из исходных кадров; текущий пробный размер
  50,8 × 152,4 мм при 300 DPI (600 × 1800 px).

Физический размер и качество печати ещё требуют проверки владельцем. При
недостаточном разрешении кадров интерфейс показывает ограничение качества.
Код остальных макетов, кабинета и заказа сохранён для следующих этапов.

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

Работа и промежуточное тестирование ведутся только в `pre-prod`. После каждой
завершённой итерации выполните `typecheck`, `lint`, `test` и `build`, сравните
результат с baseline: новых ошибок быть не должно. Затем сохраните завершённые
изменения коммитом и отправьте в `origin/pre-prod`, чтобы обновить Preview.
`prod` обновляется только после явного одобрения проверенной версии для релиза.
Проверенная версия переносится в `prod` через
pull request с base `prod` и compare `pre-prod`. Обе ветки постоянные;
после merge `pre-prod` не удалять. Для релизных PR используйте **Create a merge
commit**, чтобы сохранять общую историю двух долгоживущих веток.
При выпуске из командной строки используйте `git merge --ff-only pre-prod`,
если история допускает fast-forward. Дополнительные постоянные ветки не нужны;
`main` и default branch GitHub в рамках этого процесса не меняются.

## Версия приложения

Стартовая версия — `v0.0.1`. Единственный источник номера — `version` в
`package.json`; `package-lock.json` должен содержать тот же номер.
До первого публичного релиза каждая следующая завершённая пользовательская
или техническая итерация увеличивает последнее число на один:
`v0.0.1` → `v0.0.2` → `v0.0.3`. Обновляйте номер один раз за итерацию командой
`npm version patch --no-git-tag-version`, включайте его в общий коммит задачи.
Отдельных автоматических release-коммитов, тегов и зависимостей нет.

Версия отображается мелким текстом внизу интерфейса. При сборке Vite добавляет
` · pre-prod` только если одновременно `VERCEL_ENV=preview` и
`VERCEL_GIT_COMMIT_REF=pre-prod`. В production и обычном локальном запуске
отображается только номер. В Vercel оставьте включённой настройку
**Automatically expose System Environment Variables**; вручную задавать
`VITE_APP_VERSION_LABEL` не требуется. В клиент передаётся только готовая подпись.

## Автоматические деплои

`vercel.json` разрешает автоматические Git-деплои только для этих двух веток.
Правило `"**": false` охватывает также имена со слешем (например, `feature/ui`);
явные `true` для `pre-prod` и `prod` разрешают их деплой. Один `*` не охватывает
такие имена, а ветки без совпавшего правила Vercel разрешает по умолчанию.
Правила действуют для коммитов, содержащих этот файл. Выбор Production Branch
выполняется отдельно в Vercel; имя `prod` само по себе окружение не назначает.
GitHub Actions и Vercel-токен для такого процесса не нужны.

## Первичная настройка GitHub

Ветки `pre-prod` и `prod` уже опубликованы в GitHub. `main` сохранена.
Default branch менять не требуется: production branch задаётся в Vercel.

1. В Settings → Rules → Rulesets (либо Branches → Branch protection)
   настройте для `prod` обязательный PR, запрет force push и удаления.
   Для `pre-prod` запретите удаление и force push, сохранив обычные push.
   Доступность правил зависит от тарифа и видимости репозитория.
2. Отключите Automatically delete head branches, чтобы GitHub не удалял
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
node scripts/check-preview-build.mjs
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
страниц, камеру на телефоне, три кадра S3, JPEG Share/PNG download, повторную сессию,
а при настроенной БД — вход и сохранение. Успешная локальная сборка не
подтверждает работу внешних сервисов и устройства.

Документация: [Git integration и Production Branch](https://vercel.com/docs/git),
[ограничение веток](https://vercel.com/docs/project-configuration/git-configuration),
[Build Output API](https://vercel.com/docs/build-output-api).

## Queue A: capture и печатный файл

Подробности реализации, baseline, результаты regression, ограничения и rollback:
[отчёт Queue A](docs/queue-a-v0.0.5.md).

Проверки браузером (установленный Chrome, синтетическая камера, без физических
устройств): при работающем `npm run dev` запустите
`node scripts/booth-regression.mjs`, `node scripts/queue-a-regression.mjs` и
`node scripts/output-regression.mjs`. Первые два скрипта также работают с
`BOOTH_BASE_URL`, указывающим на `npm run preview`; последний использует модули
Vite для проверки canvas по известным исходным пикселям. Артефакты записываются
в игнорируемый `artifacts/queue-a/`.

Nitro сохраняет PGLite внешним пакетом вместе с WASM/data-файлами через
`traceDeps`. `check-preview-build.mjs` проверяет запуск именно упакованной копии,
маршрутизацию Build Output API и Node.js 24. Это проверка локальной сборки;
production по-прежнему требует отдельного одобрения.

## Queue B: device UX и подготовка релиза

[Отчёт Queue B v0.0.6](docs/queue-b-v0.0.6.md): lifecycle камеры, таймер 3/5/10,
крупный mobile/tablet result, цена S3 и единый PNG download для печати.
Digital JPEG остаётся в Share и внутреннем output pipeline.

Дополнительная проверка: `node scripts/queue-b-regression.mjs` при работающем
`npm run dev`; для собранного Preview задайте `BOOTH_BASE_URL`.
Она измеряет восемь viewport, проверяет square/crop при смене stream metadata,
background/foreground, сериализацию requests между sessions и длительности.
Артефакты сохраняются в игнорируемом `artifacts/queue-b/`.

# Queue C — Recent photos & release polish

Дата: 18 сентября 2026. Рабочая ветка: `pre-prod`. Версия итерации: `v0.0.7`.

## Выполнено

- S3: нижний логотип увеличен на 8 физических pt относительно v0.0.6.
- Recent: быстрые Скачать / Поделиться / Удалить; нажатие preview или названия
  открывает модальный просмотр с Скачать / Поделиться / Удалить / Заказать.
- Order CTA: конверт перед текстом в обоих состояниях существующего auth gate.
- Фильтр «Чисто» переименован в «Без фильтров»; «Выцветший» убран.
- Закрытый и открытый save/print блок занимают всю ширину области actions;
  summary расположен по центру, минимальная высота 44 px.
- Share передаёт JPEG и текст сервиса, без вымышленного production URL.

## Самостоятельно найдено и исправлено

- Кнопка recent preview вызывала необязательный onOpen, который нигде не
  передавался. Просмотр теперь принадлежит самой карточке и работает во всех
  существующих местах GalleryRail.
- Summary центрировался внутри одной колонки grid. Исправлен span контейнера,
  поэтому центрирование не зависит от поддержки Share и открытия details.
- В гостевом order CTA отсутствовала любая иконка. Mail добавлен в обе ветви.
- Ожидание canvas fonts теперь запрашивает фактически используемые веса 500
  у Outfit и italic Fraunces. Размеры даты и подписи не изменены.
- Recent Share имеет синхронный guard повторного клика; отмена не считается
  ошибкой, сбой оставляет изображение доступным. Download сообщает о сбое.
- Preview возвращает focus на карточку при Escape; после удаления focus
  переводится на заголовок recent или постоянную ссылку, если удалён последний item.
- Заказ в modal нельзя закрыть во время отправки; повторная отправка блокируется.

## Recent photos behavior

`incsoul-gallery`, схема GalleryItem, лимит 16 и генерация уменьшенных копий
остались прежними. Нового localStorage/sessionStorage, исходников, аккаунтов,
сервера и миграций нет. Recent — JPEG с длинной стороной до 720 px; для S3 это
240 × 720. Скачивается и отправляется именно сохранённый JPEG, без повторного
compose или наложения фильтра. Старая запись с filterId=fade отображает свой
готовый JPEG без изменений; неизвестный filter ID в getFilter безопасно даёт none.

На карточке три кнопки по 44 × 44 px. При отсутствии поддержки file sharing
Share неактивен; доступно скачивание. Action-кнопки не открывают preview.
Radix Dialog обеспечивает modal, клавиатурный focus, Escape и outside dismissal.
На маленьком landscape содержимое прокручивается, actions остаются достижимыми.

«Заказать» использует существующую OrderPane и существующий auth gate:
гостю предлагается войти и вновь открыть сохранённый item; автоматического
возврата в заказ после входа не добавлено. Для вошедшего пользователя передаётся
выбранный composite. Исходных кадров в recent нет: существующий API получает
готовую уменьшенную полоску как одно supplied image в shotsJpeg, а compositeJpeg
содержит ту же полоску. Индивидуальные кадры не восстанавливаются и не имитируются.
В layoutName добавлено «копия из недавних»; предупреждение о качестве показано
в preview и форме. В существующем studio этот единственный source отображается
среди приложенных изображений. Full-resolution print-master из recent недоступен.
Успешный ответ вызывает существующий markOrdered; сбой оставляет форму и снимок.
Новый order backend, изменения server validation и payment не добавлялись.

## Share payload behavior

Общий payload для result и recent:

```text
files: [текущий digital JPEG File]
text: Сделано в сервисе inc&soul
      Ссылка:
```

Поле url отсутствует. Пустое `url: ""` не используется: Web Share трактует его
как текущий адрес, что могло бы передать локальный/Preview URL. Текст не рисуется
на изображении. Print PNG не участвует в Share. File готов до клика; share()
вызывается до первого await. Отдельно проверяются поддержка files и всего payload.

Гарантия приложения — передача JPEG и text в navigator.share. Получение,
сохранение и отображение подписи определяет target app/ОС. Telegram может принять
файл без текста или иначе оформить подпись; обходных схем для отдельных apps нет.
Разрешившийся Promise не является подтверждением доставки адресату.
Источник: [Web Share API — W3C](https://www.w3.org/TR/web-share/).

## Branding / print changes

У S3 прежний markSize около 25,3867 layout px, новый около 54,2756 px.
При ширине 50,8 мм это 7,03 → 15,03 физических pt, то есть +8 pt.
Формула добавки: `(8 / 72) × layout.width × 25.4 / widthMm`.
Она не зависит от DPI и действует согласованно на digital preview/JPEG/print.
Просто +8 CSS pt в layout-координатах дало бы лишь около +2,95 pt на бумаге.

Положение центра, цвет и текст логотипа сохранены. Дата: прежние размер и позиция.
S3 slots/crop/paper не менялись. Digital 520 × 1560, JPEG quality 0.93;
print 600 × 1800 PNG, 50,8 × 152,4 мм, 300 DPI, pHYs 11811 px/m.
Новый renderer не создавался. Существующий параметризованный 600 DPI также проверен.

Сравнение с compose из baseline SHA проверяет реальные canvas pixels: всё выше
области логотипа совпадает. Great Vibes: промежуток до даты 3,13 layout px,
нижнее поле 22,19 px; наложения/обрезания нет. S4 digital побайтово неизменен.
Проверены загруженные веб-шрифты и fallback (sandbox блокирует внешнюю сеть).

## Проверки

| Проверка | Baseline | Queue C |
| --- | --- | --- |
| Typecheck | PASS | PASS |
| Lint | 0 ошибок / 2 warnings | 0 ошибок / те же 2 warnings |
| Full tests | 201 PASS | 204 PASS / 0 fail / 0 skipped |
| Build без DATABASE_URL | PASS | PASS |
| Vercel Preview output / packaged PGLite startup | PASS | PASS |
| booth-regression | — | PASS |
| queue-a-regression | — | PASS |
| queue-b-regression | — | PASS, 8 viewport × closed/print |
| output-regression | — | PASS |
| queue-c-regression | — | PASS на dev и собранном Preview |
| queue-c-output-regression | — | PASS, 300/600 DPI, baseline pixels |

Browser: Chrome/Playwright, синтетическая камера и изображения. Native Share,
get-session и ответы заказа моделируются; настоящих заказов не создавали.
Queue C проверяет все 7 фильтров, exact JPEG + text, Share cancel/error/pending,
5 размеров result, 3 размера recent modal, скачивание из карточки/preview,
гостевой/authenticated order, ошибки/повтор/успешный ответ, guard/закрытие,
markOrdered, удаление обоими способами, reload и старый fade item.
Ошибки в тестовой инфраструктуре (название поля ФИО, alias в baseline fixture,
масштабируемый допуск антиалиасинга) исправлены, проверки не пропускались.

Команды: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
`node scripts/check-preview-build.mjs`, `node scripts/{booth,queue-a,queue-b,output,queue-c,queue-c-output}-regression.mjs`.
Последний output-script требует dev server; он сам извлекает baseline в ignored
artifacts. Для UI regression на `npm run preview`: `BOOTH_BASE_URL=http://localhost:8081/`.
Артефакты: ignored `artifacts/queue-c/`, `artifacts/queue-a/`, `artifacts/queue-b/`.

## Git / VERSION / COMMIT / PUSH

- Baseline HEAD и origin/pre-prod: `5f89caccbce0edc3a0b4b47ea7d63f2bc4179bd2`.
- Версия: `0.0.6` → `0.0.7`, одна итерация, без git tag.
- main baseline: `3fea86b58896650984813c2423f783c81e397f05`.
- prod baseline: `e844acc8a529eec5b189ad9e48ce6e23471feaed`.
- routeTree.gen.ts: исходная generated/local отметка без содержательного diff;
  не включается в commit. Остальные generated/local artifacts не включаются.
- После validation повторно сверяются HEAD/version/origin, затем bump,
  commit и обычный push только `HEAD:pre-prod`. Итоговые COMMIT/FINAL SHA/PUSH
  фиксируются в отчёте задачи, поскольку SHA самого коммита нельзя записать в него.
- Rollback: отдельный `git revert <Queue-C-SHA>` в pre-prod; здесь не выполнялся.

## Остановлено / known limitations

Ничего из Queue C не отложено по технической причине. Production deploy, main/prod,
accounts/auth changes, favorites, backend persistence, payment, новый order backend,
date toggle, новые layouts и global redesign сознательно вне очереди.
Отправка pre-prod может обновить Vercel Preview через существующую Git-интеграцию.
Локальная проверка build не подтверждает доступность облачного deployment/БД.
Внешние веб-шрифты по-прежнему зависят от сети; при отказе используется fallback.

## Нужно от владельца

- Физическая печать PNG в масштабе 100%: увеличенный brand mark, зазор до даты,
  нижнее поле, резкость и отсутствие изменения crop.
- iPhone Safari/PWA и Android Chrome: recent Скачать/Удалить/Поделиться;
  открыть preview, закрыть, проверить actions и Заказать с выбранным снимком.
- Result: конверт в order CTA, «Без фильтров», отсутствие «Выцветший», остальные фильтры.
- Share в Telegram из result и recent: JPEG, текст сервиса; отметить, сохраняет
  ли конкретная версия Telegram текст вместе с файлом.
- Центр save/print toggle в закрытом/открытом состоянии, print preparation/PNG.

После owner approval: следующий автономный блок Release Candidate в pre-prod —
закрыть реальные замечания устройств/печати, проверить облачный Preview и подготовить
релизный review. Production — только по отдельному решению владельца.

## CHANGED FILES

- UI: GalleryRail.tsx, OrderPane.tsx, ReviewPane.tsx, src/styles.css.
- Output/helpers: src/lib/compose.ts, src/lib/filters.ts, новый src/lib/share.ts.
- Tests: scripts/queue-c.test.mjs, scripts/queue-c-regression.mjs,
  scripts/queue-c-output-regression.mjs.
- Docs/version: docs/queue-c-v0.0.7.md, README.md, package.json, package-lock.json.

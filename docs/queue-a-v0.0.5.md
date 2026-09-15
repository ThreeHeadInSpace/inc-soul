# Queue A — Capture & output hardening

Дата: 15 сентября 2026. Ветка: `pre-prod`. Версия итерации: `0.0.5`.

## Baseline и границы релиза

- Начальный HEAD и `origin/pre-prod`: `924abd7db1304b07c01fd90d9b55690850f249d6` (`v0.0.4`).
- Зафиксированный `prod`: `e844acc8a529eec5b189ad9e48ce6e23471feaed`.
- Зафиксированный `main`: `3fea86b58896650984813c2423f783c81e397f05`.
- Единственная исходная локальная отметка — `src/routeTree.gen.ts`. Содержательного
  diff нет; нормализованный blob и HEAD совпадают:
  `3e5f7d5ea9c2972b5ebdf60aeb4a6b5e19558942`. Файл исключён из коммита Queue A.
- Изменения разрешены и публикуются только в `origin/pre-prod`; production не выпускается.

## Capture

На существующем экране S3 два действия рядом: «Снять кадр» и «Серия ×3».
Одиночное нажатие сразу заполняет первую свободную позицию. Три таких нажатия
открывают прежний review. Серия отсчитывает 3 секунды перед каждым кадром;
после частичного заполнения кнопка показывает число оставшихся кадров.
При пересъёмке доступны «Снять кадр» и «С таймером», а «Отмена» сохраняет
старые кадры, фильтр, подпись, цифровой JPEG и уже подготовленный печатный файл.

Оба действия используют один `captureFrame` и один `useCamera`. Запрос камеры
предпочитает 3840 × 2160 через `ideal`; это пожелание, а не гарантия устройства.
Захват сохраняет фактические `videoWidth`/`videoHeight` без уменьшения в PNG,
с прежним зеркалированием фронтальной камеры. Загруженные изображения остаются
в исходном виде и проходят проверку декодирования до заполнения слота.
Фильтр применяется при compose, исходные пиксели не перезаписываются.

## Output pipeline

Один renderer рисует макет в его исходных координатах с масштабом canvas;
типографика, поля, crop и рамки одинаково масштабируются для всех outputs.

| Назначение | Формат / размер | Источник |
| --- | --- | --- |
| Экран и fullscreen | PNG, 520 × 1560 для S3 | Исходные кадры, общий digital render |
| Download / Share | JPEG, 520 × 1560, quality 0.93 | Тот же digital render, отдельное кодирование |
| Candidate print-master | PNG, 600 × 1800, pHYs ≈300 DPI | Новый render непосредственно исходных кадров |
| Recent photos | Прежняя уменьшенная JPEG-миниатюра | Digital JPEG |

`composeLayout` сохраняет прежний контракт цифрового JPEG для существующих
внутренних потребителей. `composeDigitalOutputs` разделяет preview/JPEG.
`composePrintMaster` принимает `PrintSpec`: `widthMm`, `heightMm`, `dpi`.
Размер canvas — `round(mm / 25.4 × dpi)`. Проверяются положительные значения,
соответствие пропорциям макета и безопасный предел выделяемого canvas.

Текущий preset — **candidate 50,8 × 152,4 мм (2 × 6 дюймов), 300 DPI,
600 × 1800 px**: сохраняет пропорции S3 1:3. Это не утверждённый production
print standard. Параметризованный вариант 600 DPI даёт 1200 × 3600 px и также
проверен. Дополнительные макеты и UI выбора размеров не добавлялись.

PNG содержит pHYs = 11811 пикселей/метр для 300 DPI, с корректным CRC.
Это исправляет технические 96 DPI по умолчанию canvas без изменения пикселей.
Нет AI upscale, новых image/upscale библиотек или внешних API.

Для каждого фото рассчитывается запас исходного разрешения с учётом cover crop:
минимум отношений исходной ширины/высоты к размеру соответствующего печатного
слота. Для candidate слот требует примерно 492 × 467 исходных px после crop.
Тестовый источник 1920 × 1080 даёт примерно 694 эффективных DPI; 320 × 240 —
154 DPI и предупреждение. Это оценка количества пикселей, а не резкости,
экспозиции, качества объектива или гарантии физической печати.

Печатный файл готовится по запросу в «Скачать / сохранить». Изменение подписи,
фильтра или кадров инвалидирует старый файл. Старые object URLs освобождаются;
поздний результат отменённой генерации игнорируется. Ошибка print не блокирует
цифровой JPEG. Полноразмерные кадры/print-master живут только в текущей сессии;
recent photos не становятся архивом исходников. После новой съёмки/reload
восстановить print-master из миниатюры нельзя — его нужно скачать заранее.

## Найдено и исправлено

1. Повреждённый upload мог заполнить слот и сломать сборку review. Теперь проверка
   декодирования возвращает ошибку на экране камеры, сохраняя заполненные слоты.
2. Завершение capture/upload после выхода из компонента и flash-таймер могли
   продолжать обновление старой попытки. Добавлены проверка жизненного цикла и cleanup.
3. Асинхронная миниатюра могла дописаться после начала новой сессии либо
   перезаписать более свежий результат. Стабильный gallery ID и revision проверяются
   до записи; ошибка recent photos больше не превращается в unhandled rejection.
4. Раскрытие печатных действий сжимало mobile preview почти до нуля. Для раскрытых
   действий разрешена прокрутка документа с сохранением высоты preview.
5. Цифровой результат без проверки качества назывался «готова к печати».
   Статус теперь нейтральный; оценка разрешения относится к отдельному print output.
6. PWA manifest использовал hostname, а иконка была шаблонной Grok. Manifest
   использует существующее имя inc&soul, PNG-иконка растеризована из favicon.svg;
   OG description повторяет текущий description сайта. Новый branding не создавался.
7. Vite предупреждал об импорте JSON без attributes. Импорт package.json исправлен.
8. Собранный Preview без DATABASE_URL падал при старте PGLite: bundler перемещал
   код в `_libs`, оставляя WASM/data вне output. Nitro `traceDeps` сохраняет целый
   существующий пакет; новая проверка запускает упакованную копию независимо от
   workspace. Схема БД и auth не менялись.

## Validation

| Проверка | Baseline v0.0.4 | Queue A |
| --- | --- | --- |
| Typecheck | PASS | PASS |
| Lint | 0 errors, 3 warnings | 0 errors, 2 прежних warnings |
| Unit/integration | 173 pass / 14 fail / 187 | 181 pass / те же 14 fail / 195 |
| Production build без DATABASE_URL | PASS | PASS |
| Preview build / запуск output без DATABASE_URL | Сборка PASS; найден дефект упаковки PGLite | PASS, включая `check-preview-build.mjs` |
| Dev browser regression | PASS, 3 сессии | PASS, серия / одиночные / смешанный режим |
| Browser regression собранного Preview | Не зафиксирован | PASS, 3 сессии + весь fault-injection набор |
| Canvas/output | Старый JPEG 520 × 1560 | PNG preview, тот же digital contract, print 300/600 DPI |

Названия всех 14 failures сравниваются как множества; новых нет. Старые failures:
`check-auth-invariant.test.mjs` (2), `grok-pwa-plugin.test.mjs` (8),
`migration-plan.test.mjs` (1), `with-app-env.test.mjs` (3). Причины — старые
template/fixture ожидания, отсутствующий локальный app-env и Windows symlink
permissions. Изменённые manifest-вызовы покрыты отдельной passing-проверкой;
старые OG/title failures существовали до Queue A и не вызваны этой правкой.

Браузер: установленный desktop Chrome через Playwright. Камера синтетическая,
разрешение выдаёт browser context. Проверены ширины 360/390/768/1366, а также
844 × 390 landscape. Скриншоты камеры, review и раскрытой печати просмотрены.
Проверяются три сессии в одном документе, порядок/независимость кадров,
пересъёмка, отмена на каждом слоте/при countdown/позднем upload, фильтры, подпись,
fullscreen, побайтовое совпадение Share/download, сохранение и удаление тестовых
recent photos, освобождение tracks. Web Share API подменён только тестом:
capability detection, activation, отсутствие API, cancel, error и double click.

Дополнительная fault-injection проверяет ожидание/отказ/повтор камеры,
синтетический front/back, mirror style, ошибку capture и двойное нажатие,
повреждённый upload, ошибку/повтор цифровой сборки с сохранением кадров,
ошибку/повтор/ожидание print, реальное скачивание PNG,
его размеры и pHYs, предупреждение о низком разрешении, отзыв устаревшего URL,
позднюю запись gallery, прямые HTTP-ответы маршрутов и metadata/assets.

Canvas проверяется в Chromium по известным исходным пикселям: landscape и
portrait capture, mirror, crop, фильтр, цифровой JPEG, print 600 × 1800 и
1200 × 3600, слабый источник и отказы незавершённых/повреждённых входов.
Синтетический candidate master и JSON-отчёты лежат в `artifacts/queue-a/output/`.

Все сборки выполняются с пустым DATABASE_URL: миграции внешней БД не запускались.
В локальном Preview возможен существующий Better Auth warning об отсутствии
trusted client IP в loopback-сервере; доверие proxy/auth-настройки не расширялись.
В build output сохранены маршрутизация v3, static assets и сервер Node.js 24.
После bump релизная сборка и расширенный browser regression повторены;
интерфейс собранного Preview показывает `v0.0.5 · pre-prod`.

## Security / release hygiene

Проверены tracked files и diff: нет новых env, credentials, токенов, личных
локальных путей, debug output или временных артефактов. Поиск распространённых
форматов секретов не обнаружил совпадений; это техническая проверка, не аудит
всей истории Git. Секреты не выводились и не изменялись. `artifacts/`, сборки,
node_modules и локальные env остаются вне коммита.

## Release checklist и rollback

- Перед bump сверить HEAD, текущую версию и origin/pre-prod ещё раз.
- Увеличить patch один раз: package.json и package-lock.json → 0.0.5.
- Коммитить только Queue A; `routeTree.gen.ts` не включать.
- Обычный push только `HEAD:pre-prod`, без force push.
- Проверить remote SHA и Vercel Preview deployment, привязанный к нему.
- Отдельно повторно сверить SHA prod/main с baseline.
- Точка отката pre-prod: `924abd7db1304b07c01fd90d9b55690850f249d6`.
  При необходимости отменить релизный commit через `git revert <Queue-A-SHA>`
  в pre-prod и обычный push. Это создаст новый Preview; ветки prod/main не трогать.
  Откат здесь описан, не выполнялся.

Облачный Preview защищён Vercel Authentication. Анонимный HTTP-запрос может
вернуть 200 страницы Login, что не подтверждает работу приложения. Успех
GitHub/Vercel deployment и локальная проверка собранного output фиксируются
отдельно; полная проверка защищённого URL требует разрешённой сессии Vercel.
Точные release SHA/URL приведены в итоговом отчёте задачи и в GitHub deployment.

## Нужно от владельца

- iPhone / iOS Safari и Android / Chrome на HTTPS Preview: реальная камера,
  orientation, front/back, серия, три одиночных кадра, пересъёмка/отмена,
  несколько сессий и выключение индикатора камеры.
- Системный Share Sheet и реальное сохранение JPEG/PNG на обеих мобильных ОС.
- Подтвердить candidate 50,8 × 152,4 мм либо выбрать другой размер 1:3.
- Контрольная физическая печать: размер, crop/поля, фильтры, резкость и текст.
- После этих проверок — отдельное явное решение о production-релизе.

Без физических устройств/печати эти пункты не объявляются проверенными.
Параметры принтера, профиль цвета, бумага и окончательный физический стандарт
остаются предметом контрольной печати. Исходный stream может быть меньше 4K;
простое увеличение пикселей не признаётся улучшением качества.

## CHANGED FILES

- Capture: `src/components/booth/CameraStage.tsx`, `src/lib/use-camera.ts`.
- Output: `src/lib/compose.ts`, новый `src/lib/print-output.ts`,
  `src/components/booth/ReviewPane.tsx`, новый `PrintMasterAction.tsx`.
- Session/UX: `src/components/booth/BoothApp.tsx`, `src/styles.css`.
- Metadata/build: `scripts/grok-pwa-plugin.mjs`, `scripts/grok-pwa-shared.mjs`,
  `scripts/grok-pwa-shared.d.mts`, `server/middleware/grok-pwa.ts`,
  `src/lib/og/site.json`, `public/__grok/icon-180.png`, `vite.config.ts`.
- Проверки: `scripts/camera.test.mjs`, `scripts/booth-regression.mjs`, новые
  `scripts/print-output.test.mjs`, `scripts/output-regression.mjs`,
  `scripts/queue-a-regression.mjs`, `scripts/check-preview-build.mjs`.
- Документация/версия: `README.md`, этот отчёт, `package.json`, `package-lock.json`.

Технические источники:
[PGlite bundler support](https://pglite.dev/docs/bundler-support),
[canvas PNG density](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob),
[Vercel Git workflow](https://vercel.com/docs/git).

# Queue B — Device UX hardening & release preparation

Дата: 15 сентября 2026. Ветка: `pre-prod`. Версия итерации: `0.0.6`.

## Выполнено

- Квадратный S3 camera viewport, независимый от metadata и ориентации stream.
- Восстановление живого stream при foreground без повторного запроса камеры.
- Единый control «С таймером» с компактным popover 3/5/10 секунд и безопасным
  сохранением длительности на устройстве. Съёмка всех оставшихся слотов сохранена.
- Удалён нижний helper; цена S3 — «Печать 169 ₽», без доставки в preview.
- Крупный result preview с естественной вертикальной прокруткой на phone/tablet.
- Удалён прямой digital JPEG download из result UI. Share, preview/fullscreen,
  recent photos и внутренний JPEG pipeline сохранены. PNG для печати — отдельный
  пользовательский download после подготовки и проверки исходного разрешения.

## Самостоятельно найдено и исправлено

1. `aspect-ratio` при auto height и video в потоке допускал влияние intrinsic
   размеров video на контейнер. Размеры обеих сторон теперь определяет preview
   area, video расположен абсолютно внутри фиксированной crop-области.
2. После заполнения последнего слота `nextIndex=-1` временно переключал aspect
   на fallback 16:9. Для завершённого набора используется первый photo-slot.
3. Отсутствовали lifecycle handlers для паузы/восстановления video. Они добавлены;
   живая камера сохраняется, а завершившийся stream запрашивается заново один раз.
4. Старые request IDs отбрасывали поздний результат, но не предотвращали
   параллельные getUserMedia. Добавлены coalescing в hook и сериализация между
   экземплярами camera screen. Поздние tracks освобождаются до нового acquisition.
5. Отказ permission при переключении камеры мог запускать fallback-запрос.
   Denial теперь завершается без нового prompt; fallback оставлен для недоступной камеры.
6. Countdown мог продолжаться после background. Он отменяется при скрытии,
   pagehide и потере готовности камеры; заполненные слоты сохраняются.
7. Между применением debounce подписи и запуском нового compose прежний результат
   мог временно считаться готовым. Готовность теперь связана с точными входными
   кадрами, layout, фильтром, подписью и датой текущего render.
8. Исправлены 14 baseline failures: generic PWA-тесты изолированы от branding и OG
   рабочего проекта; app-env проверяется через fixtures; Windows directory links
   используют junction; migration test учитывает уже активированную auth schema.
   Runtime auth, DB и миграции не изменялись. Тесты не пропускались.
9. Удалены устаревшие сообщения, предлагающие JPEG download из result UI,
   и дубликат кнопки «Скачать макет» в существующем подтверждении заказа.

## ROOT CAUSES / camera geometry

В `v0.0.5` viewfinder имел preferred aspect ratio и `height:auto`, а video с
intrinsic размерами находился в normal flow. Metadata изменённого stream могло
влиять на высоту. Точный intermittent Safari сбой без iPhone не воспроизведён;
исправлен найденный механизм, а инвариант проверен при реальной смене metadata
синтетического MediaStream и lifecycle событиях в Chromium.

Viewport S3 строго 1:1. Существующий фото-слот JPEG немного шире квадрата:
426,4 × 404,04 layout px, около 1,055:1. Поэтому внутри квадратного viewport
есть тонкие нейтральные поля сверху/снизу, а видимая область изображения точно
соответствует photo-slot. Ни одной дополнительной части снимка за его crop
пользователь не видит. `object-fit:cover`, центрирование и front mirror совпадают
с renderer. Геометрия output, исходные pixels и crop renderer не менялись.

CSS не использует таймеры восстановления, JS resize measurements или remount.
`100cqw/cqh` задают обе стороны рамки по доступной области; portrait video не
может растянуть рамку. Проверены initial, metadata resize, orientation, visibility,
pagehide/pageshow, завершение/восстановление stream, front/back и retake/cancel.

## Responsive behavior

Размер видимой полосы в CSS px, закрытый блок сохранения, desktop Chrome:

| Viewport | v0.0.5 | Queue B |
| --- | --- | --- |
| 360 × 800 | 64 × 193 | 272 × 816 |
| 390 × 844 | 78 × 233 | 272 × 816 |
| 430 × 932 | 105 × 314 | 272 × 816 |
| 768 × 1024 | 278 × 833 | 384 × 1152 |
| 1024 × 768 | 190 × 571 | 300 × 900 |
| 1280 × 800 | 201 × 603 | 208 × 624 |
| 1366 × 768 | 190 × 571 | 208 × 624 |
| 1440 × 900 | 234 × 703 | 241 × 724 |

На телефонах рост линейных размеров 2,6–4,2 раза. До 900 px controls идут под
полосой; с 900 px — справа. Tablet использует более крупный размер, desktop —
размер по высоте окна. Во всех случаях 1:3, без transform scale, без изменения
JPEG 520 × 1560 или PNG preview. Expand print не сжимает изображение. Полоса
занимает более 90% высоты preview area. Документ прокручивается вертикально;
версия приложения располагается ниже controls. Проверены закрытое/раскрытое
состояние каждого из восьми viewport, отсутствие horizontal document overflow,
читабельность print details и print download target не ниже 44 px.

## Timer implementation

`TimerControl` использует установленный Radix Popover: открытие по «С таймером»,
три touch targets 3/5/10 сек, Escape/outside dismissal и возврат focus. Выбор
длительности запускает countdown. Выбранная длительность фиксируется для серии
в ref и применяется перед каждым оставшимся кадром. Существующая пауза 640 ms
между кадрами сохранена. Retake содержит единственный свободный слот.

Default 3 сек. `incsoul-timer-seconds-v1` хранит только 3/5/10 в localStorage;
повреждённое значение/запрет storage возвращает 3. Хранилище не содержит permission
или photos. Ошибка записи не блокирует съёмку. Звука, backend и DB не добавлено.

## Permission audit

| Flow | getUserMedia |
| --- | --- |
| Вход → три single или timed frames → result | 1 всего |
| Фильтр, выбор 3/5/10, countdown, capture, resize/orientation | 0 дополнительных |
| Background → foreground, если track жив | 0 дополнительных, повторный video.play |
| Возврат, если browser завершил track | +1, объединённый для lifecycle событий |
| Успешный front/back switch | +1 |
| Недоступный front/back, восстановление предыдущей камеры | +2: попытка и fallback |
| Denial при switch | +1, без fallback prompt |
| Вход в retake из result | +1: камера была освобождена при переходе в result |
| Отмена retake / выход / завершение | 0 новых, tracks остановлены |
| Новая съёмочная сессия | +1 |

Приложение управляет частотой запросов, их сериализацией, playback, состоянием
tracks и освобождением ресурсов. Browser решает permission prompt/persistence,
влияние origin/Preview hostname, Safari/PWA policy и завершение stream при фоне.
Приложение не хранит fake permission state и не обходит permission model.
Предпочтительное разрешение 3840 × 2160 остаётся ideal, а не гарантией устройства.

Gallery audit: стандартный `<input type=file accept="image/*" multiple>`.
FileReader получает только явно выбранные пользователем File. Directory access,
новых permission requests и произвольного чтения медиатеки нет. Код upload
не менялся. Реальный системный picker остаётся в device checklist.

## Result actions architecture

- Единственная S3 price-конфигурация: `S3_PRODUCT` в `src/lib/pricing.ts`:
  169 RUB; layout.unitPrice ссылается на неё, review форматирует её.
- Compose сохраняет lossless PNG preview и digital JPEG 520 × 1560, quality 0.93.
- Share заранее создаёт File из текущего JPEG и вызывает Web Share API внутри
  user activation. Print подготовка не подменяет этот файл. Ошибка/cancel Share
  не повреждают результат. Прямой JPEG download/link из review удалён.
- «Войти, чтобы сохранить» сохраняет существующий маршрут/поведение; новых
  accounts/auth/fake persistence нет. Favorites не добавлены.
- «Подготовить для печати» использует исходные captures и прежний renderer:
  candidate 50,8 × 152,4 мм, 300 DPI, PNG 600 × 1800, pHYs 11811 px/m.
- Низкое исходное разрешение по-прежнему вызывает предупреждение. Caption/filter/
  retake инвалидируют print output; старые object URLs освобождаются. Отмена
  retake сохраняет прежний result и подготовленный PNG.
- Recent photos остаются прежними уменьшенными JPEG, без архива исходников.

## Validation

| Проверка | Baseline | Queue B |
| --- | --- | --- |
| Typecheck | PASS | PASS |
| Lint | 0 errors / 2 warnings | 0 errors / те же 2 warnings |
| Full tests | 181 pass / 14 fail / 195 | 201 pass / 0 fail / 0 skipped |
| Production build без DATABASE_URL | PASS | PASS |
| Preview build / packaged PGLite startup | PASS | PASS |
| Browser S3 sessions / fault injection | PASS | PASS |
| 8 viewport × closed/print | baseline measurements | PASS |
| Lifecycle / serialized requests / timer | отсутствовало полное покрытие | PASS |
| Digital / preview / print / metadata | PASS | PASS |

Browser — установленный Chrome через Playwright, локальные dev и packaged Preview.
Внешние Share Sheet и camera permission prompts моделируются в тестах. Проверки
включают single/series/remaining, retake timed/immediate, отмену всех слотов и
поздних upload/media, несколько sessions, front/back, mirror, denied/retry,
ошибки capture/compose/print, print loading, PNG download и pHYs, Share capabilities/
activation/cancel/errors/double click, filters/caption, fullscreen, recent photos,
late gallery isolation, HTTP routes, title/description/OG, manifest/favicon/assets.

Нативная смена metadata синтетического canvas MediaStream проверяет square/crop
при 1920 × 1080, 1080 × 1920, 1440 × 1920. Сравнение screenshot live portrait crop
с первым слотом итогового PNG: 16 контрольных точек, max channel delta 0.
Canvas regression отдельно проверяет исходное разрешение portrait/landscape,
mirror, cover crop, фильтры, legacy JPEG, print 300/600 DPI и слабые источники.

Сборки выполняются с пустым DATABASE_URL; внешние миграции не запускались.
Local Preview может выдавать существующее Better Auth предупреждение о trusted
client IP на loopback. Настройки proxy/auth не расширялись.

Артефакты: `artifacts/queue-b/`, результаты совместимых Queue A проверок —
`artifacts/queue-a/`. Они игнорируются Git. Секреты/env/credentials не добавлены,
проверка распространённых secret patterns в tracked files не дала совпадений.
Нет новых локальных абсолютных путей, debug text или test data в product UI.
Metadata/manifest/favicon/branding не требовали изменений.

## Git / rollback

- Baseline HEAD = origin/pre-prod: `0c1fb3e8c7aa98700ecc7e1dc1276adadf6c1d97`.
- Rollback SHA: `0c1fb3e8c7aa98700ecc7e1dc1276adadf6c1d97` (`v0.0.5`).
- main baseline: `3fea86b58896650984813c2423f783c81e397f05`.
- prod baseline: `e844acc8a529eec5b189ad9e48ce6e23471feaed`.
- Исходный routeTree.gen.ts имеет только local/generated отметку; normalized blob
  совпадает с HEAD: `3e5f7d5ea9c2972b5ebdf60aeb4a6b5e19558942`. В commit не включён.
- Перед bump повторно проверяются HEAD, версия и origin. Patch: 0.0.5 → 0.0.6.
- Commit/push только `HEAD:pre-prod`, без force. Финальные SHA и Preview URL
  зафиксированы в итоговом отчёте задачи и в GitHub deployment.
- Безопасный откат: `git revert <Queue-B-commit>` в pre-prod, обычный push.
  Откат описан, не выполнен. main/prod и production deployment не изменяются.

## Нужно от владельца / known limitations

- iPhone Safari/PWA: background → return, квадратная рамка и идентичный crop;
  также повторить после camera switch, retake/cancel и orientation.
- Android Chrome/PWA: background → return и повторный вход в booth.
- Таймер 3/5/10 сек: все свободные слоты, один/два оставшихся, retake.
- Реальная камера: ориентиры у краёв preview должны совпасть с готовыми кадрами;
  front/back, mirror, разрешение и работа system file picker.
- Mobile result preview; tablet portrait и landscape; открытый save/print блок.
- Системный Share Sheet использует JPEG; проверить полученный файл.
- Print preparation, предупреждение слабого источника, PNG print download.
- Контрольная физическая печать candidate: 50,8 × 152,4 мм, поля/crop, резкость,
  фильтры и текст. Принтер, бумага и цветовой профиль не проверены программно.

Это не STOP разработки Queue B: физические устройства, Share Sheet и печать
нельзя объявлять проверенными по desktop browser automation. Нужен owner approval
этих результатов перед следующим release блоком. Production не выпускался.

После approval: автономный блок Release Candidate — исправить замечания устройств/
печати в пределах согласованного S3, повторить regression и подготовить RC в
pre-prod. Любой production deploy требует отдельного решения.

## CHANGED FILES

- UI: `CameraStage.tsx`, новый `TimerControl.tsx`, `ReviewPane.tsx`,
  `PrintMasterAction.tsx`, `BoothApp.tsx`, `src/styles.css`.
- Logic/config: `use-camera.ts`, новый `capture-timer.ts`, `pricing.ts`,
  `layouts.ts`, `utils.ts`.
- Tests: `camera.test.mjs`, новый `capture-timer.test.mjs`, новый
  `queue-b-regression.mjs`, `booth-regression.mjs`, `queue-a-regression.mjs`,
  fixture fixes в `check-auth-invariant.test.mjs`, `grok-pwa-plugin.test.mjs`,
  `migration-plan.test.mjs`, `with-app-env.test.mjs`.
- Documentation/version: этот отчёт, `README.md`, `package.json`, `package-lock.json`.

Источники: [CSS preferred aspect ratio](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/aspect-ratio),
[replaced elements](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Images/Replaced_element_properties),
[getUserMedia permissions/origin](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia),
[Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

# Owner feedback pass — v0.0.8

18 сентября 2026. Ветка `pre-prod`. Baseline/rollback:
`2d2c51ad0cc839e1da306c47f23a6a9a60f89742`, версия `0.0.7`.

## Выполнено

Единственное изменение runtime — размеры даты и логотипа S3 в compose.ts.
Owner approval для recent actions/preview/order-to-login, filters, envelope CTA,
save/print и PNG зафиксирован. Эти блоки не изменены. Аккаунты, auth, order backend,
fake login и обход входа не добавлялись.

## Branding values

| Элемент | v0.0.7 | v0.0.8 | Изменение |
| --- | --- | --- | --- |
| Дата | 8,067 pt / 29,131 layout px | 10,067 pt / 36,353 px | +2 физических pt |
| inc&soul | 15,030 pt / 54,276 layout px | 13,030 pt / 47,053 px | −2 физических pt |

1 физический pt = layout.width × 25.4 / (72 × 50.8) layout px.
Координаты не менялись: дата (260; 1485,12), логотип (260; 1525,056).
Формат даты, разделитель, кадры, crop, поля и renderer architecture сохранены.
S3 digital — 520×1560; print — 600×1800 PNG, 50,8×152,4 мм, 300 DPI,
pHYs 11811 px/m. Изменение пропорционально отражено в digital preview/JPEG.

Canvas regression сравнивает результат с кодом из фактического baseline SHA,
проверяет +2/−2 pt при 300/600 DPI и побайтовое совпадение пикселей выше области
даты (включая кадры, поля и разделитель). S4 digital остаётся побайтово прежним.
С загруженными Outfit/Great Vibes зазор date→logo 3,725 layout px, нижнее поле
24,483 px; fallback — 3,381 и 21,467 px. Наложений/обрезания нет.
Артефакт для контрольной печати: `artifacts/owner-feedback/brand-print-300dpi.png`.

## Share — фактический результат

Аудит ReviewPane.tsx, GalleryRail.tsx и src/lib/share.ts подтвердил, что код
v0.0.7 уже вызывал ровно один navigator.share на действие. Runtime Share не менялся.
Две точки вызова соответствуют двум независимым UI: result и recent; один клик
не вызывает их обе. Ни отдельного text-share, ни последовательного file-share,
ни clipboard, deep links, Bot API, backend или рисования share text в pixels нет.

Реальный payload имеет ровно два ключа:

```js
{ files: [imageFile], text: "Сделано в сервисе inc&soul\nСсылка:" }
```

- File один, MIME `image/jpeg`. Result: 520×1560, encoder quality 0.93.
- Recent: прежняя сохранённая копия S3 240×720, encoder quality 0.72.
  Owner-tested recent storage/quality не менялись; оригиналы там не хранятся.
- File создаётся до клика; Share не запускает compose/print conversion.
- Передаётся точный текущий digital JPEG, что проверяется побайтово; не print PNG.
- canShare проверяет files отдельно и затем комбинированный payload.
- URL/title отсутствуют; Vercel Preview URL не передаётся как публичный адрес.
- Отмена AbortError не считается ошибкой; synchronous ref защищает double click.
- Unsupported result скрывает Share, оставляя print flow; recent позволяет Download.

Приложение контролирует один вызов, File и text в общем payload. ОС и target app
решают, как представить данные. По отчёту владельца Telegram уже разделяет текст
и фото на его устройстве при корректной единой реализации. Это наблюдаемое
поведение его связки browser/OS/Telegram; универсальное поведение всех версий
Telegram и отдельный виновный слой этим тестом не устанавливаются.
Технически гарантировать Telegram image caption через Web Share API нельзя.
Автоматизация проверяет вход в API, а не native share sheet или Telegram.
Источник: [Web Share API, W3C](https://www.w3.org/TR/web-share/).

## Самостоятельно найдено и исправлено

Дополнительных подтверждённых runtime-проблем не обнаружено. В расширенном
output regression исправлен разбор canvas font: parseFloat у строки
`500 36px Outfit` возвращал вес 500; тест теперь извлекает число перед px.

Один dev-прогон booth-regression не увидел ожидаемый кадр; он выполнялся рядом
с генерацией fixture/сборкой. Влияние HMR не исключено. Для исключения изменяемого
окружения полный набор повторён на packaged Preview и прошёл без изменения
camera runtime, ослабления assertions или пропуска сценариев.

## Проверки

Baseline: typecheck PASS, lint 0 errors / 2 warnings, 204 tests PASS,
production build PASS, packaged PGLite startup PASS.

После правок: typecheck PASS; lint 0 errors / те же 2 warnings;
full tests 204 PASS / 0 fail / 0 skipped; optimized production-mode build PASS;
Preview build с меткой pre-prod PASS; packaged Preview startup PASS.

Browser: booth-regression, queue-a-regression, queue-c-regression на packaged
Preview — PASS. Проверены camera sessions, retake, filters, CTA, centered save,
print preparation/download/DPI, fullscreen, recent actions, existing order gate.
Расширенный queue-c-regression считает ровно один share() на клик в result,
карточке recent и modal; проверяет ключи payload, один File, MIME, размеры,
точные JPEG bytes, общий text, zero clipboard writes, cancel и double click.
booth-regression проверяет missing share/canShare, files unsupported, throwing
probe и recovery. output-regression — PASS; обновлённый
queue-c-output-regression — PASS с веб-шрифтами и fallback при 300/600 DPI.

Команды: npm run typecheck; npm run lint; npm test; npm run build;
node scripts/check-preview-build.mjs; node scripts/booth-regression.mjs;
node scripts/queue-a-regression.mjs; node scripts/queue-c-regression.mjs;
node scripts/output-regression.mjs; node scripts/queue-c-output-regression.mjs.
Последние два требуют dev server. Для UI suite на Preview задаётся BOOTH_BASE_URL.
Физические устройства и caption в Telegram автоматизацией не проверены.

## Git / Preview

Версия 0.0.7 → 0.0.8. Commit и обычный push только в origin/pre-prod, без force.
Перед bump повторно проверены HEAD/version/origin. main/prod не изменяются:
main `3fea86b58896650984813c2423f783c81e397f05`,
prod `e844acc8a529eec5b189ad9e48ce6e23471feaed`.
Исходная local/generated отметка routeTree.gen.ts не включена в commit.
Rollback: отдельный git revert коммита этой итерации, baseline SHA указан выше.

Vercel connector не возвращает доступных teams. Проверка Preview выполняется
через GitHub deployments/statuses интеграции Vercel с привязкой к точному SHA.
Baseline deployment 6512259050: Preview / success. Итоговые SHA, deployment ID,
статус и URL новой версии фиксируются в итоговом отчёте задачи после push.
Production deploy не выполняется. Следующая крупная функция не начинается.

## Нужно от владельца

- Проверить новую дату/логотип на экране и желательно на физической печати.
- Share → Telegram на iPhone.
- Share → Telegram/другой мессенджер на Android.

Если Telegram снова разделит изображение и текст при проверенном общем payload,
это подтверждает target/platform behavior на данной связке, а не два действия приложения.

После approval: Release Candidate hardening / feature freeze / production preparation.

## CHANGED FILES

- src/lib/compose.ts
- scripts/queue-c-output-regression.mjs (теперь сравнивает с v0.0.7, +2/−2 pt)
- scripts/queue-c-regression.mjs (один share, точные keys/File/bytes, без clipboard)
- docs/owner-feedback-v0.0.8.md
- README.md
- package.json
- package-lock.json

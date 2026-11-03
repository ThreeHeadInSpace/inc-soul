const moscowDateTime = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatOrderDate(value: string | Date): string {
  const parts = Object.fromEntries(
    moscowDateTime.formatToParts(new Date(value)).map(({ type, value }) => [type, value]),
  );
  return `${parts.day}.${parts.month}.${parts.year} ${Number(parts.hour)}:${parts.minute} МСК`;
}

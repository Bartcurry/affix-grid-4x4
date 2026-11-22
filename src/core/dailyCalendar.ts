import { validDailyDate } from './daily';

export function dailyCalendar(month: string, today: string) {
  if (!/^\d{4}-\d{2}$/.test(month) || !validDailyDate(today) || month > today.slice(0, 7)) return;
  const first = new Date(`${month}-01T00:00:00Z`);
  if (!Number.isFinite(first.getTime()) || first.toISOString().slice(0, 7) !== month) return;
  const year = first.getUTCFullYear();
  const index = first.getUTCMonth();
  const count = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const previous = new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10);
  const next = new Date(Date.UTC(year, index + 1, 1)).toISOString().slice(0, 7);
  const days = Array.from({ length: count }, (_, i) => {
    const day = `${month}-${String(i + 1).padStart(2, '0')}`;
    return { day, playable: day <= today && validDailyDate(day) };
  });
  if (days.every(day => !day.playable)) return;
  return {
    days, year, month: index + 1, leading: (first.getUTCDay() + 6) % 7,
    previous: validDailyDate(previous) ? previous.slice(0, 7) : undefined,
    next: next <= today.slice(0, 7) ? next : undefined,
  };
}

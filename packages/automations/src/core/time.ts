// Asia/Dubai is fixed UTC+4 (no DST).
const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;

function dubaiHour(d: Date): number {
  return new Date(d.getTime() + DUBAI_OFFSET_MS).getUTCHours();
}

/**
 * Is this UTC moment inside the quiet window (Dubai-local)?
 * If startHour < endHour, the window is contiguous (e.g. 0..7 = midnight to 7am).
 * If startHour > endHour, it wraps midnight (e.g. 22..7 = 10pm to 7am).
 */
export function isInQuietHours(d: Date, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false;
  const h = dubaiHour(d);
  return startHour < endHour
    ? h >= startHour && h < endHour
    : h >= startHour || h < endHour;
}

/**
 * If `d` is in the quiet window, push it to the next active boundary (Dubai-local
 * `endHour:00`). Otherwise return `d` unchanged.
 */
export function deferToActiveHours(d: Date, startHour: number, endHour: number): Date {
  if (!isInQuietHours(d, startHour, endHour)) return d;

  const dubai = new Date(d.getTime() + DUBAI_OFFSET_MS);
  const Y = dubai.getUTCFullYear();
  const M = dubai.getUTCMonth();
  const D = dubai.getUTCDate();
  const H = dubai.getUTCHours();

  // Default: today's `endHour:00` Dubai-local.
  let boundaryDubaiUtcMs = Date.UTC(Y, M, D, endHour, 0, 0);

  // If the quiet window wraps midnight and we're on the "before midnight" side,
  // advance to tomorrow's endHour.
  if (startHour > endHour && H >= startHour) {
    boundaryDubaiUtcMs = Date.UTC(Y, M, D + 1, endHour, 0, 0);
  }

  return new Date(boundaryDubaiUtcMs - DUBAI_OFFSET_MS);
}

export function dubaiClock(d: Date): { hour: number; minute: number } {
  const dubai = new Date(d.getTime() + DUBAI_OFFSET_MS);
  return { hour: dubai.getUTCHours(), minute: dubai.getUTCMinutes() };
}

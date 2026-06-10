const dubai = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dubai",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDubai(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dubai.format(dt);
}

const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const STEPS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.345, "week"],
  [12, "month"],
  [Number.POSITIVE_INFINITY, "year"],
];

export function relativeTime(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  let diff = (dt.getTime() - now.getTime()) / 1000;
  for (const [factor, unit] of STEPS) {
    if (Math.abs(diff) < factor) return RTF.format(Math.round(diff), unit);
    diff /= factor;
  }
  return RTF.format(Math.round(diff), "year");
}

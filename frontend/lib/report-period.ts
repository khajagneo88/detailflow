/** Small date-range helper for the Reports page's "hours per detailer" /
 * rework / batch-throughput metrics — deliberately its own file rather than
 * an addition to lib/week.ts, which is Planning's own date-math module and
 * out of scope for this change. Presets are intentionally just week / month
 * / all-time / custom (per docs/ARCHITECTURE.md §12.3's Reports section,
 * extended) — this page doesn't need Planning's Monday-aligned week
 * semantics, just a plain rolling window.
 */

export type ReportPeriodPreset = "week" | "month" | "all" | "custom";

export interface ReportPeriodRange {
  start?: string;
  end?: string;
}

function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const REPORT_PERIOD_LABELS: Record<ReportPeriodPreset, string> = {
  week: "Last 7 days",
  month: "Last 30 days",
  all: "All time",
  custom: "Custom range",
};

/** Resolves a preset (plus, for "custom", the person's own start/end) into
 * the {start, end} inclusive-date bounds the report endpoints take. "all"
 * and an incomplete custom range both resolve to {} — no bounds, i.e.
 * all-time — rather than guessing a range. */
export function resolveReportPeriod(
  preset: ReportPeriodPreset,
  custom: ReportPeriodRange = {}
): ReportPeriodRange {
  if (preset === "all") return {};
  if (preset === "custom") return custom;

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (preset === "week" ? 6 : 29));
  return { start: toISODate(start), end: toISODate(end) };
}

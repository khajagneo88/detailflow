/** Small date-math helpers for the Planning page — kept separate from
 * lib/status.ts's formatDate() since these are about picking/labelling a
 * *week*, not formatting a single date. Mirrors the server's own week
 * normalisation (app/services/weekly_plan_service.py::monday_of) so the
 * displayed week always matches what a create call would actually save
 * against. */

function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Monday of the week containing `isoDate` (or today, if omitted), as an
 * ISO date string — matching the backend's Monday-based normalisation. */
export function mondayOf(isoDate?: string): string {
  const d = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date();
  const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diff);
  return toISODate(d);
}

export function addWeeks(mondayIso: string, weeks: number): string {
  const d = new Date(`${mondayIso}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return toISODate(d);
}

/** True once a week is fully over — i.e. its Monday is before this week's
 * Monday. Weeks are always Monday-aligned (mondayOf), so comparing the
 * ISO date strings directly is a valid chronological comparison. Used to
 * decide when the Planning page starts marking plan items green/red
 * (§19) instead of leaving them neutral — nothing to judge yet for the
 * current or a future week. */
export function isPastWeek(mondayIso: string): boolean {
  return mondayIso < mondayOf();
}

/** "Sep 7 – Sep 13, 2026" for the week starting on `mondayIso`. */
export function formatWeekRange(mondayIso: string): string {
  const start = new Date(`${mondayIso}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startLabel} – ${endLabel}`;
}

/** The five business-day ISO dates (Monday-Friday) of the week starting on
 * `mondayIso` — this is a cabinetry/joinery shop, not a 7-day operation, so
 * the Planning grid only ever shows these five columns (see
 * app/(app)/planning/page.tsx). */
export function weekdayDates(mondayIso: string): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    dates.push(addDays(mondayIso, i));
  }
  return dates;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** "Mon, Sep 15" for a single day column heading. */
export function formatDayHeading(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** True once `isoDate` is strictly before today — the day-level equivalent
 * of isPastWeek above, used to decide when a room-linked plan chip should
 * show the worked/not-worked indicator (adapting §19's project/week
 * green-red marking to a single day — see docs/ARCHITECTURE.md and
 * app/services/plan_service.py::logged_minutes_map). Today itself is
 * deliberately treated the same as a future day — not yet "over" — matching
 * how the old feature never recoloured the current week's chips either. */
export function isPastDay(isoDate: string): boolean {
  return isoDate < toISODate(new Date());
}

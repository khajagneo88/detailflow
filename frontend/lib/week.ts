import type { Weekday } from "@/types";

/** Small date-math helpers for the Planning page. Every function that needs
 * to know which day "a week" starts on takes it as a `Weekday` parameter
 * rather than assuming Monday (or any other fixed day) — that day is an
 * admin-configurable workspace setting (AppSettings.planning_week_start_day,
 * see features/settings/api.ts), not a constant, so the Planning page reads
 * it once and threads it through everywhere below. */

// Maps onto JS's own Date.getDay() convention (0 = Sunday ... 6 = Saturday)
// at the one place that needs an actual index — everywhere else in this
// app just passes the Weekday string straight through.
const WEEKDAY_TO_JS_DAY: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** All 7 weekdays, Monday-first, for populating a settings dropdown. */
export const WEEKDAY_OPTIONS: { value: Weekday; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** The most recent occurrence of `anchorWeekday` on or before `isoDate` (or
 * today, if omitted), as an ISO date string — i.e. the first day of the
 * week containing that date, given the configured anchor. */
export function weekStartOf(anchorWeekday: Weekday, isoDate?: string): string {
  const d = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date();
  const anchorDay = WEEKDAY_TO_JS_DAY[anchorWeekday];
  const diff = (d.getDay() - anchorDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toISODate(d);
}

export function addWeeks(weekStartIso: string, weeks: number): string {
  return addDays(weekStartIso, weeks * 7);
}

/** True once a week is fully over — i.e. its start is before the current
 * week's start under the same anchor day. Weeks are always aligned to
 * `anchorWeekday` (weekStartOf), so comparing the ISO date strings directly
 * is a valid chronological comparison. Used to decide when the Planning
 * page starts marking plan items green/red (§19) instead of leaving them
 * neutral — nothing to judge yet for the current or a future week. */
export function isPastWeek(weekStartIso: string, anchorWeekday: Weekday): boolean {
  return weekStartIso < weekStartOf(anchorWeekday);
}

/** "Sep 7 – Sep 13, 2026" for the 7-day week starting on `weekStartIso`. */
export function formatWeekRange(weekStartIso: string): string {
  const start = new Date(`${weekStartIso}T00:00:00`);
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

/** The five business-day ISO dates within the 7-day week starting on
 * `weekStartIso`, in chronological order — this is a cabinetry/joinery
 * shop, not a 7-day operation, so the Planning grid only ever shows these
 * five columns (see app/(app)/planning/page.tsx). Any 7-day span contains
 * exactly 5 weekdays regardless of which day it starts on, so this holds
 * for whatever anchor day AppSettings.planning_week_start_day is currently
 * set to — e.g. a Tuesday-anchored week shows Tue/Wed/Thu/Fri/Mon, skipping
 * the Sat/Sun in between. */
export function weekdayDates(weekStartIso: string): string[] {
  const dates: string[] = [];
  for (let offset = 0; dates.length < 5 && offset < 7; offset++) {
    const iso = addDays(weekStartIso, offset);
    const dayOfWeek = new Date(`${iso}T00:00:00`).getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) dates.push(iso);
  }
  return dates;
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

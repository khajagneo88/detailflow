/**
 * Task-category colour coding for the Planning grid — a literal request
 * from the product owner ("no colour for a new project, purple for IFA,
 * orange for IFC, green for BOM, yellow for nesting"), not this app's usual
 * 5-variant semantic Badge palette (lib/status.ts::stageVariant /
 * batchStatusVariant). Deliberately kept as its own module rather than
 * folded into lib/status.ts, per the product ask to not conflate the two —
 * this answers "which production category is this task", stageVariant/
 * batchStatusVariant answer "what state is this specific stage/status in".
 *
 * The category tokens themselves (--plan-ifa, --plan-ifc, ...) live in
 * app/globals.css next to this app's other colour tokens.
 */

import { isPastWeek } from "@/lib/week";

export type PlanCategory = "new_project" | "ifa" | "ifc" | "bom" | "nesting" | "complete";

/** A room's category is read straight off its current workflow stage key
 * (app/models/workflow_stage.py::DEFAULT_WORKFLOW_STAGES) — generic on the
 * "ifa"/"ifc" key prefix rather than an explicit stage-by-stage map, so a
 * future stage inserted into either cycle (e.g. a Variation stage) is
 * automatically the right colour without this file needing an update. */
export function categorizeRoomStage(stageKey: string): PlanCategory {
  if (stageKey === "complete") return "complete";
  if (stageKey.startsWith("ifa")) return "ifa";
  if (stageKey.startsWith("ifc")) return "ifc";
  // setup, modelling_3d, waiting_check_measure, final_detailing — the
  // solitary modelling work before anything is reviewable (docs/
  // ARCHITECTURE.md §11.2) — "starting a new project", no colour.
  return "new_project";
}

/** A batch's category is read off its BatchStatus (app/models/enums.py) —
 * bom_pending/bom_review are still "doing the BOM" (green), nesting is its
 * own thing (yellow), complete is done. */
export function categorizeBatchStatus(status: string): PlanCategory {
  if (status === "complete") return "complete";
  if (status === "nesting") return "nesting";
  return "bom"; // bom_pending, bom_review — and a safe default for anything else
}

interface PlanCategoryStyle {
  label: string;
  /** Classes for the task chip itself. */
  chipClass: string;
  /** Small legend/list swatch — a plain filled dot, independent of the
   * chip's own (sometimes outline, sometimes muted) treatment so the
   * legend reads consistently regardless of each chip's exact styling. */
  dotClass: string;
}

export const PLAN_CATEGORY_STYLES: Record<PlanCategory, PlanCategoryStyle> = {
  new_project: {
    label: "New Project",
    chipClass: "border-border bg-surface text-foreground",
    dotClass: "bg-muted-foreground",
  },
  ifa: {
    label: "IFA",
    chipClass: "border-transparent bg-plan-ifa-bg text-plan-ifa",
    dotClass: "bg-plan-ifa",
  },
  ifc: {
    label: "IFC",
    chipClass: "border-transparent bg-plan-ifc-bg text-plan-ifc",
    dotClass: "bg-plan-ifc",
  },
  bom: {
    label: "BOM",
    chipClass: "border-transparent bg-plan-bom-bg text-plan-bom",
    dotClass: "bg-plan-bom",
  },
  nesting: {
    label: "Nesting",
    chipClass: "border-transparent bg-plan-nesting-bg text-plan-nesting",
    dotClass: "bg-plan-nesting",
  },
  // A muted/done treatment, visually distinct from the plain "new project"
  // outline chip (which is still active, unstarted work) — struck-through
  // text plus the app's existing neutral surface, same "de-emphasise rather
  // than compete for colour" idea the Gantt rework used for complete rooms
  // (docs/ARCHITECTURE.md §12.4).
  complete: {
    label: "Complete",
    chipClass: "border-transparent bg-surface-muted text-muted-foreground line-through",
    dotClass: "bg-muted-foreground",
  },
};

/**
 * Past-week completion highlight — replaces the old per-room/day
 * worked-or-not indicator (a small dot driven by whether *any* TimeEntry
 * existed for that room on that specific day, see docs/ARCHITECTURE.md
 * §22.4) with a coarser but more meaningful signal at the same "is this in
 * the past" moment: did this task actually reach `complete` sometime
 * during the week it was planned for, not just "did they log time that
 * day." Judgment call, made deliberately: showing both signals for a past
 * task would answer two overlapping "did they do the work" questions at
 * once, so the day-level worked dot is retired in favor of this
 * week-level completion signal (logged_minutes/TimeEntry data is still
 * exposed on PlanEntry — see types/index.ts — just no longer rendered as
 * its own indicator on the chip).
 *
 * Judged only once the *viewed* week has fully elapsed (isPastWeek on the
 * grid's own weekStart, not "today" in isolation, and not recomputed from
 * entry.date — every entry the grid renders for a given week already
 * falls within that week's Mon-Fri range by construction, since the page
 * fetches GET /planning/entries?start=&end= for exactly those five days).
 * The current or a future week's chips get no judgment yet — same
 * "nothing to judge yet" rule §19.3 and §22.4 already established.
 *
 * `weekEndIso` is the week's last displayed day (Friday — lib/week.ts::
 * weekdayDates only ever shows Mon-Fri, this being a 5-day shop, not a
 * 7-day one), so "within the assigned week" here means Monday through
 * Friday inclusive, not Monday through Sunday.
 */
export type WeekCompletionRing = "success" | "danger" | null;

function utcDateOnly(isoDatetime: string): string {
  // Plain UTC calendar-day slice of an API timestamp (e.g.
  // "2026-09-05T00:00:00+00:00") — ISO 8601 always puts the date first, so
  // this is safe regardless of the trailing offset/zone format. Matches
  // this app's existing plain-UTC-calendar-day convention for planning
  // (app/services/plan_service.py::logged_minutes_map /
  // room_completed_at_map) rather than resolving to the viewer's local
  // timezone.
  return isoDatetime.slice(0, 10);
}

/** null = week not over yet, nothing to judge. "success" = completed
 * within [weekStartIso, weekEndIso]. "danger" = never completed, or
 * completed outside that range (a later week — or, in the rare case of a
 * reopened room, an earlier one — either way not "during" the week it was
 * assigned). */
export function weekCompletionRing(
  taskCompletedAt: string | null,
  weekStartIso: string,
  weekEndIso: string
): WeekCompletionRing {
  if (!isPastWeek(weekStartIso)) return null;
  if (!taskCompletedAt) return "danger";
  const completedDate = utcDateOnly(taskCompletedAt);
  return completedDate >= weekStartIso && completedDate <= weekEndIso ? "success" : "danger";
}

/** The chip tooltip's plain-language explanation of the ring above — never
 * color-only, same accessibility rule this app's presence dot (§17.3) and
 * Gantt rework (§12.4) already followed. Returns undefined when the week
 * isn't over yet, so the chip's tooltip stays exactly what it was before
 * (just the task's own label/note) until there's something to report. */
export function weekCompletionTooltip(
  taskCompletedAt: string | null,
  weekStartIso: string,
  weekEndIso: string
): string | undefined {
  if (!isPastWeek(weekStartIso)) return undefined;
  if (!taskCompletedAt) return "Not completed during its assigned week";

  const completedDate = utcDateOnly(taskCompletedAt);
  const label = new Date(taskCompletedAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });

  if (completedDate >= weekStartIso && completedDate <= weekEndIso) {
    return `Completed on time, ${label}`;
  }
  if (completedDate > weekEndIso) {
    const daysLate = Math.round(
      (new Date(`${completedDate}T00:00:00Z`).getTime() -
        new Date(`${weekEndIso}T00:00:00Z`).getTime()) /
        86_400_000
    );
    return `Completed ${daysLate} day${daysLate === 1 ? "" : "s"} late, on ${label}`;
  }
  // Rare edge case (e.g. a reopened room re-planned onto a later week than
  // it originally finished) — still red (not "during" the assigned week),
  // but the tooltip says so plainly rather than implying lateness.
  return `Completed ${label}, before its assigned week`;
}

/** Legend order — matches the product ask's own listing order (new project,
 * IFA, IFC, BOM, nesting), with "complete" tacked on last since it wasn't
 * one of the five named colours but still needs explaining once it shows up
 * on the grid. */
export const PLAN_CATEGORY_LEGEND_ORDER: PlanCategory[] = [
  "new_project",
  "ifa",
  "ifc",
  "bom",
  "nesting",
  "complete",
];

import { PLAN_CATEGORY_STYLES, roomCategory } from "@/lib/plan-colors";
import type { Room } from "@/types";

/**
 * Compact IFA / IFC / BOM / Nesting (/ Complete) chip shown right next to a
 * room's name — a literal product-owner ask ("I want the IFA and IFC, BOM,
 * & NESTING to show next to the job/room name so we know what stage it is
 * at") distinct from the existing full-detail "Stage" badge/column
 * (lib/status.ts::stageVariant, e.g. "IFA Internal Review") that's still
 * shown elsewhere on the same pages — this is the same category vocabulary
 * the Planning grid already uses (lib/plan-colors.ts), just applied next to
 * a room's name everywhere else it's listed rather than only on a planned
 * task chip. See docs/ARCHITECTURE.md §24 and roomCategory's own docs for
 * how a batched room's category is picked. Takes just the fields
 * roomCategory needs, not the full Room shape — see that function's own
 * docs for why. */
export function StageBadge({ room }: { room: Pick<Room, "workflow_stage" | "batch"> }) {
  const category = roomCategory(room);
  const style = PLAN_CATEGORY_STYLES[category];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide ${style.chipClass}`}
    >
      {style.label}
    </span>
  );
}

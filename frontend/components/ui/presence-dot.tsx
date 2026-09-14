import { PRESENCE_META, type PresenceStatus } from "@/lib/presence";
import { cn } from "@/lib/utils";

/** Green/red/grey working/idle/offline indicator — see lib/presence.ts for
 * how the status is derived. The tooltip/aria-label carries the same
 * meaning as the color so this isn't color-only information. */
export function PresenceDot({
  status,
  className,
}: {
  status: PresenceStatus;
  className?: string;
}) {
  const meta = PRESENCE_META[status];
  return (
    <span
      role="img"
      aria-label={meta.label}
      title={meta.label}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", meta.dotClassName, className)}
    />
  );
}

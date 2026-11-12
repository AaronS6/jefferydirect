// Empty states — one short line plus one next action.
// `description` is kept as a prop so call sites compile but is not rendered.

import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description: _description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  /** Not rendered (copy diet). */
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed bg-surface-sunken/60 px-6 py-14 text-center">
      <div className="flex size-11 items-center justify-center rounded-full border bg-card shadow-xs">
        <Icon className="size-4.5 text-muted-foreground" aria-hidden />
      </div>
      <p className="font-display mt-4 text-balance text-title font-normal text-foreground">{title}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

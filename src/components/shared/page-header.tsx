// Page header — display-font title, optional back link, actions.
// `description` and `eyebrow` props are kept so call sites compile but are
// not rendered: the copy diet removes explanatory sentences under titles.

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description: _description,
  eyebrow: _eyebrow,
  onBack,
  actions,
  className,
}: {
  title: React.ReactNode;
  /** Not rendered (copy diet). */
  description?: React.ReactNode;
  /** Not rendered (copy diet). */
  eyebrow?: React.ReactNode;
  onBack?: (() => void) | null;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {onBack && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2 mb-1 h-7 gap-1 px-2 text-body-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back
        </Button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="font-display min-w-0 text-balance text-heading font-normal text-foreground">{title}</h1>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

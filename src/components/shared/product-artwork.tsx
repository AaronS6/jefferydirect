// Product artwork — professional, clearly-labelled EXAMPLE artwork.
// Flat illustration per packaging family on a kraft-tinted tile: a soft
// ground shadow, one filled accent plane (the "print") and a floor line so
// the catalogue feels physical.

import { cn } from "@/lib/utils";

// One filled plane per family — the "print" on the carton.
const ACCENT: Record<string, string> = {
  carton: "M38 38 L60 30 L82 38 L60 46 Z",
  pizza: "M32 30 L60 24 L88 30 L60 30 Z",
  bag: "M44 32 L76 32 L78 46 L42 46 Z",
  soup: "M42 42 L78 42 L78 48 L42 48 Z",
  wrap: "M38 48 Q60 42 82 50 L82 54 L38 54 Z",
  clamshell: "M38 48 L60 34 L82 48 L60 48 Z",
  cup: "M46 34 L74 34 L74 40 L46 40 Z",
  deli: "M40 44 L80 44 L80 50 L40 50 Z",
  bowl: "M38 46 L82 46 L82 52 L38 52 Z",
  custom: "M38 36 L60 28 L82 36 L60 44 Z",
};

function kindForSku(sku: string): string {
  if (sku.startsWith("JG-CB")) return "carton";
  if (sku.startsWith("JG-PZ")) return "pizza";
  if (sku.startsWith("JG-PET")) return sku.includes("CLAM") ? "clamshell" : "cup";
  if (sku.startsWith("JG-PP")) return sku.includes("BW") ? "bowl" : "deli";
  if (sku.startsWith("JG-CP")) return "custom";
  if (sku.startsWith("JG-FP")) {
    if (sku.includes("KB")) return "bag";
    if (sku.includes("SC")) return "soup";
    return "wrap";
  }
  return "carton";
}

function Art({ kind }: { kind: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  const accent = ACCENT[kind] ?? ACCENT.carton;
  return (
    <svg viewBox="0 0 120 90" className="size-full" aria-hidden>
      {/* soft ground shadow — two layers for depth */}
      <ellipse cx="60" cy="75" rx="32" ry="4.5" fill="currentColor" opacity="0.05" />
      <ellipse cx="60" cy="74" rx="24" ry="3.5" fill="currentColor" opacity="0.08" />
      {/* floor line */}
      <line x1="26" y1="74" x2="94" y2="74" stroke="currentColor" strokeWidth="1" opacity="0.14" />
      <g {...common}>
        {kind === "carton" && (
          <>
            <path d="M38 38 L60 30 L82 38 L82 64 L60 72 L38 64 Z" />
            <path d="M38 38 L60 46 L82 38" />
            <path d="M60 46 L60 72" />
            <path d="M60 30 L60 24 L66 28 L66 34" />
            <path d="M42 44 L57 50 M63 50 L78 44" opacity="0.45" />
          </>
        )}
        {kind === "pizza" && (
          <>
            <path d="M32 62 L32 30 L88 30 L88 62 Z" />
            <path d="M32 30 L60 24 L88 30" />
            <path d="M46 44 Q60 38 74 44" />
            <path d="M50 52 Q60 48 70 52" />
            <path d="M36 34 L38 58 M84 34 L82 58" opacity="0.45" />
          </>
        )}
        {kind === "bag" && (
          <>
            <path d="M44 32 L76 32 L78 72 L42 72 Z" />
            <path d="M52 32 C52 24 68 24 68 32" />
            <path d="M56 32 C56 27 64 27 64 32" />
            <path d="M47 54 L73 54 M47 63 L73 63" opacity="0.45" />
          </>
        )}
        {kind === "soup" && (
          <>
            <path d="M42 42 L78 42 L74 68 L46 68 Z" />
            <ellipse cx="60" cy="42" rx="18" ry="4.5" />
            <path d="M60 37 L60 42" />
            <path d="M48 52 L49 60 M72 52 L71 60" opacity="0.45" />
          </>
        )}
        {kind === "wrap" && (
          <>
            <path d="M30 58 C30 34 90 34 90 58 L90 62 L30 62 Z" />
            <path d="M38 48 Q60 42 82 50" />
            <path d="M86 56 Q94 50 88 44" />
            <path d="M36 54 Q60 48 84 56" opacity="0.45" />
          </>
        )}
        {kind === "clamshell" && (
          <>
            <path d="M38 48 L60 34 L82 48 L82 62 L38 62 Z" />
            <path d="M38 48 L82 48" />
            <path d="M60 34 L60 26" />
            <path d="M44 54 L76 54" opacity="0.45" />
          </>
        )}
        {kind === "cup" && (
          <>
            <path d="M46 34 L74 34 L70 68 L50 68 Z" />
            <path d="M44 34 L76 34" />
            <path d="M46 40 L74 40" />
            <path d="M50 46 L70 46" opacity="0.45" />
          </>
        )}
        {kind === "deli" && (
          <>
            <path d="M40 44 L80 44 L76 66 L44 66 Z" />
            <path d="M38 44 Q60 36 82 44" />
            <path d="M46 52 L74 52" opacity="0.45" />
          </>
        )}
        {kind === "bowl" && (
          <>
            <path d="M38 46 L82 46 L74 70 L46 70 Z" />
            <path d="M36 46 Q60 38 84 46" />
            <path d="M60 38 L60 32" />
            <path d="M48 56 L72 56" opacity="0.45" />
          </>
        )}
        {kind === "custom" && (
          <>
            <path d="M38 36 L60 28 L82 36 L82 64 L60 72 L38 64 Z" />
            <path d="M38 36 L60 44 L82 36" />
            <path d="M60 44 L60 72" />
            <path d="M48 52 h10 M52 56 c4 2 8 0 10 -2" />
          </>
        )}
      </g>
      <path d={accent} fill="currentColor" opacity="0.2" stroke="none" />
    </svg>
  );
}

export function ProductArtwork({
  sku,
  className,
  compact,
}: {
  sku: string;
  className?: string;
  compact?: boolean;
}) {
  const kind = kindForSku(sku);
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-[10px] bg-kraft-soft text-kraft-ink",
        compact ? "h-16 w-16 p-2.5" : "aspect-[4/3] w-full p-8",
        className,
      )}
    >
      <Art kind={kind} />
      {!compact && (
        <span className="text-micro absolute right-2.5 bottom-2 text-kraft-ink/60">
          Example artwork
        </span>
      )}
    </div>
  );
}

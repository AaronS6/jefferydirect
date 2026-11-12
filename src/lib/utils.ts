import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Tailwind-merge must know that the ClientHub type-scale utilities
// (text-micro … text-display) are FONT-SIZE classes, not colours —
// otherwise cn("text-primary-foreground", "text-body") drops the colour.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "micro",
            "caption",
            "body-sm",
            "body",
            "lead",
            "title",
            "heading",
            "display-sm",
            "display",
            "numeral",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

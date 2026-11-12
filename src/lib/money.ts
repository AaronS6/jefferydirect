// Money is represented as integer cents everywhere. All arithmetic is integer
// arithmetic — never floats. Formatting is centralized here.

import { CURRENCY } from "@/lib/constants";

export function formatCents(cents: number, opts?: { withCurrency?: boolean }): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const grouped = dollars.toLocaleString("en-CA");
  const s = `$${grouped}.${rem.toString().padStart(2, "0")}`;
  return negative ? `-${s}` : s;
}

export function formatCentsWithCode(cents: number): string {
  return `${formatCents(cents)} ${CURRENCY}`;
}

/** Parse a user-entered decimal dollar amount ("1.5", "$1.50", "1,5") into cents. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d*(\.\d{1,2})?$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = parseInt(whole || "0", 10) * 100 + parseInt(frac.padEnd(2, "0") || "0", 10);
  return cents;
}

export function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Line total with integer math. */
export function lineTotalCents(qty: number, unitPriceCents: number): number {
  return qty * unitPriceCents;
}

/** Percentage tax in basis points (500 = 5%). Integer math, round-half-up. */
export function taxFromSubtotalCents(subtotalCents: number, rateBp: number): number {
  return Math.round((subtotalCents * rateBp) / 10_000);
}

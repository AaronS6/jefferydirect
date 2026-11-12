// Formal print-ready quotation document. Rendered in-app for preview and
// printed via window.print() → "Save as PDF" (uses .print-doc CSS scope).

import type { QuotationDetail } from "@/types";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { QUOTE_ITEM_KIND_LABELS } from "@/lib/constants";

export function QuoteDocument({ quote }: { quote: QuotationDetail }) {
  return (
    <div className="print-doc mx-auto max-w-[720px] bg-white px-8 py-10 text-[13px] leading-relaxed text-slate-800 sm:px-10">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="size-5 text-slate-900" fill="currentColor" aria-hidden>
              <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Zm9-2.9L5.6 8.2 12 11.4l6.4-3.2L12 4.6Z" />
            </svg>
            <div>
              <p className="font-display text-[18px] font-normal tracking-tight text-slate-900">Jeffery Group Ltd.</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Packaging Manufacturing &amp; Supply</p>
            </div>
          </div>
          <p className="mt-3 text-[11.5px] leading-5 text-slate-500">
            40 Concession Road, Hamilton, ON L8V 1B4
            <br />
            orders@jefferygroup.com · (905) 555-0100
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Quotation</p>
          <p className="font-display tnum text-[21px] font-normal tracking-tight text-slate-900">{quote.quoteNumber}</p>
          <p className="mt-1 text-[11.5px] text-slate-500">
            Issued {formatDate(quote.issuedAt)}
            <br />
            {quote.expiryDate ? <>Valid until {formatDate(quote.expiryDate)}</> : "Expiry on acceptance"}
          </p>
          {quote.revision > 0 && (
            <p className="mt-1 text-[11.5px] text-slate-500">Revision {quote.revision}</p>
          )}
        </div>
      </div>

      {/* Parties */}
      <div className="grid grid-cols-2 gap-6 border-b border-slate-200 py-5">
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-400">Prepared for</p>
          <p className="mt-1.5 font-medium text-slate-900">{quote.orgName}</p>
          <p className="text-[12px] text-slate-500">
            {quote.destination ?? "—"}
          </p>
          <p className="mt-1 text-[12px] text-slate-500">Attn: {quote.requestedBy}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-400">Subject</p>
          <p className="mt-1.5 font-medium text-slate-900">{quote.title}</p>
          <p className="text-[12px] text-slate-500">
            Requested {formatDate(quote.createdAt)}
            {quote.quantity ? ` · ${quote.quantity}` : ""}
          </p>
        </div>
      </div>

      {/* Items */}
      <table className="mt-5 w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-300 text-[10.5px] uppercase tracking-[0.1em] text-slate-500">
            <th className="w-[46%] py-2 text-left font-medium">Description</th>
            <th className="py-2 text-left font-medium">Type</th>
            <th className="py-2 pl-5 text-right font-medium">Qty</th>
            <th className="py-2 pl-5 whitespace-nowrap text-right font-medium">Unit</th>
            <th className="py-2 pl-5 whitespace-nowrap text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 align-top">
              <td className="py-2.5 pr-2">{item.description}</td>
              <td className="py-2.5 pr-2 text-slate-500">
                {QUOTE_ITEM_KIND_LABELS[item.kind] ?? item.kind}
              </td>
              <td className="tnum py-2.5 pl-5 whitespace-nowrap text-right">{item.qty.toLocaleString()}</td>
              <td className="tnum py-2.5 pl-5 whitespace-nowrap text-right">{formatCents(item.unitPriceCents)}</td>
              <td className="tnum py-2.5 pl-5 whitespace-nowrap text-right font-medium">{formatCents(item.lineTotalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-56">
          <div className="flex justify-between py-1 text-slate-600">
            <span>Subtotal</span>
            <span className="tnum">{formatCents(quote.itemsTotalCents)}</span>
          </div>
          <div className="flex justify-between py-1 text-slate-600">
            <span>Taxes</span>
            <span className="text-slate-400">As applicable at invoice</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-300 pt-2 text-[15px] font-semibold text-slate-900">
            <span>Total (CAD)</span>
            <span className="font-display tnum text-[17px] font-normal">{formatCents(quote.itemsTotalCents)}</span>
          </div>
        </div>
      </div>

      {/* Specifications */}
      {(quote.dimensions || quote.material || quote.colour || quote.printing || quote.specs) && (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-400">Specifications</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1.5 text-[12px]">
            {quote.dimensions && (
              <div className="flex gap-2"><dt className="text-slate-500">Dimensions</dt><dd>{quote.dimensions}</dd></div>
            )}
            {quote.material && (
              <div className="flex gap-2"><dt className="text-slate-500">Material</dt><dd>{quote.material}</dd></div>
            )}
            {quote.colour && (
              <div className="flex gap-2"><dt className="text-slate-500">Colour</dt><dd>{quote.colour}</dd></div>
            )}
            {quote.printing && (
              <div className="flex gap-2"><dt className="text-slate-500">Printing</dt><dd>{quote.printing}</dd></div>
            )}
            {quote.quantity && (
              <div className="flex gap-2"><dt className="text-slate-500">Quantity</dt><dd>{quote.quantity}</dd></div>
            )}
            {quote.neededBy && (
              <div className="flex gap-2"><dt className="text-slate-500">Required by</dt><dd>{quote.neededBy}</dd></div>
            )}
            {quote.specs && (
              <div className="col-span-2 flex gap-2"><dt className="text-slate-500">Notes</dt><dd>{quote.specs}</dd></div>
            )}
          </dl>
        </div>
      )}

      {/* Terms */}
      {quote.terms && (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-400">Terms &amp; conditions</p>
          <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{quote.terms}</p>
        </div>
      )}

      <p className="mt-8 border-t border-slate-200 pt-4 text-[11px] text-slate-400">
        This quotation was generated by ClientHub, the customer portal of Jeffery Group Ltd. Prices are quoted in
        Canadian dollars and are valid until the expiry date shown. Demo document — replace with issued PDF when live.
      </p>
    </div>
  );
}

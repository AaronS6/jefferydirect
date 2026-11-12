# Task 6-a — Customer Portal Frontend (work record)

Task ID: 6-a · Agent: customer-portal-frontend · Date: 2026-11-11

## Scope delivered

All 12 customer-portal view components in `src/components/portal/**`, plus 2 local helper files inside that folder. Nothing outside `src/components/portal/**` was modified. All shared components (PageHeader, EmptyState, StatusBadge family, Money/MoneyWithCode, KpiCard, ProductArtwork, OrderTimeline, QuoteDocument) are consumed as-is; money is integer cents everywhere; no emojis; Lucide icons only; view-router navigation via `useAppStore` (never URL routes).

## Files

| File | Exports | Notes |
|---|---|---|
| `portal-bits.tsx` | ErrorAlert, errorMessage, Mono, ValueOrDash, SectionCard, DetailRow, SummaryItem, QtyStepper, KpiSkeletonRow, RowsSkeleton, Chip | Local building blocks (spec-list rows, stepper, section cards, skeletons, chips) |
| `request-quote-dialog.tsx` | RequestQuoteDialog | Two-section quotation request form; mounted-only-while-open inner form (fresh state + product prefill, no setState-in-effect) |
| `dashboard-view.tsx` | DashboardView | Greeting + quick actions + 4 KpiCards + recent orders (table / mobile cards) + reorder strip + activity rail (xl 2-col) |
| `catalog-view.tsx` | CatalogView | Sticky filter bar (debounced search, category, sort), responsive 1/2/3/4-col grid, "Showing X of Y" count, stretched-link cards |
| `product-detail-view.tsx` | ProductDetailView({productId}) | Artwork + spec table + pricing block (negotiated/list tag) + qty stepper + add-to-order; quote-only amber panel → quotations aux prefill |
| `cart-view.tsx` | CartView | 4-step stepper (Review / Delivery / Reference / Submit); address Select from account; POST /api/customer/orders; Enter-before-final-step behaves as Continue |
| `orders-view.tsx` | OrdersView | Tabs (All/Active/Delivered/Cancelled) client-side filter; table + mobile stacked cards; newest first |
| `order-detail-view.tsx` | OrderDetailView({orderId}) | Summary grid (requested vs confirmed-labelled), items, totals (GST at taxRateBp/100), OrderTimeline, documents chips, reorder flow (AlertDialog → reorder-data → unavailable-items dialog → loadDraft → cart) |
| `quotations-view.tsx` | QuotationsView | List w/ expiry awareness (amber ≤7 days), dialog auto-open on `view.aux` ("new" or product-name prefill) |
| `quote-detail-view.tsx` | QuoteDetailView({quotationId}) | Your-request rail + issued quote (items, total, terms); ISSUED → Accept / Decline(+optional reason) / Request-revision; ACCEPTED → Convert (navigates to order detail); EXPIRED/REJECTED/REVISED notices; Print/Save-PDF dialog rendering QuoteDocument + window.print() |
| `documents-view.tsx` | DocumentsView | Search + category + sort filters; preview dialog; demo download (client-side text Blob, `<name>-demo.txt`); related order/quote deep links |
| `notifications-view.tsx` | NotificationsView | Unread-first grouping, click → POST read + navigate(view, relatedId), mark-all-as-read |
| `support-view.tsx` | SupportView | History list (reply cards) + new-message form (subject/category/order/message); form right on lg, top on mobile |
| `settings-view.tsx` | SettingsView | Tabs: Account (read-only + editable phone), Addresses (edit/add/remove via full-set PUT), Notifications (4 switches), Security (password change) |

## Verification performed

- Live API shapes captured at task start (server was up): dashboard, account, categories, products, orders, order detail, reorder-data, quotations, quote detail, documents, notifications, messages — all field names match `src/types/index.ts` exactly.
- `bunx tsc --noEmit`: **0 errors** in all 14 portal files (remaining project errors are in other agents' admin files / examples / skills — untouched per scope rules).
- `bun run lint`: **0 issues** in portal files (remaining errors are in `admin-products-view.tsx` / `admin-notifications-view.tsx`, other agents' scope).
- Runtime smoke test (dev server booted with my code): `GET /` 200 with full 10s compile, zero compile errors in dev.log; all 10 customer GET endpoints 200 for two orgs (Maple Leaf, Pacific Bakehouse); reorder-data + order/quote detail 200; `POST /notifications/read {}` → 422 as designed (my code always sends `{ids:[id]}` or `{all:true}`, both valid per route).
- NOTE: the shared dev server process died mid-task (port 3000 free, no next process). The Bash tool reaps background children after each command, so a long-lived restart from my side isn't possible; the system supervisor should re-run `bun run dev` as usual. All verification above ran inside single commands while a detached instance was alive.

## Contract accommodations (frontend agents — read this)

1. **notifyPrefs keys**: actual API returns `orderUpdates / quoteUpdates / documents / messages` (the task brief guessed `emailDigest` — not present). Settings renders the four real keys.
2. **requestedDelivery is free text** (max 200, seed uses "Before month end"), NOT a date — cart Step 2 uses a text input labelled "Requested delivery (we'll confirm)" instead of `type=date`.
3. **Quotation `category` is a NAME string** (seed shows "Pizza Boxes"), so the request dialog's Select stores category names, not ids.
4. **Notification `view` keys**: seeded notifications use list keys ("orders"/"quotations"/"documents"); runtime-created ones use detail keys ("order-detail"/"quote-detail" + relatedId). My notifications view casts to `ViewName` and navigates with `{id: relatedId}` when present — both shapes work.
5. **Cart notes merge**: backend has a single `notes` field; Step 2 "Order notes" and Step 3 "Special instructions" are combined with prefixes ("Order notes: …\n\nSpecial instructions: …") so both survive in order detail.
6. **Quote respond only while ISSUED** (backend guard) — decision actions render only on ISSUED; REVISED shows an explanatory notice (a revision was recorded / re-issue pending).
7. **Dashboard reorder strip**: spec's preferred "call reorder-data per card" isn't possible without an order id (`frequentlyOrdered` gives lastOrderNumber only), so per the brief's pragmatic guidance the cards deep-link to the last order's detail (orders list fetched in parallel), where the canonical Reorder flow lives.
8. **Addresses PUT is a full-set replace** (ids regenerate on save) — edit keeps existing ids (preserves default selection), add appends without id; account query invalidated after every save. Remove included via confirm (backend permits a 0..12 address set).
9. Documents download is a clearly-labelled demo text file (`-demo.txt`) per spec; previews show real metadata.

## Simplifications (explicit)

- Catalog "Showing X of Y": Y comes from a parallel unfiltered query (small extra request, honest count).
- Order-detail item names deep-link to product pages only when `productId` is present (converted quotes have `QUOTE`/null).
- Print dialog prints via `window.print()` relying on the existing `.print-doc` print-isolation CSS; no separate print route.
- No framer-motion usage (not required); interactions are hover/focus/border transitions only.
- Settings does not refresh the session store's cached user phone after PUT (GET account is invalidated; cosmetic only).

## For later agents

- Reusable bits live in `src/components/portal/portal-bits.tsx` (SectionCard, DetailRow, SummaryItem, QtyStepper, ErrorAlert, skeletons) — import relatively if you build adjacent views.
- The request-quote dialog is auto-opened via `navigate("quotations", {aux})`: `aux === "new"` opens empty; any other non-empty aux is treated as the product-name prefill (used by product-detail's "Request a quote" button).
- Shared query keys used: `["customer-dashboard"]`, `["orders"]`, `["orders","detail",id]`, `["quotations"]`, `["quotations","detail",id]`, `["products","list",{params}]`, `["products","detail",id]`, `["categories"]`, `["documents",{params}]`, `["notifications"]`/`["notifications","customer"]`, `["messages"]`, `["customer-account"]` — invalidate these after your mutations.

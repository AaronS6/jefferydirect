# Task 4 — Backend API (work record)

Task ID: 4 · Agent: backend · Date: 2026-11-11

## Scope delivered

All ClientHub API route handlers under `src/app/api/**`, plus two shared server helpers. Every handler is wrapped in `handler()` (ApiError → clean JSON envelope). Money is integer cents only; tax is `Math.round(subtotal * 500 / 10000)`.

## Files created

### Shared helpers (src/lib/server/)
- `service.ts` — number sequences (`ORD-2024-<seq>`, `Q-2024-<seq>`, `JG-C1<3digit>` org codes, prefix-scoped max+1), `notifyCustomer` / `notifyAdmin`, `audit`, `tempPassword` (`Jeffery-<6>`), effective-price resolution (`CustomerPrice` → `Product.defaultPriceCents` → QUOTE_REQUIRED), `customerPriceMap`, `approvedProductIds`, `queryParam`, `optionalStr`, `optionalDate`, `parseProductInput` (create/update validation), status-set guards, `auditActionLabel`.
- `serialize.ts` — DTO mappers matching `src/types/index.ts` exactly: `serializeSession` (notifyPrefs parsed from JSON string), category, product list/detail, order list/detail (itemSummary "3 products · 2,400 units", totalUnits Σqty, history asc, documents desc), quotation list/detail, document, notification, message. Dates → ISO strings, nulls preserved.

### Auth (3)
`auth/login` (POST), `auth/logout` (POST), `auth/me` (GET).
Login: verifyPassword, rejects DISABLED users (403) and customers of SUSPENDED orgs (403), `startSession(userId, remember)`, updates `lastLoginAt`, promotes INVITED→ACTIVE on first sign-in, returns exact SessionInfo.

### Customer (17 files)
dashboard, categories, products (+[id]), orders (GET + POST submit), orders/[id], orders/[id]/reorder-data, quotations (GET + POST request), quotations/[id], quotations/[id]/respond, quotations/[id]/convert, documents, notifications, notifications/read, messages (GET + POST), account (GET + PUT), account/password (PUT).

Every customer query is scoped `orgId: user.orgId`; foreign records 404; address/order/quote references verified for ownership before attach.

Order submit validations (422 + per-product messages): approved access + isActive, qty ≥ minOrderQty, qty % increment === 0, effective price exists (quote-required rejected). Totals: integer subtotal, 500 bp tax. Creates SUBMITTED order + history (byName = customer name) + ADMIN notif "New order request <ord#>" + customer notif "We received your order request <ord#>".

Quote respond: only when ISSUED → ACCEPTED/REJECTED/REVISED (+respondedAt/respondedNote, ADMIN notified). Convert: only when ACCEPTED → SUBMITTED order (PRODUCT items at quoted price w/ best-effort catalog match for productId/sku; SETUP/FREIGHT/OTHER collapsed into one "Other charges" line, sku `QUOTE`, note lists components; shippingText from destination; notes "Converted from quotation <q#>") + notifications both sides.

### Admin (26 files)
overview, orders, orders/[id], orders/[id]/status, quotations, quotations/[id], quotations/[id]/issue, quotations/[id]/acknowledge, customers (GET+POST create), customers/[id] (GET+PUT), customers/[id]/users (POST invite), customers/[id]/users/[userId] (PUT status), products (GET+POST), products/[id] (PUT), products/[id]/archive, products/access, pricing (GET+POST), documents (GET+POST), documents/[id] (DELETE), notifications (GET+POST send), notifications/read, messages, messages/[id]/reply, users (GET+POST), users/[userId] (PUT), settings (GET), settings/categories (POST).

Order status update: valid ORDER_STATUSES + CANCELLED/REJECTED; history byName "<Admin> (Jeffery Group)"; trackingNumber/estimatedDelivery updated when provided (null clears); org notified (view "order-detail", relatedId); AuditLog ORDER_STATUS_CHANGED. Quote issue: replaces items, itemsTotalCents = Σ qty×unitPrice, status ISSUED (+revision++ when re-issued after ISSUED/EXPIRED/REVISED), expiry/terms/internalNote, org notified, QUOTATION_ISSUED audit. Customer create: unique `JG-C1xxx`, INVITED user + one-time temp password returned, CUSTOMER_CREATED audit. Pricing: upsert / delete on null (falls back to default), PRICE_UPDATED audit. Documents: category/ownership validated, DOCUMENT_UPLOADED/DELETED audits, org notified "New document added". Announcements: orgId null → all ACTIVE orgs. Audit entries for: customer created, user invited (customer + internal), price updated, order status changed, quote issued, document uploaded/deleted, product created/archived/restored, category created.

Admin overview: ordersByWeek = last 8 Monday-start weeks, "requests" = orders submitted that week, "orders" = CONFIRMED history events that week (label "MMM d"); pendingTasks = SUBMITTED/UNDER_REVIEW/AWAITING_CONFIRMATION orders + REQUESTED/UNDER_REVIEW quotes (view "admin-order-detail"/"admin-quote-detail"); activity = latest ADMIN notifications + audit logs merged, cap 12; outstandingInvoiceCents = Σ totalCents of DELIVERED orders; KPIs as contract.

## Deviations & judgment calls (frontend agents — read this)
1. **auth.ts hotfix**: `src/lib/server/auth.ts` used `ROLE_CUSTOMER` without importing it → every session-gated endpoint 500'd. Added `ROLE_CUSTOMER` to the constants import (behavior unchanged). This was outside my file scope but blocked the whole backend.
2. **Quote re-issue semantics**: issuing always ends in status **ISSUED** (revision++ when re-issuing after ISSUED/EXPIRED/REVISED). The contract's "or REVISED + revision++ when re-issued after an ISSUED/EXPIRED one" read literally would strand quotes in REVISED, which respond() rejects (respond requires ISSUED) — the loop would dead-end. This keeps request → issue → REVISION → re-issue(rev1) → accept → convert fully navigable.
3. **Notification view keys** (click-through targets): customer "order-detail" / "quote-detail" / "documents" / "messages" (+relatedId); admin "admin-order-detail" / "admin-quote-detail" / "admin-messages" (+relatedId). Seed data used "orders"/"quotations"/"admin-orders"/"admin-quotes" — if the frontend router only knows those list keys, map accordingly or fall back gracefully.
4. Convert: quote PRODUCT items get a real productId/sku when the description leads with/contains a catalogue product name (e.g. "PET Cold Cup 20 oz — volume tier" → JG-PET-CT20); otherwise sku "QUOTE", productId null.
5. Account PUT `addresses` = full replace of the org's address set (ids may change; prior default preserved by id match, else first becomes default). Phone + notifyPrefs partial.
6. Extra response fields (harmless): quote request returns {id, quoteNumber}; user invite returns {id, tempPassword}; convert returns {orderId, orderNumber}.
7. `outstandingInvoiceCents` = Σ totalCents of DELIVERED orders (task's sanctioned simplification; frontend labels "invoiced volume (delivered)").
8. Logout returns `{}` (contract); sessions are stateless signed tokens — `endSession` clears the cookie, the token itself stays valid until expiry by design (foundation's auth.ts).
9. Login also rejects INVITED? No — INVITED users may sign in with their temp password and are auto-activated; DISABLED users and customers of SUSPENDED orgs are rejected (403).
10. Message rows carry `orderId` without a Prisma relation — orderNumber is resolved per-request via a scoped lookup (2 fetches), not `include`.

## Verification
- `bun run lint` — clean. `bunx tsc --noEmit` — zero errors in api/server files.
- Full curl smoke: all required GETs 200 (login/me/overview/customers; customer dashboard/products/orders/quotations). Mutation flow tested end-to-end: order submit (ORD-2024-0110, 3000×$0.44 → $1,386.00 incl. 5% GST), MOQ/increment/quote-required 422 rejections, quote create → issue → REVISION → re-issue(rev1) → ACCEPT → convert (Other charges aggregation verified), status update (history "Morgan Chen (Jeffery Group)", org notif), acknowledge, pricing set/clear/fallback-restore, document upload/delete, message + reply, announcements (org + all), notification reads (ids/all), account PUT (phone/prefs/addresses), password change + revert, customer create (JG-C1004 + temp password login), user invite/disable, org suspend → 403 login, product create/update/archive/restore/access, category create, security: customer→admin 403, cross-org read 404, unauthed 401, logout → me 401.
- All smoke data cleaned; DB verified back to seeded state (8 notifications with original isRead flags, 9 orders, 5 quotes, 6 categories, original address ids restored, Maria prefs/password restored).

## Notes for frontend
- GET lists return bare arrays (no `{data}` wrapper); errors are `{"error": "message"}` with 401/403/404/422/500.
- `priceSource` "QUOTE_REQUIRED" ⇒ priceCents null — product cannot be ordered (422 on submit with a clear message).
- Admin notifications/messages/orders lists include orgName/orgCode where the DTO allows.

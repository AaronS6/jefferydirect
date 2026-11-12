# ClientHub — Implementation Contract (for all subagents)

You are building part of **ClientHub**, a premium B2B customer portal for **Jeffery Group Ltd.** (packaging manufacturer). The app is a single-route SPA at `/` with a client-side view router. The foundation is already built:

## Read these files FIRST (they are the contract)
- `src/types/index.ts` — ALL DTO shapes (backend must return exactly these; frontend consumes these)
- `src/lib/constants.ts` — status enums, labels, workflow
- `src/lib/money.ts` — `formatCents`, `parseDollarsToCents`, `centsToInputValue`, `taxFromSubtotalCents`
- `src/lib/date.ts` — `formatDate`, `formatDateTime`, `timeAgo`, `greetingForNow`
- `src/lib/api-client.ts` — `api.get/post/put/del` (throws Error with `.message`)
- `src/store/app-store.ts` — `useAppStore` (session, `navigate(viewName, {id, aux})`, `back()`, `view`), `useCartStore` (lines, addLine, setQty, removeLine, clear, loadDraft)
- `prisma/schema.prisma` — the database schema (SQLite, Prisma; money = integer cents)

## Shared components ALREADY EXIST — use them, do not recreate
- `@/components/shared/page-header` → `<PageHeader title description eyebrow? onBack? actions?>`
- `@/components/shared/status-badge` → `<StatusBadge status kind="order|quote|org|user|stock">`, `<OrgStatusBadge>`, `<UserStatusBadge>`, `<StockBadge>`, `<DocumentCategoryBadge>`
- `@/components/shared/money` → `<Money cents muted?>`, `<MoneyWithCode cents>`
- `@/components/shared/empty-state` → `<EmptyState icon={Icon} title description action?>`
- `@/components/shared/kpi-card` → `<KpiCard icon label value hint onClick?>`
- `@/components/shared/product-artwork` → `<ProductArtwork sku compact?>`
- `@/components/shared/order-timeline` → `<OrderTimeline status history>`
- `@/components/shared/quote-document` → `<QuoteDocument quote>` (print-ready; call `window.print()` to export)
- Full shadcn/ui set in `src/components/ui` (New York style) — Button, Card, Table, Tabs, Dialog, Select, Input, Textarea, Label, Badge, Dropdown, Sheet, Skeleton, etc.
- Toasts: `import { toast } from "@/hooks/use-toast"` → `toast({ title, description })`

## Hard rules
- TypeScript strict; no `any` where avoidable; ESLint must pass (`bun run lint`)
- **No emojis.** Lucide icons only (`lucide-react`)
- Money: **integer cents everywhere**; display via `Money`/`formatCents` — never floats
- Dark mode is NOT used (light premium theme only)
- No new pages/routes: everything renders inside the existing view-router components
- Next.js 16 + React 19: route handler `params` is a Promise (`const { id } = await params`), `cookies()` is async
- The dev server runs on port 3000 and auto-reloads. NEVER run `bun run build` or `bun run dev`
- Do NOT modify files outside your assigned scope (listed in your task prompt). If something in another file blocks you, adapt your own code instead

## API endpoints (backend implements; frontend consumes)
All under `/api`. Sessions via httpOnly cookie — `getSessionUser()` in `@/lib/server/auth`. Guards: `requireCustomer()` / `requireAdmin()` in `@/lib/server/api` (throws ApiError → handled JSON). Customer endpoints MUST scope every query to `user.orgId` — never trust client-provided orgIds.

### Auth
- `POST /api/auth/login` {email, password, remember} → SessionInfo (+ set session cookie; update lastLoginAt)
- `POST /api/auth/logout` → {}
- `GET /api/auth/me` → SessionInfo (401 when signed out)

### Customer portal (requires CUSTOMER role)
- `GET /api/customer/dashboard` → CustomerDashboard
- `GET /api/customer/categories` → CategoryDto[]
- `GET /api/customer/products?search=&category=<categoryId>&sort=(name|sku|price_asc|price_desc|newest)` → ProductListItem[] (only approved+active for their org; price = CustomerPrice ?? Product.defaultPriceCents, else null & priceSource "QUOTE_REQUIRED")
- `GET /api/customer/products/:id` → ProductDetail (404 if not approved for org)
- `GET /api/customer/orders?status=` → OrderListItem[]
- `GET /api/customer/orders/:id` → OrderDetail (404 if other org's order)
- `POST /api/customer/orders` {items:[{productId, qty}], addressId?, poNumber?, notes?, requestedDelivery?} → {id, orderNumber}; validates approved access, effective price exists (reject quote-only), qty >= minOrderQty & multiple of increment; totals = integer math with taxRateBp 500; creates Order (status SUBMITTED) + history entry + ADMIN notification "New order request <ord#>" + CUSTOMER notification "We received your order request <ord#>"
- `GET /api/customer/orders/:id/reorder-data` → ReorderDraft (current effective prices; `unavailable: true` when product inactive/not approved)
- `GET /api/customer/quotations` → QuotationListItem[]
- `POST /api/customer/quotations` {title, category?, productName?, dimensions?, material?, colour?, printing?, quantity?, neededBy?, destination?, specs?, comments?} → {id} + ADMIN notification "New quotation request <quote#>" + customer notification
- `GET /api/customer/quotations/:id` → QuotationDetail
- `POST /api/customer/quotations/:id/respond` {action: ACCEPT|REJECT|REVISION, comment?} → {ok} (only when ISSUED; sets status respondedAt respondedNote + ADMIN notification)
- `POST /api/customer/quotations/:id/convert` (only when ACCEPTED) → {orderId, orderNumber}; creates a SUBMITTED order from quote items (PRODUCT → items at quoted unit price; SETUP/FREIGHT/OTHER → single "Other charges" lines, sku `QUOTE`, productId null; shippingText from quote.destination; notes "Converted from quotation <quote#>") + notifications both sides
- `GET /api/customer/documents?category=&search=` → DocumentDto[]
- `GET /api/customer/notifications` → NotificationDto[] (audience CUSTOMER, their org, newest first)
- `POST /api/customer/notifications/read` {ids?: string[], all?: boolean} → {ok}
- `GET /api/customer/messages` → MessageDto[]
- `POST /api/customer/messages` {subject, category, orderId?, quotationId?, body} → {id} + ADMIN notification
- `GET /api/customer/account` → {organization (no internalNotes), addresses, notifyPrefs, user}
- `PUT /api/customer/account` {phone?, notifyPrefs?, addresses?:[{id,label,line1,line2,city,province,postal}]} → {ok} (shipping addresses & phone & prefs only — billing fields are admin-managed)
- `PUT /api/customer/account/password` {currentPassword, newPassword} → {ok} (verify hash; min 8 chars)

### Admin portal (requires ADMIN role)
- `GET /api/admin/overview` → AdminDashboard (ordersByWeek = real counts from orders in the last 8 weeks; pendingTasks from SUBMITTED/UNDER_REVIEW orders + REQUESTED quotes; activity from latest notifications + audit logs)
- `GET /api/admin/orders?status=&search=&orgId=` → OrderListItem[] (with orgName/orgCode)
- `GET /api/admin/orders/:id` → OrderDetail
- `POST /api/admin/orders/:id/status` {status, note?, trackingNumber?, estimatedDelivery?} → {ok} (valid ORDER_STATUSES + CANCELLED/REJECTED; appends history byName "<admin> (Jeffery Group)"; updates order fields; notify customer org)
- `GET /api/admin/quotations?status=&search=` → QuotationListItem[] (with orgName)
- `GET /api/admin/quotations/:id` → QuotationDetail
- `POST /api/admin/quotations/:id/issue` {items:[{description, kind, qty, unitPriceCents}], expiryDate?, terms?, internalNote?} → {ok} (replaces items; itemsTotalCents; status ISSUED, or REVISED + revision++ when re-issued after an ISSUED/EXPIRED one; notify org)
- `POST /api/admin/quotations/:id/acknowledge` {status: UNDER_REVIEW} → {ok} + notify org (optional helper)
- `GET /api/admin/customers?search=` → CustomerListItem[]
- `POST /api/admin/customers` {name, contactName, contactEmail, contactTitle?, phone?, billingLine1?, billingCity?, billingProvince?, billingPostal?} → {id, code, tempPassword} (org + INVITED user; unique code JG-C1xxx; audit log)
- `GET /api/admin/customers/:id` → CustomerProfile (includes internalNotes)
- `PUT /api/admin/customers/:id` {name?, status?, billingLine1?, billingCity?, billingProvince?, billingPostal?, phone?, internalNotes?} → {ok} + audit log
- `POST /api/admin/customers/:id/users` {email, name, title?, phone?} → {tempPassword} (INVITED user; audit log)
- `PUT /api/admin/customers/:id/users/:userId` {status: ACTIVE|DISABLED} → {ok}
- `GET /api/admin/products?search=&category=` → AdminProduct[]
- `POST /api/admin/products` {sku, name, categoryId, shortDescription, description, material?, dimensions?, colour?, printingOptions?, casePack, palletPack?, minOrderQty, increment, unit?, defaultPriceCents?, stockStatus, leadTimeNote?} → {id} + audit
- `PUT /api/admin/products/:id` (same fields, partial) → {ok} + audit
- `POST /api/admin/products/:id/archive` {archive: boolean} → {ok}
- `POST /api/admin/products/access` {orgId, productId, approved} → {ok} (upsert ProductAccess) + audit
- `GET /api/admin/pricing?orgId=` → PricingRow[] (all active products w/ approved flag for org + custom price)
- `POST /api/admin/pricing` {orgId, productId, priceCents: number|null, note?} → {ok} (null removes custom price → falls back to default) + audit
- `GET /api/admin/documents?orgId=&category=&search=` → DocumentDto[] (with orgName)
- `POST /api/admin/documents` {orgId, category, title, description?, fileName, sizeLabel, orderId?, quotationId?} → {id} + notify org "New document added"
- `DELETE /api/admin/documents/:id` → {ok} + audit
- `GET /api/admin/notifications` → NotificationDto[] (audience ADMIN)
- `POST /api/admin/notifications/read` {ids?, all?} → {ok}
- `POST /api/admin/notifications` {orgId: string|null, title, body, kind} → {ok} (orgId null → all ACTIVE orgs; audience CUSTOMER)
- `GET /api/admin/messages?status=` → MessageDto[] (with orgName)
- `POST /api/admin/messages/:id/reply` {reply} → {ok} (status ANSWERED, repliedBy admin name; notify org)
- `GET /api/admin/users` → InternalUser[]
- `POST /api/admin/users` {email, name, role: ADMIN, title?} → {tempPassword} + audit
- `PUT /api/admin/users/:userId` {status} → {ok}
- `GET /api/admin/settings` → {categories: CategoryDto[]}
- `POST /api/admin/settings/categories` {name, description?} → {id} + audit

## Design language (frontend agents)
- Restrained navy accent (`bg-primary`, `text-primary` tokens) on near-white canvas; generous whitespace; text hierarchy: page title 22–26px semibold; section headings 15–16px medium; body 13–13.5px; muted hints 12px
- Cards: `rounded-lg border bg-card` + tiny shadow `[0_1px_2px_rgb(0_0_0_/_0.04)]` only where helpful; consistent `p-4 sm:p-5`
- Tables: shadcn Table with `text-[13px]`, header `text-[11px] uppercase tracking-wide text-muted-foreground`, row hover `hover:bg-muted/40`, generous `px-3 py-2.5`; on mobile collapse to stacked cards (see responsive rules below)
- Long lists: `max-h-96 overflow-y-auto` where appropriate
- Loading: shadcn Skeleton patterns; empty: EmptyState; errors: inline alert + toast
- Buttons: default (navy) for primary; outline/secondary for secondary; ghost for tertiary; destructive w/ AlertDialog confirm for destructive actions
- Status pills via StatusBadge; money right-aligned with `Money`/`MoneyWithCode` (tabular numerals)
- Responsive: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` for card grids; tables get a hidden-on-mobile card layout (`hidden md:table` + `md:hidden` stacked) or horizontal scroll with `min-w-[720px]`
- All interactive elements keyboard accessible (real buttons/inputs); aria-labels on icon buttons
- Framer-motion available but keep animation subtle & fast (fade/slide 150–200ms); hover states on all clickable rows/cards

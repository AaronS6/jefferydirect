"use client";

// Global search — Cmd/Ctrl+K palette. Admin searches orders, quotes,
// customers, products, users, messages and pending change requests.
// Customer searches their orders, quotes and the catalogue. Recent
// selections (stored per audience) show before typing.

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  FileText,
  MessageSquare,
  Package,
  ReceiptText,
  RefreshCcw,
  Search,
  Users,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { api } from "@/lib/api-client";
import { useAppStore, type ViewName } from "@/store/app-store";
import type { OrderListItem, ProductListItem, QuotationListItem, SearchResultsDto } from "@/types";
import { QUOTE_STATUS_LABELS } from "@/lib/constants";

const EMPTY: SearchResultsDto = {
  orders: [],
  quotes: [],
  customers: [],
  products: [],
  users: [],
  messages: [],
  changeRequests: [],
};

type RecentEntry = { label: string; view: ViewName; id?: string };

const RECENT_LIMIT = 5;

function loadRecents(audience: string): RecentEntry[] {
  try {
    const raw = localStorage.getItem(`clienthub-search-recent-${audience}`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentEntry[]).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

function saveRecent(audience: string, entry: RecentEntry) {
  try {
    const rest = loadRecents(audience).filter(
      (r) => !(r.view === entry.view && r.id === entry.id && r.label === entry.label),
    );
    localStorage.setItem(
      `clienthub-search-recent-${audience}`,
      JSON.stringify([entry, ...rest].slice(0, RECENT_LIMIT)),
    );
  } catch {
    /* storage unavailable */
  }
}

export function GlobalSearch({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useAppStore((s) => s.navigate);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audience = isAdmin ? "admin" : "customer";

  function openSearch() {
    setRecents(loadRecents(audience));
    setOpen(true);
  }

  // Cmd/Ctrl+K toggles; Esc closes (built into the dialog)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setRecents(loadRecents(audience));
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [audience]);

  // Debounce the query so typing doesn't hammer the API
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(query.trim()), 220);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  // ── Admin: server-side cross-entity search ──────────────────────────────
  const adminQuery = useQuery({
    queryKey: ["admin", "search", debounced],
    queryFn: () => api.get<SearchResultsDto>(`/api/admin/search?q=${encodeURIComponent(debounced)}`),
    enabled: isAdmin && open && debounced.length >= 2,
    staleTime: 10_000,
  });

  // ── Customer: lists fetched on open, filtered client-side ────────────────
  const ordersQuery = useQuery({
    queryKey: ["customer", "orders"],
    queryFn: () => api.get<OrderListItem[]>("/api/customer/orders"),
    enabled: !isAdmin && open,
    staleTime: 30_000,
  });
  const quotesQuery = useQuery({
    queryKey: ["customer", "quotations"],
    queryFn: () => api.get<QuotationListItem[]>("/api/customer/quotations"),
    enabled: !isAdmin && open,
    staleTime: 30_000,
  });
  const productsQuery = useQuery({
    queryKey: ["customer", "products", "search", debounced],
    queryFn: () =>
      api.get<ProductListItem[]>(`/api/customer/products?search=${encodeURIComponent(debounced)}`),
    enabled: !isAdmin && open && debounced.length >= 2,
    staleTime: 10_000,
  });

  const ql = debounced.toLowerCase();

  function go(entry: RecentEntry) {
    setOpen(false);
    setQuery("");
    setDebounced("");
    saveRecent(audience, entry);
    navigate(entry.view, entry.id ? { id: entry.id } : undefined);
  }

  const adminResults = isAdmin && debounced.length >= 2 ? (adminQuery.data ?? EMPTY) : EMPTY;
  const adminTotal =
    adminResults.orders.length +
    adminResults.quotes.length +
    adminResults.customers.length +
    adminResults.products.length +
    adminResults.users.length +
    adminResults.messages.length +
    adminResults.changeRequests.length;

  const customerOrders =
    !isAdmin && debounced.length >= 1
      ? (ordersQuery.data ?? []).filter((o) => o.orderNumber.toLowerCase().includes(ql)).slice(0, 6)
      : [];
  const customerQuotes =
    !isAdmin && debounced.length >= 1
      ? (quotesQuery.data ?? [])
          .filter(
            (q) => q.quoteNumber.toLowerCase().includes(ql) || q.title.toLowerCase().includes(ql),
          )
          .slice(0, 6)
      : [];
  const customerProducts =
    !isAdmin && debounced.length >= 2 ? (productsQuery.data ?? []).slice(0, 6) : [];

  const customerTotal = customerOrders.length + customerQuotes.length + customerProducts.length;
  const nothingTyped = debounced.length < 2 || (!isAdmin && debounced.length < 1);
  const hasRecents = recents.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={openSearch}
        className="hidden h-9 w-[220px] items-center gap-2.5 rounded-lg border border-input bg-card px-3.5 text-body-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent/60 hover:text-foreground md:flex lg:w-[280px] xl:w-[320px]"
        aria-label="Search"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">Search</span>
        <kbd className="pointer-events-none hidden shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-caption font-medium text-muted-foreground xl:inline-flex">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        onClick={openSearch}
        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground md:hidden"
        aria-label="Search"
      >
        <Search className="size-4.5" aria-hidden />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search ClientHub">
        <CommandInput placeholder="Search" value={query} onValueChange={setQuery} />
        <CommandList>
          {nothingTyped ? (
            hasRecents ? (
              <CommandGroup heading="Recent">
                {recents.map((r) => (
                  <CommandItem
                    key={`${r.view}-${r.id ?? ""}-${r.label}`}
                    value={`recent ${r.label}`}
                    onSelect={() => go(r)}
                  >
                    <Search className="size-4" aria-hidden />
                    <span className="truncate font-medium">{r.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandEmpty>Type to search.</CommandEmpty>
            )
          ) : isAdmin ? (
            adminTotal === 0 && !adminQuery.isFetching ? (
              <CommandEmpty>No results for “{debounced}”.</CommandEmpty>
            ) : (
              <>
                {adminResults.orders.length > 0 && (
                  <CommandGroup heading="Orders">
                    {adminResults.orders.map((o) => (
                      <CommandItem
                        key={`o-${o.id}`}
                        value={`${o.orderNumber} ${o.orgName}`}
                        onSelect={() => go({ label: o.orderNumber, view: "admin-order-detail", id: o.id })}
                      >
                        <ReceiptText className="size-4" aria-hidden />
                        <span className="font-mono text-caption font-medium">{o.orderNumber}</span>
                        <span className="truncate text-muted-foreground">{o.orgName}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {adminResults.quotes.length > 0 && (
                  <CommandGroup heading="Quotes">
                    {adminResults.quotes.map((q) => (
                      <CommandItem
                        key={`q-${q.id}`}
                        value={`${q.quoteNumber} ${q.title} ${q.orgName}`}
                        onSelect={() => go({ label: `${q.quoteNumber} ${q.title}`, view: "admin-quote-detail", id: q.id })}
                      >
                        <FileText className="size-4" aria-hidden />
                        <span className="font-mono text-caption font-medium">{q.quoteNumber}</span>
                        <span className="truncate font-medium">{q.title}</span>
                        <span className="truncate text-muted-foreground">{q.orgName}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {adminResults.customers.length > 0 && (
                  <CommandGroup heading="Customers">
                    {adminResults.customers.map((c) => (
                      <CommandItem
                        key={`cu-${c.id}`}
                        value={`${c.name} ${c.code}`}
                        onSelect={() => go({ label: c.name, view: "admin-customer-detail", id: c.id })}
                      >
                        <Boxes className="size-4" aria-hidden />
                        <span className="font-medium">{c.name}</span>
                        <span className="font-mono text-caption text-muted-foreground">{c.code}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {adminResults.products.length > 0 && (
                  <CommandGroup heading="Products">
                    {adminResults.products.map((p) => (
                      <CommandItem
                        key={`p-${p.id}`}
                        value={`${p.name} ${p.sku}`}
                        onSelect={() => go({ label: p.name, view: "admin-products" })}
                      >
                        <Package className="size-4" aria-hidden />
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="font-mono text-caption text-muted-foreground">{p.sku}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {adminResults.changeRequests.length > 0 && (
                  <CommandGroup heading="Change requests">
                    {adminResults.changeRequests.map((c) => (
                      <CommandItem
                        key={`c-${c.id}`}
                        value={`change ${c.orderNumber} ${c.orgName}`}
                        onSelect={() => go({ label: c.orderNumber, view: "admin-order-detail", id: c.orderId })}
                      >
                        <RefreshCcw className="size-4" aria-hidden />
                        <span className="font-mono text-caption font-medium">{c.orderNumber}</span>
                        <span className="truncate text-muted-foreground">{c.orgName}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {adminResults.users.length > 0 && (
                  <CommandGroup heading="Customer users">
                    {adminResults.users.map((u) => (
                      <CommandItem
                        key={`u-${u.id}`}
                        value={`${u.name} ${u.email}`}
                        onSelect={() =>
                          go(u.orgId
                            ? { label: u.orgName ?? u.name, view: "admin-customer-detail", id: u.orgId }
                            : { label: u.name, view: "admin-users" })
                        }
                      >
                        <Users className="size-4" aria-hidden />
                        <span className="font-medium">{u.name}</span>
                        <span className="truncate text-muted-foreground">{u.email}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {adminResults.messages.length > 0 && (
                  <CommandGroup heading="Messages">
                    {adminResults.messages.map((m) => (
                      <CommandItem
                        key={`m-${m.id}`}
                        value={`${m.subject} ${m.orgName}`}
                        onSelect={() => go({ label: m.subject, view: "admin-notifications" })}
                      >
                        <MessageSquare className="size-4" aria-hidden />
                        <span className="truncate font-medium">{m.subject}</span>
                        <span className="truncate text-muted-foreground">{m.orgName}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {adminTotal === 0 && adminQuery.isFetching && (
                  <>
                    <CommandSeparator />
                    <div className="py-3 text-center text-body-sm text-muted-foreground">Searching</div>
                  </>
                )}
              </>
            )
          ) : customerTotal === 0 ? (
            <CommandEmpty>No results for “{debounced}”.</CommandEmpty>
          ) : (
            <>
              {customerOrders.length > 0 && (
                <CommandGroup heading="Orders">
                  {customerOrders.map((o) => (
                    <CommandItem
                      key={`o-${o.id}`}
                      value={`${o.orderNumber} ${o.itemSummary}`}
                      onSelect={() => go({ label: o.orderNumber, view: "order-detail", id: o.id })}
                    >
                      <ReceiptText className="size-4" aria-hidden />
                      <span className="font-mono text-caption font-medium">{o.orderNumber}</span>
                      <span className="truncate text-muted-foreground">{o.itemSummary}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {customerQuotes.length > 0 && (
                <CommandGroup heading="Quotes">
                  {customerQuotes.map((q) => (
                    <CommandItem
                      key={`q-${q.id}`}
                      value={`${q.quoteNumber} ${q.title}`}
                      onSelect={() => go({ label: `${q.quoteNumber} ${q.title}`, view: "quote-detail", id: q.id })}
                    >
                      <FileText className="size-4" aria-hidden />
                      <span className="font-mono text-caption font-medium">{q.quoteNumber}</span>
                      <span className="truncate font-medium">{q.title}</span>
                      <span className="ml-auto text-caption text-muted-foreground">
                        {QUOTE_STATUS_LABELS[q.status] ?? q.status}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {customerProducts.length > 0 && (
                <CommandGroup heading="Products">
                  {customerProducts.map((p) => (
                    <CommandItem
                      key={`p-${p.id}`}
                      value={`${p.name} ${p.sku}`}
                      onSelect={() => go({ label: p.name, view: "product-detail", id: p.id })}
                    >
                      <Package className="size-4" aria-hidden />
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="font-mono text-caption text-muted-foreground">{p.sku}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

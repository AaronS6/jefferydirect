"use client";

// Application shell — sidebar navigation, top bar with global search, cart,
// notification bell and user menu, responsive mobile drawer, and a sticky
// footer. Kraft & Ink design language.

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CalendarClock,
  ChevronDown,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareText,
  Package,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  ShoppingBag,
  Tag,
  UserCog,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ToastAction } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api-client";
import { useAppStore, useCartStore, type ViewName } from "@/store/app-store";
import type { NotificationDto } from "@/types";
import { timeAgo } from "@/lib/date";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { GlobalSearch } from "@/components/shell/global-search";
import { BrandLockup, BrandMark } from "@/components/shared/brand-mark";
import { Money } from "@/components/shared/money";

type NavItem = {
  label: string;
  view: ViewName;
  icon: typeof Package;
  badge?: "notifications" | "attention";
};

type NavGroup = { label?: string; items: NavItem[] };

const CUSTOMER_NAV: NavGroup[] = [
  {
    items: [
      { label: "Home", view: "dashboard", icon: LayoutDashboard },
      { label: "Products", view: "catalog", icon: Package },
      { label: "Orders", view: "orders", icon: ReceiptText },
      { label: "Quotes", view: "quotations", icon: FileText },
      { label: "Documents", view: "documents", icon: FolderOpen },
      { label: "Messages", view: "support", icon: MessageSquareText },
    ],
  },
];

const ADMIN_NAV: NavGroup[] = [
  {
    label: "Work",
    items: [
      { label: "Overview", view: "admin-overview", icon: LayoutDashboard },
      { label: "Attention", view: "admin-attention", icon: CalendarClock, badge: "attention" },
      { label: "Orders", view: "admin-orders", icon: PackageCheck },
      { label: "Quotes", view: "admin-quotes", icon: FileText },
    ],
  },
  {
    label: "Manage",
    items: [
      { label: "Customers", view: "admin-customers", icon: Users },
      { label: "Products", view: "admin-products", icon: Package },
      { label: "Pricing", view: "admin-pricing", icon: Tag },
      { label: "Documents", view: "admin-documents", icon: FolderOpen },
    ],
  },
  {
    label: "Communicate",
    items: [
      { label: "Notifications", view: "admin-notifications", icon: Megaphone, badge: "notifications" },
      { label: "Templates", view: "admin-templates", icon: MessageSquareText },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Users", view: "admin-users", icon: UserCog },
      { label: "Settings", view: "admin-settings", icon: Settings },
    ],
  },
];

const VIEW_TITLES: Partial<Record<ViewName, string>> = {
  dashboard: "Home",
  catalog: "Products",
  "product-detail": "Product",
  cart: "Cart",
  orders: "Orders",
  "order-detail": "Order",
  quotations: "Quotes",
  "quote-detail": "Quote",
  documents: "Documents",
  notifications: "Notifications",
  support: "Messages",
  settings: "Settings",
  "admin-attention": "Attention",
  "admin-overview": "Overview",
  "admin-orders": "Orders",
  "admin-order-detail": "Order",
  "admin-quotes": "Quotes",
  "admin-quote-detail": "Quote",
  "admin-customers": "Customers",
  "admin-customer-detail": "Customer",
  "admin-products": "Products",
  "admin-pricing": "Pricing",
  "admin-documents": "Documents",
  "admin-notifications": "Notifications",
  "admin-templates": "Update templates",
  "admin-users": "Users",
  "admin-settings": "Settings",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useAppStore((s) => s.session);
  const view = useAppStore((s) => s.view);
  const navigate = useAppStore((s) => s.navigate);
  const setSession = useAppStore((s) => s.setSession);
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Hairline under the top bar appears only once the page scrolls.
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!session) return null;
  const isAdmin = session.user.role === "ADMIN";
  const groups = isAdmin ? ADMIN_NAV : CUSTOMER_NAV;

  async function signOut() {
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* sign out locally regardless */
    }
    // Drop ALL cached data (session + business queries) so nothing from the
    // previous account can leak into the next sign-in.
    queryClient.clear();
    setSession(null);
    useCartStore.getState().clear();
    navigate("dashboard");
  }

  const userMenu = (compact: boolean) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2.5 rounded-lg py-1.5 pl-1.5 pr-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "md:hidden" : "w-full",
          )}
          aria-label="Account menu"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-kraft-soft text-caption font-semibold text-kraft-ink">
            {initials(session.user.name)}
          </span>
          {!compact && (
            <span className="hidden min-w-0 flex-1 sm:block">
              <span className="block truncate text-body-sm font-medium leading-tight text-foreground">
                {session.user.name}
              </span>
              <span className="block truncate text-caption leading-tight text-muted-foreground">
                {isAdmin ? "Jeffery Group" : session.organization?.name ?? "Customer"}
              </span>
            </span>
          )}
          <ChevronDown className={cn("size-3.5 text-muted-foreground", compact && "hidden sm:block")} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} className="w-[240px]">
        <DropdownMenuLabel className="min-w-0">
          <p className="truncate text-caption font-normal text-muted-foreground">
            {isAdmin ? "Jeffery Group Ltd." : session.organization?.name ?? "Customer"}
          </p>
          <p className="truncate text-body-sm font-medium">{session.user.name}</p>
          <p className="truncate text-caption font-normal text-muted-foreground">{session.user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(isAdmin ? "admin-settings" : "settings")}>
          <Settings className="size-4" aria-hidden /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(isAdmin ? "admin-notifications" : "notifications")}>
          <Bell className="size-4" aria-hidden /> Notifications
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="text-[var(--status-danger-fg)] focus:bg-[var(--status-danger-bg)] focus:text-[var(--status-danger-fg)]">
          <LogOut className="size-4" aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const navList = (inSheet: boolean) => (
    <NavList
      groups={groups}
      collapsed={collapsed && !inSheet}
      isAdmin={isAdmin}
      onNavigate={(v) => {
        navigate(v);
        if (inSheet) setMobileOpen(false);
      }}
      markerId={inSheet ? "nav-marker-sheet" : "nav-marker"}
    />
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 md:flex",
            collapsed ? "w-[72px]" : "w-[248px]",
          )}
        >
          <div className={cn("flex h-16 shrink-0 items-center border-b px-4", collapsed ? "justify-center lg:px-0" : "")}>
            {collapsed ? (
              <BrandMark size={26} />
            ) : (
              <BrandLockup markClassName="text-foreground" />
            )}
          </div>
          <nav aria-label={isAdmin ? "Administration navigation" : "Customer portal navigation"} className="flex-1 overflow-y-auto px-2.5 py-3">
            {navList(false)}
          </nav>
          <div className={cn("border-t p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]", collapsed && "lg:px-1.5")}>
            {userMenu(false)}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed((v) => !v)}
              className={cn("mt-1 h-8 w-full justify-start gap-2 text-muted-foreground", collapsed && "lg:justify-center lg:px-0")}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
              {!collapsed && <span className="text-body-sm">Collapse</span>}
            </Button>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-h-screen w-full min-w-0 flex-col">
          <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
            <div
              className={cn(
                "mx-auto flex h-16 max-w-[1360px] items-center gap-2.5 px-4 transition-colors sm:gap-3 sm:px-6 lg:px-10",
                scrolled ? "border-border/70" : "border-transparent",
                "border-b",
              )}
            >
              {/* Mobile nav */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-9 md:hidden" aria-label="Open navigation">
                    <Menu className="size-4.5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[272px] gap-0 bg-sidebar p-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <SheetTitle className="sr-only">ClientHub navigation</SheetTitle>
                  <div className="flex h-16 items-center border-b px-4">
                    <BrandLockup markClassName="text-foreground" />
                  </div>
                  <div className="overflow-y-auto p-2.5">{navList(true)}</div>
                </SheetContent>
              </Sheet>

              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium leading-none text-foreground">
                  {VIEW_TITLES[view.name] ?? "ClientHub"}
                </p>
              </div>

              <GlobalSearch isAdmin={isAdmin} />

              {/* Customer cart shortcut */}
              {!isAdmin && <CartButton />}

              <NotificationBell isAdmin={isAdmin} />
              {userMenu(true)}
            </div>
          </header>

          <main className="flex-1">
            <div className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">{children}</div>
          </main>

          <footer className="mt-auto border-t bg-background">
            <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-2 px-4 py-3.5 text-caption text-muted-foreground sm:px-6 lg:px-10">
              <p>ClientHub · Jeffery Group Ltd.</p>
              <p>Demonstration environment · Sample data</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function CartButton() {
  const navigate = useAppStore((s) => s.navigate);
  const lines = useCartStore((s) => s.lines);
  const count = lines.length;
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPriceCents, 0);
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9 gap-2"
      onClick={() => navigate("cart")}
      aria-label={count > 0 ? `Cart, ${count} items` : "Cart"}
    >
      <ShoppingBag className="size-4" aria-hidden />
      {count > 0 ? (
        <>
          <span className="tnum inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground px-1 text-caption font-semibold text-background">
            {count}
          </span>
          <span className="hidden lg:inline">
            <Money cents={subtotal} />
          </span>
        </>
      ) : (
        <span className="hidden text-body-sm sm:inline">Cart</span>
      )}
    </Button>
  );
}

function NavList({
  groups,
  collapsed,
  isAdmin,
  onNavigate,
  markerId,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  isAdmin: boolean;
  onNavigate: (v: ViewName) => void;
  markerId: string;
}) {
  const view = useAppStore((s) => s.view);
  const unread = useUnreadCount(isAdmin);
  const attentionCount = useAttentionCount(isAdmin);
  const currentNavRoot = view.name.replace(/-detail|-overview/, "");

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label ?? "main"}>
          {!collapsed && group.label && <p className="text-micro mb-1.5 px-2.5 text-muted-foreground">{group.label}</p>}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = currentNavRoot === item.view.replace(/-overview/, "") || view.name === item.view;
              const badgeCount =
                item.badge === "notifications"
                  ? unread
                  : item.badge === "attention" && isAdmin
                    ? attentionCount
                    : 0;
              const kraftBadge = item.badge === "attention";
              return (
                <li key={item.view}>
                  <button
                    onClick={() => onNavigate(item.view)}
                    className={cn(
                      "relative flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-body-sm transition-colors",
                      active
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      collapsed && "lg:justify-center lg:px-0",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {active && (
                      <motion.span
                        layoutId={markerId}
                        className="absolute left-0 top-1/2 h-[18px] w-[2px] -translate-y-1/2 rounded-full bg-kraft-strong"
                        transition={{ type: "spring", stiffness: 500, damping: 38 }}
                        aria-hidden
                      />
                    )}
                    <item.icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} aria-hidden />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && badgeCount > 0 && (
                      <span
                        className={cn(
                          "tnum ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-caption font-semibold",
                          kraftBadge ? "bg-kraft-strong text-white" : "bg-foreground text-background",
                        )}
                      >
                        {badgeCount}
                      </span>
                    )}
                    {collapsed && badgeCount > 0 && (
                      <span
                        className={cn(
                          "absolute right-2 top-1.5 size-[7px] rounded-full",
                          kraftBadge ? "bg-kraft-strong" : "bg-foreground",
                        )}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function useUnreadCount(isAdmin: boolean) {
  const { data } = useQuery({
    queryKey: ["notifications", isAdmin ? "admin" : "customer"],
    queryFn: () =>
      api.get<NotificationDto[]>(isAdmin ? "/api/admin/notifications" : "/api/customer/notifications"),
    refetchInterval: 30_000,
  });
  return data?.filter((n) => !n.isRead).length ?? 0;
}

function useAttentionCount(isAdmin: boolean) {
  const { data } = useQuery({
    queryKey: ["admin", "attention"],
    queryFn: () =>
      api.get<{ overdueUpdates: unknown[]; pendingChangeRequests: unknown[]; newOrderRequests: unknown[]; pendingMessages: unknown[] }>(
        "/api/admin/attention",
      ),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });
  if (!data) return 0;
  return (
    data.overdueUpdates.length +
    data.pendingChangeRequests.length +
    data.newOrderRequests.length +
    data.pendingMessages.length
  );
}

function NotificationBell({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useAppStore((s) => s.navigate);
  const { data } = useQuery({
    queryKey: ["notifications", isAdmin ? "admin" : "customer"],
    queryFn: () =>
      api.get<NotificationDto[]>(isAdmin ? "/api/admin/notifications" : "/api/customer/notifications"),
    refetchInterval: 30_000,
  });
  const notifications = data ?? [];
  const unread = notifications.filter((n) => !n.isRead);
  const recent = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 7);
  const todayKey = new Date().toDateString();
  const today = recent.filter((n) => new Date(n.createdAt).toDateString() === todayKey);
  const earlier = recent.filter((n) => new Date(n.createdAt).toDateString() !== todayKey);

  // ── Live arrival toasts ─────────────────────────────────────────────────
  // Notifications that land while the app is open are announced with a toast
  // (the newest unread one per poll) so announcements can't be missed. The
  // first load only records what exists — no toast storm on sign-in.
  const seenIds = useRef<Set<string> | null>(null);
  const lastToastId = useRef<string>("");
  useEffect(() => {
    if (!data) return;
    if (seenIds.current === null) {
      seenIds.current = new Set(data.map((n) => n.id));
      return;
    }
    const fresh = data.filter((n) => !seenIds.current!.has(n.id));
    for (const n of data) seenIds.current.add(n.id);
    const newestUnread = fresh
      .filter((n) => !n.isRead)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (newestUnread && newestUnread.id !== lastToastId.current) {
      lastToastId.current = newestUnread.id;
      toast({
        title: newestUnread.title,
        duration: 8000,
        action: newestUnread.view ? (
          <ToastAction
            altText="View"
            onClick={() =>
              navigate(newestUnread.view as ViewName, newestUnread.relatedId ? { id: newestUnread.relatedId } : undefined)
            }
          >
            View
          </ToastAction>
        ) : undefined,
      });
    }
  }, [data, navigate]);

  async function markRead(id: string, item: NotificationDto) {
    try {
      await api.post(
        isAdmin ? "/api/admin/notifications/read" : "/api/customer/notifications/read",
        { ids: [id] },
      );
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (item.view) navigate(item.view as ViewName, item.relatedId ? { id: item.relatedId } : undefined);
    } catch {
      toast({ title: "Could not mark as read" });
    }
  }

  function renderItems(items: NotificationDto[]) {
    return items.map((item) => (
      <button
        key={item.id}
        onClick={() => markRead(item.id, item)}
        className="flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/60"
      >
        <span
          className={cn("mt-1.5 size-[7px] shrink-0 rounded-full", item.isRead ? "bg-border" : "bg-kraft-strong")}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-body-sm leading-snug", item.isRead ? "text-muted-foreground" : "font-medium text-foreground")}>
            {item.title}
          </span>
          <span className="mt-0.5 block line-clamp-2 text-caption leading-snug text-muted-foreground">
            {item.body}
          </span>
          <span className="mt-1 block text-caption text-muted-foreground/80">{timeAgo(item.createdAt)}</span>
        </span>
      </button>
    ));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9" aria-label={`Notifications${unread.length ? ` (${unread.length} unread)` : ""}`}>
          <Bell className="size-4.5" aria-hidden />
          {unread.length > 0 && (
            <span className="tnum absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-kraft-strong px-1 text-caption font-bold text-white ring-2 ring-background">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0" sideOffset={8}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-body-sm font-medium">Notifications</p>
          {unread.length > 0 && (
            <span className="text-caption text-muted-foreground">{unread.length} unread</span>
          )}
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="mx-auto size-5 text-muted-foreground/50" aria-hidden />
              <p className="mt-2 text-body-sm text-muted-foreground">You&apos;re all caught up.</p>
            </div>
          ) : (
            <div>
              {today.length > 0 && (
                <div>
                  <p className="text-micro border-b border-border/60 bg-surface-sunken/60 px-4 py-1.5 text-muted-foreground">Today</p>
                  {renderItems(today)}
                </div>
              )}
              {earlier.length > 0 && (
                <div>
                  <p className="text-micro border-b border-border/60 bg-surface-sunken/60 px-4 py-1.5 text-muted-foreground">Earlier</p>
                  {renderItems(earlier)}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full text-body-sm text-muted-foreground"
            onClick={() => navigate(isAdmin ? "admin-notifications" : "notifications")}
          >
            View all
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

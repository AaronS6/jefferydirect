"use client";

// ClientHub — single-route application shell.
// The customer portal and the administration portal are two distinct
// experiences rendered through a client-side view router at `/`.

import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAppStore, type View } from "@/store/app-store";
import type { SessionInfo } from "@/types";
import { LoginScreen } from "@/components/auth/login-screen";
import { AppShell } from "@/components/shell/app-shell";

import { DashboardView } from "@/components/portal/dashboard-view";
import { CatalogView } from "@/components/portal/catalog-view";
import { ProductDetailView } from "@/components/portal/product-detail-view";
import { CartView } from "@/components/portal/cart-view";
import { OrdersView } from "@/components/portal/orders-view";
import { OrderDetailView } from "@/components/portal/order-detail-view";
import { QuotationsView } from "@/components/portal/quotations-view";
import { QuoteDetailView } from "@/components/portal/quote-detail-view";
import { DocumentsView } from "@/components/portal/documents-view";
import { NotificationsView } from "@/components/portal/notifications-view";
import { SupportView } from "@/components/portal/support-view";
import { SettingsView } from "@/components/portal/settings-view";

import { AdminOverviewView } from "@/components/admin/admin-overview-view";
import { AdminAttentionView } from "@/components/admin/admin-attention-view";
import { AdminTemplatesView } from "@/components/admin/admin-templates-view";
import { AdminOrdersView } from "@/components/admin/admin-orders-view";
import { AdminOrderDetailView } from "@/components/admin/admin-order-detail-view";
import { AdminQuotesView } from "@/components/admin/admin-quotes-view";
import { AdminQuoteDetailView } from "@/components/admin/admin-quote-detail-view";
import { AdminCustomersView } from "@/components/admin/admin-customers-view";
import { AdminCustomerDetailView } from "@/components/admin/admin-customer-detail-view";
import { AdminProductsView } from "@/components/admin/admin-products-view";
import { AdminPricingView } from "@/components/admin/admin-pricing-view";
import { AdminDocumentsView } from "@/components/admin/admin-documents-view";
import { AdminNotificationsView } from "@/components/admin/admin-notifications-view";
import { AdminUsersView } from "@/components/admin/admin-users-view";
import { AdminSettingsView } from "@/components/admin/admin-settings-view";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
});

function CustomerViewRouter({ view }: { view: View }) {
  switch (view.name) {
    case "catalog":
      return <CatalogView />;
    case "product-detail":
      return <ProductDetailView productId={view.id ?? ""} />;
    case "cart":
      return <CartView />;
    case "orders":
      return <OrdersView />;
    case "order-detail":
      return <OrderDetailView orderId={view.id ?? ""} />;
    case "quotations":
      return <QuotationsView />;
    case "quote-detail":
      return <QuoteDetailView quotationId={view.id ?? ""} />;
    case "documents":
      return <DocumentsView />;
    case "notifications":
      return <NotificationsView />;
    case "support":
      return <SupportView />;
    case "settings":
      return <SettingsView />;
    case "dashboard":
    default:
      return <DashboardView />;
  }
}

function AdminViewRouter({ view }: { view: View }) {
  switch (view.name) {
    case "admin-attention":
      return <AdminAttentionView />;
    case "admin-templates":
      return <AdminTemplatesView />;
    case "admin-orders":
      return <AdminOrdersView />;
    case "admin-order-detail":
      return <AdminOrderDetailView orderId={view.id ?? ""} />;
    case "admin-quotes":
      return <AdminQuotesView />;
    case "admin-quote-detail":
      return <AdminQuoteDetailView quotationId={view.id ?? ""} />;
    case "admin-customers":
      return <AdminCustomersView />;
    case "admin-customer-detail":
      return <AdminCustomerDetailView customerId={view.id ?? ""} />;
    case "admin-products":
      return <AdminProductsView />;
    case "admin-pricing":
      return <AdminPricingView />;
    case "admin-documents":
      return <AdminDocumentsView />;
    case "admin-notifications":
      return <AdminNotificationsView />;
    case "admin-users":
      return <AdminUsersView />;
    case "admin-settings":
      return <AdminSettingsView />;
    case "admin-overview":
    default:
      return <AdminOverviewView />;
  }
}

function ClientHubApp() {
  const session = useAppStore((s) => s.session);
  const setSession = useAppStore((s) => s.setSession);
  const view = useAppStore((s) => s.view);
  const navigate = useAppStore((s) => s.navigate);

  const { data, isLoading } = useQuery({
    queryKey: ["session"],
    queryFn: () => api.get<SessionInfo>("/api/auth/me"),
    retry: false,
  });

  // Bootstrap session once the server confirms it
  useEffect(() => {
    if (data !== undefined && !session) {
      setSession(data);
    }
  }, [data, session, setSession]);

  // Redirect customers away from admin views and vice versa (UX only —
  // permissions are enforced server-side on every API call).
  // Admins land on the Attention Centre — their working queue.
  useEffect(() => {
    if (!session) return;
    const isAdmin = session.user.role === "ADMIN";
    const isAdminView = view.name.startsWith("admin-");
    if (isAdmin && !isAdminView) {
      navigate("admin-attention");
    } else if (!isAdmin && isAdminView) {
      navigate("dashboard");
    }
  }, [session, view.name, navigate]);

  if (isLoading && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-body-sm text-muted-foreground">Loading ClientHub</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <AppShell>
      {session.user.role === "ADMIN" ? <AdminViewRouter view={view} /> : <CustomerViewRouter view={view} />}
    </AppShell>
  );
}

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <ClientHubApp />
    </QueryClientProvider>
  );
}

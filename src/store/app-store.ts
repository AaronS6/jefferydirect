// ClientHub application store: session state, view router, and cart.
// The app is a single-route SPA (/) — navigation is view-state based.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SessionInfo, CartLine, OrderDraftLine } from "@/types";

// ─── View router ───────────────────────────────────────────────────────────────

export type ViewName =
  // Customer portal
  | "dashboard"
  | "catalog"
  | "product-detail"
  | "cart"
  | "orders"
  | "order-detail"
  | "quotations"
  | "quote-detail"
  | "documents"
  | "notifications"
  | "support"
  | "settings"
  // Admin portal
  | "admin-attention"
  | "admin-overview"
  | "admin-orders"
  | "admin-order-detail"
  | "admin-quotes"
  | "admin-quote-detail"
  | "admin-customers"
  | "admin-customer-detail"
  | "admin-products"
  | "admin-pricing"
  | "admin-documents"
  | "admin-notifications"
  | "admin-templates"
  | "admin-users"
  | "admin-settings";

export type View = {
  name: ViewName;
  /** e.g. productId / orderId / quotationId / customerId for detail views */
  id?: string;
  /** secondary param, e.g. pricing tab preselect org */
  aux?: string;
};

export type NavigateFn = (view: ViewName, opts?: { id?: string; aux?: string }) => void;

interface AppState {
  session: SessionInfo | null;
  setSession: (s: SessionInfo | null) => void;
  view: View;
  navigate: (name: ViewName, opts?: { id?: string; aux?: string }) => void;
  back: () => void;
  historyStack: View[];
}

export const useAppStore = create<AppState>((set) => ({
  session: null,
  setSession: (s) => set({ session: s }),
  view: { name: "dashboard" },
  historyStack: [],
  navigate: (name, opts) =>
    set((state) => ({
      historyStack: [...state.historyStack.slice(-9), state.view],
      view: { name, id: opts?.id, aux: opts?.aux },
    })),
  back: () =>
    set((state) => {
      const stack = [...state.historyStack];
      const prev = stack.pop();
      return { view: prev ?? { name: "dashboard" }, historyStack: stack };
    }),
}));

// ─── Cart (persisted) ─────────────────────────────────────────────────────────

interface CartState {
  lines: CartLine[];
  addLine: (line: CartLine) => void;
  setQty: (productId: string, qty: number) => void;
  removeLine: (productId: string) => void;
  clear: () => void;
  loadDraft: (lines: OrderDraftLine[]) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      addLine: (line) =>
        set((state) => {
          const existing = state.lines.find((l) => l.productId === line.productId);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.productId === line.productId ? { ...l, qty: line.qty } : l,
              ),
            };
          }
          return { lines: [...state.lines, line] };
        }),
      setQty: (productId, qty) =>
        set((state) => ({
          lines: state.lines.map((l) => (l.productId === productId ? { ...l, qty } : l)),
        })),
      removeLine: (productId) =>
        set((state) => ({ lines: state.lines.filter((l) => l.productId !== productId) })),
      clear: () => set({ lines: [] }),
      loadDraft: (draftLines) =>
        set({
          lines: draftLines
            .filter((l) => !l.unavailable)
            .map(({ unavailable: _u, note: _n, ...line }) => line),
        }),
    }),
    {
      name: "clienthub-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ lines: state.lines }) as CartState,
    },
  ),
);

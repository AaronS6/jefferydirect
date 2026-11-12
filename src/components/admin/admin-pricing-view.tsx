"use client";

// Administration — customer-specific pricing. Pick a customer and manage
// their per-product price overrides, notes and catalogue access.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Tag, Users } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import type { CustomerListItem } from "@/types";
import { InlineError, RowsSkeleton, SectionCard, Toolbar, ViewEnter } from "./admin-ui";
import { PricingMatrix } from "./pricing-matrix";

export function AdminPricingView() {
  const navigate = useAppStore((s) => s.navigate);
  const aux = useAppStore((s) => s.view.aux);
  const [orgId, setOrgId] = useState<string>("");
  // No resync effect needed: `effectiveOrgId` below derives the selection —
  // a manual pick wins, the navigation aux (customer drill-in) is the fallback.

  const { data: customers, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "customers", ""],
    queryFn: () => api.get<CustomerListItem[]>("/api/admin/customers?search="),
  });

  const list = customers ?? [];
  // Preselect from the navigation aux (e.g. "Manage pricing" from a profile)
  // once the customer list is available, and only when it matches a real org.
  const effectiveOrgId =
    list.find((c) => c.id === orgId)?.id ??
    list.find((c) => c.id === aux)?.id ??
    "";
  const selected = list.find((c) => c.id === effectiveOrgId);

  if (isError) {
    return (
      <div>
        <PageHeader title="Pricing" />
        <InlineError message={error instanceof Error ? error.message : "Could not load customers."} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Pricing" />

      <ViewEnter>
      <Toolbar>
        {isLoading ? (
          <div className="h-9 w-full animate-pulse rounded-md bg-muted sm:w-[280px]" aria-hidden />
        ) : (
          <Select
            value={effectiveOrgId}
            onValueChange={(v) => setOrgId(v)}
          >
            <SelectTrigger size="sm" className="h-9 w-full text-body-sm sm:w-[300px]" aria-label="Choose a customer">
              <SelectValue placeholder="Choose a customer…" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel className="text-micro">Customers</SelectLabel>
                {list.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · <span className="font-mono text-caption text-muted-foreground">{c.code}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        {selected && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => navigate("admin-customer-detail", { id: selected.id })}
          >
            Open profile
            <ChevronRight className="size-3.5" aria-hidden />
          </Button>
        )}
      </Toolbar>

      {isLoading ? (
        <SectionCard title="Pricing matrix">
          <RowsSkeleton rows={8} />
        </SectionCard>
      ) : !effectiveOrgId ? (
        <EmptyState
          icon={Tag}
          title="Choose a customer"
          action={
            list.length > 0 ? (
              <Button variant="outline" onClick={() => setOrgId(list[0].id)}>
                Choose {list[0].name}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <SectionCard
          title={selected ? `${selected.name} pricing` : "Pricing matrix"}
        >
          <PricingMatrix orgId={effectiveOrgId} />
        </SectionCard>
      )}

      </ViewEnter>

      <p className="mt-3 flex items-center gap-1.5 text-caption text-muted-foreground">
        <Users className="size-3.5 shrink-0" aria-hidden />
        Customers manage their own addresses and notification preferences under Settings.
      </p>
    </div>
  );
}

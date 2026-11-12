"use client";

// Login screen — editorial split composition: solid ink panel with a mock
// order-timeline fragment, warm paper form panel. Kraft & Ink.

import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import { toast } from "@/hooks/use-toast";
import { BrandMark } from "@/components/shared/brand-mark";
import type { SessionInfo } from "@/types";

const DEMO_ACCOUNTS = [
  { label: "Administrator", org: "Jeffery Group", email: "admin@jefferygroup.com", password: "Jeffery2024!", hint: "Internal admin portal" },
  { label: "Customer", org: "Maple Leaf Pizzeria", email: "maria@mapleleafpizzeria.ca", password: "Client2024!", hint: "Pizza boxes & takeaway" },
  { label: "Customer", org: "Harvest Food Group", email: "daniel@harvestfood.ca", password: "Client2024!", hint: "PET / PP containers" },
  { label: "Customer", org: "Pacific Bakehouse", email: "sofia@pacificbakehouse.ca", password: "Client2024!", hint: "Corrugated & custom print" },
];

export function LoginScreen() {
  const setSession = useAppStore((s) => s.setSession);
  const navigate = useAppStore((s) => s.navigate);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Please enter your email address and password.");
      return;
    }
    setSubmitting(true);
    try {
      const session = await api.post<SessionInfo>("/api/auth/login", {
        email: email.trim().toLowerCase(),
        password,
        remember,
      });
      setSession(session);
      // Admins land on their working queue.
      navigate(session.user.role === "ADMIN" ? "admin-attention" : "dashboard");
      toast({ title: `Welcome back, ${session.user.name.split(" ")[0]}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function fill(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[55fr_45fr]">
      {/* ── Ink panel — the product, not a description of it ─────────────── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-ink p-10 text-brand-paper lg:flex xl:p-16">
        {/* corrugation texture — one corner only */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-[420px] w-[420px] rotate-12 opacity-100"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(255 255 255 / 0.035) 0px, rgba(255 255 255 / 0.035) 1px, transparent 1px, transparent 7px)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <BrandMark size={30} className="text-brand-paper" />
            <div>
              <p className="text-body font-semibold leading-tight tracking-tight text-brand-paper">ClientHub</p>
              <p className="text-micro text-brand-paper/60">Jeffery Group Ltd.</p>
            </div>
          </div>
          <h1 className="font-display mt-14 max-w-lg text-display font-normal text-balance">
            Packaging, ordered the way your business works.
          </h1>

          {/* Mock order-timeline fragment — the product at work */}
          <div className="mt-12 max-w-md rounded-[14px] border border-brand-paper/12 bg-brand-paper/[0.045] p-5">
            <div className="flex items-baseline justify-between">
              <p className="font-mono text-caption tracking-tight text-brand-paper/80">ORD-10482</p>
              <p className="text-micro text-brand-paper/55">8&quot; Pizza Box — 5,000 units</p>
            </div>
            <div className="mt-4 flex items-center">
              <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-brand-paper">
                <span className="size-1.5 rounded-full bg-brand-ink" aria-hidden />
              </span>
              <span className="h-px flex-1 bg-brand-paper/25" aria-hidden />
              <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full border-2 border-kraft bg-kraft/90">
                <span className="size-1.5 rounded-full bg-brand-ink" aria-hidden />
              </span>
              <span className="h-px flex-1 bg-brand-paper/25" aria-hidden />
              <span className="size-3.5 shrink-0 rounded-full border border-brand-paper/40" aria-hidden />
            </div>
            <div className="mt-2.5 flex justify-between">
              <p className="text-caption font-medium text-brand-paper/90">Confirmed</p>
              <p className="text-caption font-medium text-kraft">In production</p>
              <p className="text-caption text-brand-paper/50">Dispatched</p>
            </div>
            <p className="mt-4 border-t border-brand-paper/10 pt-3 text-caption text-brand-paper/60">
              Next update expected <span className="tnum">Thu 14 Nov</span> · posted by M. Chen
            </p>
          </div>
        </div>
        <p className="relative text-caption text-brand-paper/45">
          Demonstration environment · Sample data shown for evaluation
        </p>
      </aside>

      {/* ── Form panel on warm paper ─────────────────────────────────────── */}
      <main className="relative flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-10 flex items-center gap-2.5 lg:hidden">
            <BrandMark size={34} className="text-foreground" />
            <div>
              <p className="text-body font-semibold leading-tight tracking-tight text-foreground">ClientHub</p>
              <p className="text-micro text-muted-foreground">Jeffery Group Ltd.</p>
            </div>
          </div>

          <h2 className="font-display text-heading font-normal text-foreground">Sign in</h2>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-body-sm font-medium text-foreground">
                Email address
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="h-11 pl-10 text-body"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-body-sm font-medium text-foreground">
                  Password
                </Label>
                <button
                  type="button"
                  className="text-caption font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  onClick={() =>
                    toast({
                      title: "Contact your account manager to reset it.",
                      description: "Demo accounts are listed below.",
                    })
                  }
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  className="h-11 pr-11 text-body"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-body-sm text-muted-foreground">
              <Checkbox checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
              Remember me for 30 days
            </label>

            {error && (
              <div
                role="alert"
                className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]"
              >
                {error}
              </div>
            )}

            <Button type="submit" size="xl" className="group w-full gap-2" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogIn className="size-4" aria-hidden />}
              {submitting ? "Signing in…" : "Sign in"}
              {!submitting && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />}
            </Button>
          </form>

          {/* Demo access — subordinate, tidy */}
          <div className="mt-10">
            <p className="text-micro text-muted-foreground">Demo accounts</p>
            <div className="mt-3 divide-y divide-border/70 border-y">
              {DEMO_ACCOUNTS.map((acct) => (
                <button
                  key={acct.email}
                  type="button"
                  onClick={() => fill(acct)}
                  title={acct.hint}
                  className="group flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-accent/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-medium text-foreground">{acct.org}</span>
                    <span className="block truncate font-mono text-caption text-muted-foreground">{acct.email}</span>
                  </span>
                  <span className="inline-flex h-[22px] shrink-0 items-center rounded-full border bg-card px-2.5 text-caption font-medium text-muted-foreground transition-colors group-hover:border-foreground/25 group-hover:text-foreground">
                    {acct.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

// Shared building blocks for the Smart Order Builder (cart-view) — per-line
// specification fields, honest metadata-only attachment picker, the custom
// product request form, and the saved-drafts strip. Complements portal-bits.

import { useRef, useState } from "react";
import { Loader2, Paperclip, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { timeAgo } from "@/lib/date";
import type { AttachmentMeta, LineSpecs, OrderDraftDto } from "@/types";
import { cn } from "@/lib/utils";
import { QtyStepper } from "./portal-bits";

// ─── Specifications ──────────────────────────────────────────────────────────

type SpecFieldDef = { key: keyof LineSpecs; label: string; placeholder?: string };

export const SPEC_FIELD_DEFS: SpecFieldDef[] = [
  { key: "dimensions", label: "Dimensions", placeholder: "e.g. 12 × 8 × 8 in" },
  { key: "length", label: "Length" },
  { key: "width", label: "Width" },
  { key: "height", label: "Height" },
  { key: "material", label: "Material", placeholder: "e.g. C-flute corrugate" },
  { key: "thickness", label: "Thickness" },
  { key: "printing", label: "Printing", placeholder: "e.g. 2-colour flexo" },
  { key: "colour", label: "Colour" },
  { key: "qtyPerCase", label: "Qty per case" },
  { key: "custom", label: "Custom spec", placeholder: "e.g. coatings, pallet pattern" },
];

/** Strip empty values; returns undefined when nothing is filled. */
export function cleanSpecs(specs: LineSpecs | null | undefined): LineSpecs | undefined {
  if (!specs) return undefined;
  const out: LineSpecs = {};
  for (const [key, value] of Object.entries(specs)) {
    const v = typeof value === "string" ? value.trim() : "";
    if (v) out[key as keyof LineSpecs] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Filled spec fields as label/value pairs — for chips and review summaries. */
export function filledSpecFields(
  specs: LineSpecs | null | undefined,
): { key: string; label: string; value: string }[] {
  if (!specs) return [];
  return SPEC_FIELD_DEFS.filter((f) => {
    const v = specs[f.key];
    return typeof v === "string" && v.trim() !== "";
  }).map((f) => ({ key: f.key as string, label: f.label, value: (specs[f.key] ?? "").trim() }));
}

/** Labeled grid of the optional per-line spec inputs. */
export function SpecFieldsEditor({
  idPrefix,
  specs,
  onChange,
}: {
  idPrefix: string;
  specs: LineSpecs;
  onChange: (specs: LineSpecs) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {SPEC_FIELD_DEFS.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-${f.key}`} className="text-caption text-muted-foreground">
            {f.label}
          </Label>
          <Input
            id={`${idPrefix}-${f.key}`}
            maxLength={120}
            placeholder={f.placeholder ?? ""}
            value={specs[f.key] ?? ""}
            onChange={(e) => onChange({ ...specs, [f.key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Attachments (metadata only — honest) ────────────────────────────────────

export function humanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Registers file references (name + human-readable size) with a request.
 * File contents are never uploaded here — our team requests the actual files
 * if needed. The hint says exactly that.
 */
export function AttachmentPicker({
  idPrefix,
  attachments,
  onChange,
  label = "Attach files",
}: {
  idPrefix: string;
  attachments: AttachmentMeta[];
  onChange: (attachments: AttachmentMeta[]) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next = [...attachments];
    for (const file of Array.from(files)) {
      next.push({ name: file.name, sizeLabel: humanFileSize(file.size) });
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={`${idPrefix}-file`}
        type="file"
        multiple
        hidden
        onChange={(e) => pickFiles(e.target.files)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-caption text-muted-foreground"
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="size-3.5" aria-hidden />
          {label}
        </Button>
        {attachments.length > 0 && (
          <ul className="flex flex-wrap items-center gap-1.5">
            {attachments.map((a, i) => (
              <li
                key={`${a.name}-${i}`}
                className="inline-flex h-[22px] max-w-full items-center gap-1 rounded-full border bg-card px-2 text-caption text-muted-foreground"
                title={`${a.name} (${a.sizeLabel}), reference only`}
              >
                <Paperclip className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{a.name}</span>
                <span className="shrink-0 text-muted-foreground/70">{a.sizeLabel}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => onChange(attachments.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${a.name} reference`}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-caption text-pretty leading-relaxed text-muted-foreground">
        References only. We request the actual files if needed.
      </p>
    </div>
  );
}

// ─── Custom product request (inline form) ────────────────────────────────────

export type CustomLineDraft = {
  localId: string;
  name: string;
  description: string;
  qty: number;
  note: string;
  specs: LineSpecs;
  attachments: AttachmentMeta[];
};

export function newLocalId(): string {
  return `cl-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Inline "custom product request" form — anything not in the approved
 * catalogue. Pricing is confirmed by Jeffery Group after review.
 */
export function CustomLineForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (line: CustomLineDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState(100);
  const [note, setNote] = useState("");
  const [specs, setSpecs] = useState<LineSpecs>({});
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) {
      setError("Give the request a short name, e.g. “Printed sleeve, 4-colour”.");
      return;
    }
    setError(null);
    onSubmit({
      localId: newLocalId(),
      name: name.trim(),
      description: description.trim(),
      qty,
      note: note.trim(),
      specs,
      attachments,
    });
  }

  // NOTE: deliberately NOT a <form> — this editor renders inside the order
  // builder's outer <form>, and nested forms are invalid HTML (React rejects
  // them outright). Submission is handled by the button / Enter key below.
  return (
    <div
      className="space-y-4 rounded-[14px] border border-dashed bg-surface-sunken/60 p-5"
      aria-label="Custom product request"
    >
      <div>
        <p className="text-body font-semibold text-foreground">Custom product request</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="space-y-1.5">
          <Label htmlFor="custom-name">Request name</Label>
          <Input
            id="custom-name"
            maxLength={160}
            placeholder="e.g. Printed corrugated sleeve, 4-colour"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <div className="space-y-1.5">
          <span className="block text-micro text-muted-foreground">Quantity</span>
          <QtyStepper value={qty} onChange={setQty} size="sm" ariaLabel="Custom request quantity" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="custom-desc">Description (optional)</Label>
        <Textarea
          id="custom-desc"
          rows={3}
          maxLength={2000}
          placeholder="What it's for, how it's used, any reference to existing products…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="custom-note" className="text-caption text-muted-foreground">
          Line note (optional)
        </Label>
        <Input
          id="custom-note"
          maxLength={500}
          placeholder="e.g. Partial deliveries acceptable"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <p className="text-micro text-muted-foreground">Specifications (optional)</p>
        <SpecFieldsEditor idPrefix="custom" specs={specs} onChange={setSpecs} />
      </div>
      <AttachmentPicker
        idPrefix="custom"
        attachments={attachments}
        onChange={setAttachments}
        label="Attach file references"
      />
      {error && (
        <div role="alert" className="rounded-[10px] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-body-sm text-[var(--status-danger-fg)]">
          {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="button" className="gap-1.5" onClick={submit}>
          <Plus className="size-4" aria-hidden /> Add request
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Saved drafts strip ──────────────────────────────────────────────────────

export function DraftStrip({
  drafts,
  deletingId,
  onContinue,
  onDelete,
}: {
  drafts: OrderDraftDto[];
  deletingId: string | null;
  onContinue: (draft: OrderDraftDto) => void;
  onDelete: (draft: OrderDraftDto) => void;
}) {
  return (
    <section
      aria-label="Saved order drafts"
      className="rounded-[14px] border bg-card shadow-xs"
    >
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <p className="text-micro text-muted-foreground">Saved drafts</p>
      </div>
      <ul className="divide-y">
        {drafts.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-medium text-foreground">{d.name}</p>
              <p className="text-caption text-muted-foreground">
                {d.lineCount.toLocaleString()} item{d.lineCount === 1 ? "" : "s"} · saved{" "}
                {timeAgo(d.updatedAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5"
                onClick={() => onContinue(d)}
              >
                Continue
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-[var(--status-danger-fg)]"
                disabled={deletingId === d.id}
                onClick={() => onDelete(d)}
                aria-label={`Delete draft ${d.name}`}
              >
                {deletingId === d.id ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden />
                )}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Read-only chips for filled spec fields (review rows, order detail lines). */
export function SpecChips({ specs, className }: { specs: LineSpecs | null; className?: string }) {
  const fields = filledSpecFields(specs);
  if (fields.length === 0) return null;
  return (
    <ul className={cn("mt-1 flex flex-wrap gap-1.5", className)}>
      {fields.map((f) => (
        <li
          key={f.key}
          className="inline-flex h-[22px] max-w-full items-center gap-1 truncate rounded-full border bg-card px-2 text-caption font-medium text-muted-foreground"
          title={`${f.label}: ${f.value}`}
        >
          <span className="text-muted-foreground/70">{f.label}</span>
          <span className="truncate font-normal text-foreground/80">{f.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Read-only paperclip chips for registered attachment references. */
export function AttachmentChips({
  attachments,
  className,
}: {
  attachments: AttachmentMeta[];
  className?: string;
}) {
  if (attachments.length === 0) return null;
  return (
    <ul className={cn("mt-1.5 flex flex-wrap gap-1.5", className)}>
      {attachments.map((a, i) => (
        <li
          key={`${a.name}-${i}`}
          className="inline-flex h-[22px] max-w-full items-center gap-1 truncate rounded-full border bg-card px-2 text-caption text-muted-foreground"
          title={`${a.name} (${a.sizeLabel}), reference only`}
        >
          <Paperclip className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{a.name}</span>
          <span className="shrink-0 text-muted-foreground/70">{a.sizeLabel}</span>
        </li>
      ))}
    </ul>
  );
}

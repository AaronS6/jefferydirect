"use client";

// Administration — update templates: reusable starting points for customer
// updates. Placeholders are filled automatically at compose time; templates
// always require review before publishing.

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Info, PencilLine, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { UpdateCategoryBadge } from "@/components/shared/update-timeline";
import { api } from "@/lib/api-client";
import { timeAgo } from "@/lib/date";
import {
  TEMPLATE_PLACEHOLDER_HINTS,
  TEMPLATE_PLACEHOLDERS,
  UPDATE_CATEGORIES,
  UPDATE_CATEGORY_LABELS,
} from "@/lib/constants";
import { toast } from "@/hooks/use-toast";
import type { UpdateTemplateDto } from "@/types";
import { FieldError, InlineError, RowsSkeleton, SectionCard, ViewEnter } from "./admin-ui";

export function AdminTemplatesView() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<UpdateTemplateDto | null>(null);
  const [deleting, setDeleting] = useState<UpdateTemplateDto | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "templates"],
    queryFn: () => api.get<UpdateTemplateDto[]>("/api/admin/templates"),
  });

  const templates = data ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
  }

  function openEditor(template?: UpdateTemplateDto) {
    setEditing(template ?? null);
    setEditorOpen(true);
  }

  const remove = useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/api/admin/templates/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast({ title: "Template deleted" });
    },
    onError: (err: Error) => toast({ title: "Could not delete template", description: err.message }),
  });

  return (
    <div>
      <PageHeader
        title="Update templates"
        actions={
          <Button className="gap-1.5" onClick={() => openEditor()}>
            <Plus className="size-4" aria-hidden />
            New template
          </Button>
        }
      />

      <ViewEnter>
      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {isError ? (
          <InlineError message={error instanceof Error ? error.message : "Could not load templates."} />
        ) : isLoading ? (
          <SectionCard>
            <RowsSkeleton rows={5} />
          </SectionCard>
        ) : templates.length === 0 ? (
          <SectionCard>
            <EmptyState
              icon={FileText}
              title="No templates yet"
              action={
                <Button variant="outline" onClick={() => openEditor()}>
                  <Plus className="size-4" aria-hidden /> New template
                </Button>
              }
            />
          </SectionCard>
        ) : (
          <SectionCard
            title="Template library"
            bodyClassName="p-0"
          >
            <ul className="divide-y">
              {templates.map((template) => (
                <li key={template.id} className="flex flex-col gap-2.5 px-5 py-3.5 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body-sm font-medium leading-snug">{template.title}</p>
                      <UpdateCategoryBadge category={template.category} />
                      {template.isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-done-bg)] px-1.5 py-0.5 text-micro font-medium text-[var(--status-done-fg)]">
                          <Star className="size-2.5" aria-hidden />
                          Default
                        </span>
                      )}
                    </div>
                    <TemplateBodyPreview body={template.body} />
                    <p className="mt-1 tnum text-caption text-muted-foreground">
                      {template.createdByName ? `by ${template.createdByName} · ` : ""}
                      updated {timeAgo(template.updatedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => openEditor(template)}
                    >
                      <PencilLine className="size-3" aria-hidden />
                      Edit
                    </Button>
                    {!template.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)]"
                        onClick={() => setDeleting(template)}
                      >
                        <Trash2 className="size-3" aria-hidden />
                        Delete
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        <div className="space-y-4 sm:space-y-6">
          <SectionCard title="How templates work">
            <p className="flex items-start gap-2.5 text-body-sm leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                When composing an update, placeholders like{" "}
                <code className="rounded-full bg-kraft-soft px-1.5 font-mono text-caption text-kraft-ink">
                  {"{{customer_name}}"}
                </code>{" "}
                fill automatically from the order. You always review before publishing.
              </span>
            </p>
            <ul className="mt-3.5 space-y-1.5 border-t pt-3">
              {TEMPLATE_PLACEHOLDERS.map((key) => (
                <li key={key} className="flex items-baseline gap-2 text-caption">
                  <code className="shrink-0 rounded-full bg-kraft-soft px-1.5 font-mono text-kraft-ink">
                    {`{{${key}}}`}
                  </code>
                  <span className="text-muted-foreground">{TEMPLATE_PLACEHOLDER_HINTS[key]}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
      </ViewEnter>

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editing ?? undefined}
        onSaved={invalidate}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              The template is removed from the picker when composing updates. Updates already published with it are
              unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep template</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/35"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) remove.mutate(deleting.id);
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete template"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Body preview with mono placeholders ─────────────────────────────────────

function TemplateBodyPreview({ body }: { body: string }) {
  const parts = body.split(/(\{\{[^}]+\}\})/g);
  return (
    <p className="mt-1 line-clamp-2 text-caption leading-relaxed text-muted-foreground">
      {parts.map((part, i) =>
        /^\{\{[^}]+\}\}$/.test(part) ? (
          <code
            key={i}
            className="rounded-full bg-kraft-soft px-1.5 py-px font-mono text-caption text-kraft-ink"
          >
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

// ─── Editor dialog ───────────────────────────────────────────────────────────

function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template?: UpdateTemplateDto;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("PRODUCTION");
  const [body, setBody] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function reset(template?: UpdateTemplateDto) {
    setTitle(template?.title ?? "");
    setCategory(template?.category ?? "PRODUCTION");
    setBody(template?.body ?? "");
    setSubmitError(null);
  }

  function handleOpenChange(v: boolean) {
    if (v) reset(template);
    onOpenChange(v);
  }

  const save = useMutation({
    mutationFn: (): Promise<{ id?: string; ok?: boolean }> => {
      const payload = { title: title.trim(), category, body: body.trim() };
      if (template) {
        return api.patch<{ ok: boolean }>(`/api/admin/templates/${template.id}`, payload);
      }
      return api.post<{ id: string }>("/api/admin/templates", payload);
    },
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
      toast({
        title: template ? "Template updated" : "Template created",
      });
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  function insertPlaceholder(key: string) {
    const token = `{{${key}}}`;
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-y-auto sm:max-w-[560px]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitError(null);
            if (!title.trim() || !body.trim()) {
              setSubmitError("A title and a body are required.");
              return;
            }
            save.mutate();
          }}
          className="space-y-4"
        >
          <DialogHeader className="border-b pb-4">
            <DialogTitle>
              {template ? "Edit template" : "New template"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tpl-title" className="text-body-sm">
                Title
              </Label>
              <Input
                id="tpl-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Production update, mid-run"
                className="h-9 text-body-sm"
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-category" className="text-body-sm">
                Category
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="tpl-category" className="h-9 w-full text-body-sm" aria-label="Template category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UPDATE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {UPDATE_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tpl-body" className="text-body-sm">
                Body
              </Label>
              <Textarea
                id="tpl-body"
                ref={bodyRef}
                rows={8}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={"Hello {{customer_name}},\n\nYour order {{order_number}} is…"}
                className="leading-relaxed"
                maxLength={4000}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-micro text-muted-foreground">
              Insert a placeholder
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_PLACEHOLDERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  title={TEMPLATE_PLACEHOLDER_HINTS[key]}
                  className="rounded-full border border-kraft/30 bg-kraft-soft px-2.5 py-1 font-mono text-caption text-kraft-ink transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => insertPlaceholder(key)}
                >
                  {`{{${key}}}`}
                </button>
              ))}
            </div>
            <p className="text-caption leading-snug text-muted-foreground">
              Click to insert at the cursor. Each fills with the matching value from the order.
            </p>
          </div>

          {submitError && <FieldError>{submitError}</FieldError>}

          <DialogFooter className="border-t pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="gap-1.5" disabled={save.isPending}>
              <PencilLine className="size-3.5" aria-hidden />
              {save.isPending ? "Saving…" : template ? "Save changes" : "Create template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

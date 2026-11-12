// Route-handler helpers: JSON responses, auth guards, and error envelopes.
// Every protected endpoint resolves the session server-side — permissions are
// NEVER enforced only in the frontend.

import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/server/auth";
import { ROLE_ADMIN } from "@/lib/constants";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as object, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number = 400,
  ) {
    super(message);
  }
}

/** Wrap a handler so thrown ApiErrors become clean JSON responses. */
export function handler(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((err) => {
    if (err instanceof ApiError) return fail(err.message, err.status);
    console.error("[api]", err);
    return fail("Unexpected server error. Please try again.", 500);
  });
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError("You must be signed in.", 401);
  return user;
}

export async function requireCustomer(): Promise<SessionUser & { orgId: string }> {
  const user = await requireUser();
  if (user.role !== "CUSTOMER" || !user.orgId) {
    throw new ApiError("Customer account required.", 403);
  }
  return user as SessionUser & { orgId: string };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== ROLE_ADMIN) {
    throw new ApiError("Administrator access required.", 403);
  }
  return user;
}

/** Parse & validate a JSON body; throws ApiError on malformed input. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("bad shape");
    }
    return body as Record<string, unknown>;
  } catch {
    throw new ApiError("Invalid request body.", 400);
  }
}

export function str(v: unknown, field: string, opts?: { max?: number; required?: boolean }): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s && opts?.required) throw new ApiError(`${field} is required.`, 422);
  if (opts?.max && s.length > opts.max) throw new ApiError(`${field} is too long.`, 422);
  return s;
}

export function num(v: unknown, field: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new ApiError(`${field} must be a number.`, 422);
  return n;
}

export function int(v: unknown, field: string, opts?: { min?: number }): number {
  const n = num(v, field);
  if (!Number.isInteger(n)) throw new ApiError(`${field} must be a whole number.`, 422);
  if (opts?.min !== undefined && n < opts.min) {
    throw new ApiError(`${field} must be at least ${opts.min}.`, 422);
  }
  return n;
}

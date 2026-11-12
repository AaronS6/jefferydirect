// Server-only session helpers for Next.js route handlers.
// Sessions are HMAC-signed cookies — verified server-side on every request.

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSessionToken, verifySessionToken } from "@/lib/server/crypto";
import { ROLE_ADMIN, ROLE_CUSTOMER } from "@/lib/constants";

export const SESSION_COOKIE = "clienthub_session";
const DAY_MS = 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  orgRole: string; // ORG_ADMIN | PURCHASING | READONLY (admins: ORG_ADMIN)
  title: string | null;
  phone: string | null;
  status: string;
  orgId: string | null;
  organization: {
    id: string;
    code: string;
    name: string;
    status: string;
    billingLine1: string;
    billingCity: string;
    billingProvince: string;
    billingPostal: string;
    phone: string;
  } | null;
};

export async function startSession(userId: string, remember: boolean) {
  const ttl = remember ? 30 * DAY_MS : DAY_MS;
  const token = createSessionToken(userId, ttl);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ttl / 1000),
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Resolve the current authenticated user (or null). Safe to call anywhere. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    include: {
      organization: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          billingLine1: true,
          billingCity: true,
          billingProvince: true,
          billingPostal: true,
          phone: true,
        },
      },
    },
  });
  if (!user || user.status === "DISABLED") return null;
  if (user.role === ROLE_CUSTOMER && (!user.orgId || user.organization?.status !== "ACTIVE")) {
    return null; // suspended organization → no portal access
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    orgRole:
      user.role === "ADMIN" ? "ORG_ADMIN" : user.orgRole === "PURCHASING" || user.orgRole === "READONLY" ? user.orgRole : "ORG_ADMIN",
    title: user.title,
    phone: user.phone,
    status: user.status,
    orgId: user.orgId,
    organization: user.organization,
  };
}

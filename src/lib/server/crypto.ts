// Server-only crypto helpers: password hashing + HMAC session tokens.
// Uses Node crypto (pbkdf2) — no external dependencies.

import crypto from "node:crypto";

const PBKDF2_ITERATIONS = 100_000;
const KEYLEN = 32;
const DIGEST = "sha256";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEYLEN, DIGEST)
    .toString("hex");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, iterStr, salt, hash] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const iterations = parseInt(iterStr, 10);
    const candidate = crypto
      .pbkdf2Sync(password, salt, iterations, KEYLEN, DIGEST)
      .toString("hex");
    // constant-time compare
    return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

// ─── Session tokens ───────────────────────────────────────────────────────────
// Stateless signed token: `${userId}.${expiresAt}.${hmac}`
// Secret from env in production; stable dev fallback keeps sessions valid
// across dev-server restarts.

function sessionSecret(): string {
  return process.env.SESSION_SECRET || "clienthub-dev-secret-jeffery-group";
}

export function createSessionToken(userId: string, ttlMs: number): string {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${userId}.${expiresAt}`;
  const mac = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

export type SessionPayload = { userId: string; expiresAt: number };

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresStr, mac] = parts;
  const payload = `${userId}.${expiresStr}`;
  const expected = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("hex");
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const expiresAt = parseInt(expiresStr, 10);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  return { userId, expiresAt };
}

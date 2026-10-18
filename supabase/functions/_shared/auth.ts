// Staff session tokens: HMAC-SHA256 signed, 8h expiry. Roles come from the token, never the body.

import { SESSION_TTL_HOURS, STAFF_SALT, sessionSecret } from "./config.ts";

export type StaffRole = "DOCTOR" | "RECEPTION" | "ADMIN" | "HOSPITAL_DESK";

export interface SessionClaims {
  sub: string;
  role: StaffRole;
  hospital_id: string | null;
  display_name: string;
  exp: number;
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function toHex(buf: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < buf.length; i++) {
    hex += buf[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signToken(claims: Omit<SessionClaims, "exp">): Promise<string> {
  const full: SessionClaims = { ...claims, exp: Date.now() + SESSION_TTL_HOURS * 3600 * 1000 };
  const payload = b64url(new TextEncoder().encode(JSON.stringify(full)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifyToken(token: string): Promise<SessionClaims | null> {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;

  let key: CryptoKey;
  try {
    key = await hmacKey();
  } catch {
    return null;
  }

  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expectedSig = b64url(expected);
  if (!timingSafeEqual(expectedSig, sig)) return null;

  try {
    const decoded = new TextDecoder().decode(b64urlDecode(payload));
    const claims = JSON.parse(decoded) as Record<string, unknown>;
    if (!claims || typeof claims !== "object") return null;

    if (typeof claims.sub !== "string" || !claims.sub.trim()) return null;
    if (typeof claims.role !== "string" || !["DOCTOR", "RECEPTION", "ADMIN", "HOSPITAL_DESK"].includes(claims.role)) return null;
    if (claims.hospital_id !== null && typeof claims.hospital_id !== "string") return null;
    if (typeof claims.display_name !== "string" || !claims.display_name.trim()) return null;
    if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp < Date.now()) return null;

    return {
      sub: claims.sub,
      role: claims.role as StaffRole,
      hospital_id: claims.hospital_id,
      display_name: claims.display_name,
      exp: claims.exp,
    };
  } catch {
    return null;
  }
}

// ---------- Password Hashing (PBKDF2 with versioning & legacy migration) ----------
const PBKDF2_ITERATIONS = 100000;

async function derivePbkdf2(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return new Uint8Array(derived);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const derived = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2:sha256:${PBKDF2_ITERATIONS}:${toHex(salt)}:${toHex(derived)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!storedHash || typeof storedHash !== "string") {
    return { valid: false, needsRehash: false };
  }

  // Modern PBKDF2 format
  if (storedHash.startsWith("pbkdf2:sha256:")) {
    const parts = storedHash.split(":");
    if (parts.length !== 5) return { valid: false, needsRehash: false };
    const iterations = parseInt(parts[2], 10);
    const saltHex = parts[3];
    const expectedHex = parts[4];
    if (isNaN(iterations) || iterations < 1000 || !saltHex || !expectedHex) {
      return { valid: false, needsRehash: false };
    }
    const salt = fromHex(saltHex);
    const derived = await derivePbkdf2(password, salt, iterations);
    const actualHex = toHex(derived);
    const valid = timingSafeEqual(actualHex, expectedHex);
    return { valid, needsRehash: iterations < PBKDF2_ITERATIONS };
  }

  // Legacy SHA-256 fallback (seeded accounts)
  if (storedHash.length === 64 && /^[0-9a-fA-F]{64}$/.test(storedHash)) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(STAFF_SALT + password));
    const legacyHex = toHex(new Uint8Array(buf));
    const valid = timingSafeEqual(legacyHex.toLowerCase(), storedHash.toLowerCase());
    return { valid, needsRehash: valid };
  }

  return { valid: false, needsRehash: false };
}

// ---------- Unguessable Patient Status Access Tokens ----------
export async function signStatusToken(entryId: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`queue-status:${entryId}`));
  return b64url(sig);
}

export async function verifyStatusToken(entryId: string, statusToken?: string | null): Promise<boolean> {
  if (!statusToken || typeof statusToken !== "string") return false;
  try {
    const key = await hmacKey();
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`queue-status:${entryId}`));
    const expected = b64url(sig);
    return timingSafeEqual(expected, statusToken);
  } catch {
    return false;
  }
}

// Returns claims or throws a Response-shaped error object.
export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function requireRole(req: Request, roles: StaffRole[]): Promise<SessionClaims> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new AuthError("Missing session token", 401);
  const claims = await verifyToken(token);
  if (!claims) throw new AuthError("Invalid or expired session", 401);
  if (!roles.includes(claims.role)) throw new AuthError("Insufficient role", 403);
  return claims;
}

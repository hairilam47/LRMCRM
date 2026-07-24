/**
 * Prototype auth: scrypt-hashed credentials + HMAC-signed HttpOnly cookie.
 * Phase-2 seam: swap this module for Better Auth (schema is already
 * org-scoped); call sites only use requireUser() / login() / logout().
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, scryptSync, timingSafeEqual, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

const SECRET = process.env.AUTH_SECRET ?? "dev-secret";
const COOKIE = "loya_session";

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const check = scryptSync(pw, salt, 64);
  return timingSafeEqual(check, Buffer.from(hash, "hex"));
}
function sign(v: string) {
  return createHmac("sha256", SECRET).update(v).digest("base64url");
}

export async function login(email: string, password: string): Promise<boolean> {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase()));
  if (!user || !verifyPassword(password, user.passwordHash)) return false;
  const value = `${user.id}.${sign(user.id)}`;
  (await cookies()).set(COOKIE, value, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7,
  });
  return true;
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, sig] = raw.split(".");
  if (!id || sig !== sign(id)) return null;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return user ?? null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Role gate. `admin` always passes. Use on server pages/actions that should
 * be restricted — e.g. requireRole(["admin", "marketing"]) for voucher
 * campaigns, requireRole(["admin"]) for program config.
 */
export async function requireRole(allowed: string[]) {
  const user = await requireUser();
  if (user.role !== "admin" && !allowed.includes(user.role)) {
    redirect("/?denied=1");
  }
  return user;
}

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";

export type UserRole = "ADMIN" | "SALES" | "CLIENT" | "WAREHOUSE";
export type AuthUser = {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  sales_user_id: number | null;
  active: number;
  is_root_admin: number;
};

export type ClientAccount = {
  id: number;
  username: string;
  display_name: string;
  sales_user_id: number | null;
  active: number;
};

const COOKIE = "dmd_session";
const SESSION_DAYS = 7;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string) {
  if (password.length < 8) throw new Error("Mật khẩu cần ít nhất 8 ký tự.");
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return "scrypt:" + salt + ":" + derived;
}

export function verifyPassword(password: string, stored: string) {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const actual = scryptSync(password, parts[1], 64);
  const expected = Buffer.from(parts[2], "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function userCount() {
  return (db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c;
}

export function createUser(input: {
  username: string;
  display_name: string;
  password: string;
  role: UserRole;
  sales_user_id?: number | string | null;
  created_by_user_id?: number | null;
  is_root_admin?: boolean;
}) {
  const username = input.username.trim().toLowerCase();
  const displayName = input.display_name.trim();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error("Username 3-40 ký tự: a-z, 0-9, ., _, -");
  if (!displayName) throw new Error("Tên hiển thị là bắt buộc.");
  let salesUserId: number | null = null;
  if (input.role === "CLIENT") {
    salesUserId = Number(input.sales_user_id || 0);
    const sales = salesUserId
      ? db.prepare("SELECT id FROM users WHERE id=? AND role='SALES' AND active=1").get(salesUserId)
      : undefined;
    if (!sales) throw new Error("Client bắt buộc phải có Sales phụ trách hợp lệ.");
  }
  const result = db.prepare("INSERT INTO users(username,display_name,password_hash,role,sales_user_id,is_root_admin,created_by_user_id) VALUES (?,?,?,?,?,?,?)")
    .run(username, displayName, hashPassword(input.password), input.role, salesUserId, input.is_root_admin ? 1 : 0, input.created_by_user_id || null);
  if (input.role === "CLIENT" && salesUserId) {
    const clientId = Number(result.lastInsertRowid);
    db.prepare("UPDATE orders SET client_user_id=? WHERE client_user_id IS NULL AND sales_user_id=? AND lower(customer)=lower(?)")
      .run(clientId, salesUserId, displayName);
    // Ledger rows are backfilled only when ownership is deterministic through
    // a linked order Tracking. Customer display names are not globally unique.
    db.prepare("UPDATE ledger_entries SET client_user_id=? WHERE client_user_id IS NULL AND reference_type='TRACKING' AND reference_id IN (SELECT tracking FROM orders WHERE client_user_id=?)")
      .run(clientId, clientId);
  }
  return db.prepare("SELECT id,username,display_name,role,sales_user_id,active,is_root_admin,created_at FROM users WHERE id=?").get(result.lastInsertRowid);
}

export function getClientAccount(id: unknown, activeOnly = false): ClientAccount | undefined {
  const clientId = Number(id || 0);
  if (!Number.isInteger(clientId) || clientId <= 0) return undefined;
  return db.prepare(
    "SELECT id,username,display_name,sales_user_id,active FROM users WHERE id=? AND role='CLIENT'" + (activeOnly ? " AND active=1" : "")
  ).get(clientId) as ClientAccount | undefined;
}

export function canAccessClient(user: AuthUser, client: ClientAccount) {
  if (user.role === "ADMIN") return true;
  if (user.role === "CLIENT") return client.id === user.id;
  if (user.role === "WAREHOUSE") return false;
  return client.sales_user_id === user.id;
}

export function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  db.prepare("DELETE FROM sessions WHERE datetime(expires_at) <= CURRENT_TIMESTAMP").run();
  db.prepare("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES (?,?,?)")
    .run(userId, tokenHash(token), expires.toISOString());
  return { token, expires };
}

export function setSessionCookie(response: NextResponse, token: string, expires: Date) {
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE, "", { httpOnly:true, sameSite:"lax", path:"/", expires:new Date(0) });
}

export function currentUser(req: NextRequest): AuthUser | null {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return null;
  const user = db.prepare(
    "SELECT u.id,u.username,u.display_name,u.role,u.sales_user_id,u.active,u.is_root_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND datetime(s.expires_at) > CURRENT_TIMESTAMP AND u.active=1"
  ).get(tokenHash(token)) as AuthUser | undefined;
  return user || null;
}

export function requireUser(req: NextRequest, role?: UserRole) {
  const user = currentUser(req);
  if (!user) return { error: NextResponse.json({ error:"Unauthorized" }, { status:401 }) };
  if (role && user.role !== role) return { error: NextResponse.json({ error:"Forbidden" }, { status:403 }) };
  return { user };
}

export function requireAnyRole(req:NextRequest,roles:UserRole[]){
  const user=currentUser(req);
  if(!user)return {error:NextResponse.json({error:"Unauthorized"},{status:401})};
  if(!roles.includes(user.role))return {error:NextResponse.json({error:"Forbidden"},{status:403})};
  return {user};
}

export function publicUser(user: AuthUser) {
  return { id:user.id, username:user.username, display_name:user.display_name, role:user.role, sales_user_id:user.sales_user_id, is_root_admin:user.is_root_admin };
}

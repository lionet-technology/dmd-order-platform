import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";

export type UserRole = "ADMIN" | "SALES";
export type AuthUser = {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
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
  created_by_user_id?: number | null;
}) {
  const username = input.username.trim().toLowerCase();
  const displayName = input.display_name.trim();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error("Username 3-40 ký tự: a-z, 0-9, ., _, -");
  if (!displayName) throw new Error("Tên hiển thị là bắt buộc.");
  const result = db.prepare("INSERT INTO users(username,display_name,password_hash,role,created_by_user_id) VALUES (?,?,?,?,?)")
    .run(username, displayName, hashPassword(input.password), input.role, input.created_by_user_id || null);
  return db.prepare("SELECT id,username,display_name,role,active,created_at FROM users WHERE id=?").get(result.lastInsertRowid);
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
    "SELECT u.id,u.username,u.display_name,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND datetime(s.expires_at) > CURRENT_TIMESTAMP AND u.active=1"
  ).get(tokenHash(token)) as AuthUser | undefined;
  return user || null;
}

export function requireUser(req: NextRequest, role?: UserRole) {
  const user = currentUser(req);
  if (!user) return { error: NextResponse.json({ error:"Unauthorized" }, { status:401 }) };
  if (role && user.role !== role) return { error: NextResponse.json({ error:"Forbidden" }, { status:403 }) };
  return { user };
}

export function publicUser(user: AuthUser) {
  return { id:user.id, username:user.username, display_name:user.display_name, role:user.role };
}

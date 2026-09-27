import { NextRequest } from "next/server";

export function pageParams(req: NextRequest) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(req.nextUrl.searchParams.get("pageSize") || 20) || 20));
  const q = String(req.nextUrl.searchParams.get("q") || "").trim();
  return { page, pageSize, q, offset: (page - 1) * pageSize };
}

export function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

import {withFinancialPrivacy} from "@/lib/financial-privacy";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
export const runtime="nodejs";
async function handlePOST(req: NextRequest) {
  const token=req.cookies.get("dmd_session")?.value;
  if(token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(createHash("sha256").update(token).digest("hex"));
  const res=NextResponse.json({ok:true});
  clearSessionCookie(res);
  return res;
}

export const POST=withFinancialPrivacy(handlePOST);

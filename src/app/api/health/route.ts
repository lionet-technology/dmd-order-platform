import {withFinancialPrivacy} from "@/lib/financial-privacy";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

async function handleGET() {
  try {
    db.prepare("SELECT 1").get();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

export const GET=withFinancialPrivacy(handleGET);

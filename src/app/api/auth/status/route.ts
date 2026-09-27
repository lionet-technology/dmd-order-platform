import { NextRequest, NextResponse } from "next/server";
import { currentUser, publicUser, userCount } from "@/lib/auth";
export const runtime="nodejs";
export async function GET(req: NextRequest) {
  const user=currentUser(req);
  return NextResponse.json({ setup_required:userCount()===0, user:user?publicUser(user):null });
}

export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  return NextResponse.json({ data: await db.getAccounts() });
}
export async function POST(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  const { name, whop_api_key, whop_company_id, webhook_secret = "" } = await req.json();
  if (!name || !whop_api_key || !whop_company_id) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const accs = await db.getAccounts();
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 30);
  await db.saveAccount({ id, name, whop_api_key, whop_company_id, webhook_secret, created_at: new Date().toISOString(), status: "active", color: db.getNextColor(accs) });
  await db.log(id, "account", `Created "${name}"`);
  return NextResponse.json({ success: true, id });
}
export async function PATCH(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  const { id, ...u } = await req.json();
  const a = await db.getAccount(id); if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (u.name) a.name = u.name; if (u.whop_api_key) a.whop_api_key = u.whop_api_key;
  if (u.whop_company_id) a.whop_company_id = u.whop_company_id;
  if (u.webhook_secret !== undefined) a.webhook_secret = u.webhook_secret;
  if (u.status) a.status = u.status;
  await db.saveAccount(a);
  return NextResponse.json({ success: true });
}
export async function DELETE(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  const id = new URL(req.url).searchParams.get("id")!;
  await db.deleteAccount(id);
  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getWhop } from "@/lib/whop";

// GET — fetch all orders from Whop
export async function GET(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  const aid = new URL(req.url).searchParams.get("account_id");
  if (!aid) return NextResponse.json({ error: "account_id required" }, { status: 400 });
  const acc = await db.getAccount(aid);
  if (!acc) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const whop = getWhop(acc);
  let allPayments: any[] = [];
  let page = 1;
  try {
    while (page <= 10) {
      const result = await whop.payments.list({ company_id: acc.whop_company_id, per: 50, page });
      const payments = result?.data || [];
      if (payments.length === 0) break;
      allPayments = allPayments.concat(payments);
      if (payments.length < 50) break;
      if (result?.pagination?.next_page) page = result.pagination.next_page; else page++;
    }
  } catch (err: any) {
    return NextResponse.json({ error: "Failed: " + err.message }, { status: 500 });
  }
  const existing = await db.getCustomers(aid);
  const existingIds = new Set(existing.map(c => c.member_id));
  const orders = allPayments.map((p: any) => {
    let amount = p.final_amount ?? p.subtotal ?? 0;
    if (typeof amount === "number" && amount > 500) amount = amount / 100;
    const status = (p.status || "").toLowerCase();
    let pDate: Date | null = null;
    if (typeof p.created_at === "number") pDate = new Date(p.created_at * 1000);
    else if (p.created_at) pDate = new Date(p.created_at);
    const memberId = p.member_id || p.member?.id || "";
    return {
      id: p.id, member_id: memberId, user_id: p.user_id || p.user?.id || "",
      email: p.user?.email || "", username: p.user?.username || "",
      amount, currency: p.currency || "usd", status,
      plan_id: p.plan_id || p.plan?.id || "", product_id: p.product_id || p.product?.id || "",
      product_name: p.product?.title || "", card_brand: p.card_brand || "", card_last_4: p.card_last_4 || "",
      created_at: pDate ? pDate.toISOString() : "", already_added: existingIds.has(memberId),
    };
  });
  orders.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return NextResponse.json({ orders, total: orders.length });
}

// POST — add single order OR auto-add ALL paid customers
export async function POST(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  const body = await req.json();
  
  // Auto-add ALL paid customers
  if (body.action === "auto_add_all") {
    const aid = body.account_id;
    if (!aid) return NextResponse.json({ error: "account_id required" }, { status: 400 });
    const acc = await db.getAccount(aid);
    if (!acc) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const whop = getWhop(acc);
    
    // Fetch all payments
    let allPayments: any[] = [];
    let page = 1;
    try {
      while (page <= 10) {
        const result = await whop.payments.list({ company_id: acc.whop_company_id, per: 50, page });
        const payments = result?.data || [];
        if (payments.length === 0) break;
        allPayments = allPayments.concat(payments);
        if (payments.length < 50) break;
        if (result?.pagination?.next_page) page = result.pagination.next_page; else page++;
      }
    } catch (err: any) {
      return NextResponse.json({ error: "Failed to fetch: " + err.message }, { status: 500 });
    }

    // Get existing customers
    const existing = await db.getCustomers(aid);
    const existingIds = new Set(existing.map(c => c.member_id));

    // Group by member_id — keep the latest paid payment per member
    const memberPayments: Record<string, any> = {};
    for (const p of allPayments) {
      const mid = p.member_id || p.member?.id || "";
      const status = (p.status || "").toLowerCase();
      if (!mid) continue;
      if (status !== "paid" && status !== "succeeded" && status !== "completed" && status !== "captured") continue;
      if (existingIds.has(mid)) continue; // Skip already added
      if (!memberPayments[mid]) memberPayments[mid] = p;
    }

    let added = 0, skipped = 0, noPM = 0;
    
    for (const [mid, p] of Object.entries(memberPayments)) {
      // Get payment method
      let pmid = "";
      try {
        const pm = await whop.paymentMethods.list({ member_id: mid });
        if (pm.data?.length) pmid = pm.data[0].id;
      } catch {}

      if (!pmid) { noPM++; continue; }

      let amount = p.final_amount ?? p.subtotal ?? 0;
      if (typeof amount === "number" && amount > 500) amount = amount / 100;

      const next = new Date();
      next.setDate(next.getDate() + 30);

      await db.saveCustomer(aid, {
        member_id: mid,
        user_id: p.user_id || p.user?.id || "",
        email: p.user?.email || "",
        username: p.user?.username || "",
        payment_method_id: pmid,
        membership_id: "",
        plan_id: p.plan_id || p.plan?.id || "",
        product_id: p.product_id || p.product?.id || "",
        amount,
        currency: p.currency || "usd",
        rebill_interval_days: 30,
        next_rebill_date: next.toISOString(),
        status: "active",
        created_at: new Date().toISOString(),
        last_charged_at: null,
        total_charged: 0,
        charge_count: 0,
        failed_count: 0,
        notes: "Auto-added",
      });
      added++;
    }

    await db.log(aid, "auto-add", `Auto-added ${added} customers (${noPM} no card, ${Object.keys(memberPayments).length} total)`);
    return NextResponse.json({ success: true, added, no_payment_method: noPM, already_existed: existingIds.size });
  }

  // Single order add
  const { account_id, member_id, email, username, amount, currency, plan_id, product_id } = body;
  if (!account_id || !member_id) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const acc = await db.getAccount(account_id);
  if (!acc) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const existing2 = await db.getCustomer(account_id, member_id);
  if (existing2) return NextResponse.json({ error: "Already added", existing: true }, { status: 400 });
  const whop2 = getWhop(acc);
  let pmid = "";
  try { const pm = await whop2.paymentMethods.list({ member_id }); if (pm.data?.length) pmid = pm.data[0].id; } catch {}
  if (!pmid) return NextResponse.json({ error: "No payment method" }, { status: 400 });
  const next = new Date(); next.setDate(next.getDate() + 30);
  await db.saveCustomer(account_id, {
    member_id, user_id: "", email: email || "", username: username || "",
    payment_method_id: pmid, membership_id: "", plan_id: plan_id || "", product_id: product_id || "",
    amount: amount || 0, currency: currency || "usd", rebill_interval_days: 30,
    next_rebill_date: next.toISOString(), status: "active", created_at: new Date().toISOString(),
    last_charged_at: null, total_charged: 0, charge_count: 0, failed_count: 0, notes: "Added from orders",
  });
  await db.log(account_id, "add", `Added ${email || member_id} — $${amount}`);
  return NextResponse.json({ success: true });
}

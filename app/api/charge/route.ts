export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getWhop } from "@/lib/whop";

// Build payment params — always use custom amount, link to product via product_id
function buildPayment(acc: any, c: any, overrideAmount?: number) {
  const amt = overrideAmount || c.amount;
  const cur = c.currency || "usd";
  
  const params: any = {
    company_id: acc.whop_company_id,
    member_id: c.member_id,
    payment_method_id: c.payment_method_id,
  };

  // Always create inline plan with YOUR custom amount
  // Use product_id to link payment to the product on Whop dashboard
  const plan: any = { initial_price: amt, currency: cur, plan_type: "one_time" };
  
  // If we have product_id, include it so payment shows under the product
  if (c.product_id) {
    plan.product_id = c.product_id;
  }
  
  params.plan = plan;
  return params;
}

export async function POST(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  const { action, account_id, member_id, amount, currency } = await req.json();
  const acc = await db.getAccount(account_id); 
  if (!acc) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const whop = getWhop(acc);

  if (action === "charge_single") {
    const c = await db.getCustomer(account_id, member_id); 
    if (!c?.payment_method_id) return NextResponse.json({ error: "No payment method" }, { status: 400 });
    
    const amt = amount || c.amount;
    try {
      const params = buildPayment(acc, c, amount);
      const p = await whop.payments.create(params);
      
      await db.addCharge(account_id, { 
        id: `chg_${Date.now()}`, member_id, email: c.email, payment_id: p.id, 
        amount: amt, currency: c.currency || "usd", status: "pending", type: "manual", 
        created_at: new Date().toISOString(), account_id, account_name: acc.name 
      });
      await db.log(account_id, "charge", `$${amt} → ${c.email || member_id}${c.plan_id ? " (plan)" : c.product_id ? " (product)" : ""}`);
      return NextResponse.json({ success: true, payment_id: p.id, amount: amt });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Charge failed" }, { status: 400 });
    }
  }
  
  if (action === "charge_all_due") {
    const due = await db.getDueCustomers(account_id); let ok = 0, fail = 0;
    for (const c of due) { 
      try {
        const params = buildPayment(acc, c);
        const p = await whop.payments.create(params);
        const n = new Date(); n.setDate(n.getDate() + c.rebill_interval_days); 
        c.next_rebill_date = n.toISOString(); await db.saveCustomer(account_id, c);
        await db.addCharge(account_id, { 
          id: `chg_${Date.now()}_${c.member_id}`, member_id: c.member_id, email: c.email, 
          payment_id: p.id, amount: c.amount, currency: c.currency, status: "pending", 
          type: "auto", created_at: new Date().toISOString(), account_id, account_name: acc.name 
        });
        ok++; 
      } catch { fail++; } 
    }
    await db.log(account_id, "charge", `Bulk ${ok}/${due.length}`);
    return NextResponse.json({ success: true, charged: ok, failed: fail });
  }
  
  if (action === "retry_failed") {
    const all = await db.getCustomers(account_id); let ok = 0;
    for (const c of all.filter(c => c.status === "failed" && c.payment_method_id)) { 
      try {
        const params = buildPayment(acc, c);
        await whop.payments.create(params);
        c.status = "active"; c.failed_count = 0; await db.saveCustomer(account_id, c); ok++; 
      } catch {} 
    }
    return NextResponse.json({ success: true, retried: ok });
  }
  
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

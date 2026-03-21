export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { db } = await import("@/lib/db");
    const { getWhop } = await import("@/lib/whop");
    const accs = await db.getAccounts(); let ok = 0, fail = 0;
    for (const acc of accs.filter((a: any) => a.status === "active")) {
      const whop = getWhop(acc);
      for (const c of await db.getDueCustomers(acc.id)) {
        try {
          const payParams: any = { company_id: acc.whop_company_id, member_id: c.member_id, payment_method_id: c.payment_method_id };
          const plan: any = { initial_price: c.amount, currency: c.currency, plan_type: "one_time" };
          if (c.product_id) plan.product_id = c.product_id;
          payParams.plan = plan;
          const p = await whop.payments.create(payParams);
          const n = new Date(); n.setDate(n.getDate() + c.rebill_interval_days); c.next_rebill_date = n.toISOString(); await db.saveCustomer(acc.id, c);
          await db.addCharge(acc.id, { id: `chg_${Date.now()}`, member_id: c.member_id, email: c.email, payment_id: p.id, amount: c.amount, currency: c.currency, status: "pending", type: "auto", created_at: new Date().toISOString(), account_id: acc.id, account_name: acc.name });
          ok++;
        } catch { fail++; }
      }
    }
    return NextResponse.json({ ok, fail });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, note: "KV not configured" }, { status: 200 });
  }
}

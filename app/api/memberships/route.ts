export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getWhop } from "@/lib/whop";

export async function GET(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  const aid = new URL(req.url).searchParams.get("account_id")!;
  return NextResponse.json({ data: await db.getCustomers(aid), charges: await db.getCharges(aid, 200), activity: await db.getActivity(aid, 50) });
}

export async function POST(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  const { account_id, member_id, amount, currency = "usd", rebill_interval_days = 30, email = "", notes = "", plan_id = "", product_id = "" } = await req.json();
  if (!account_id || !member_id || !amount) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const acc = await db.getAccount(account_id);
  if (!acc) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  
  const w = getWhop(acc);
  
  // 1. Get payment method for this member
  let pmid = ""; 
  try { 
    const m = await w.paymentMethods.list({ member_id }); 
    if (m.data?.length) pmid = m.data[0].id; 
  } catch (err: any) {
    console.error("Payment method lookup failed:", err?.message);
  }
  if (!pmid) return NextResponse.json({ error: "No saved payment method for this member on this account" }, { status: 400 });
  
  // 2. Auto-detect plan_id, product_id, email from member's membership or payments
  let detectedPlanId = plan_id;
  let detectedProductId = product_id;
  let detectedEmail = email;
  let detectedUsername = "";
  let detectedMembershipId = "";

  // Try to get member's membership first (most reliable for plan/product)
  if (!detectedPlanId) {
    try {
      // Try fetching the membership directly
      const memberships = await w.memberships.list({ 
        company_id: acc.whop_company_id, 
        per: 50 
      });
      if (memberships?.data) {
        const memberMembership = memberships.data.find((m: any) => 
          m.member_id === member_id || m.id === member_id
        );
        if (memberMembership) {
          detectedPlanId = memberMembership.plan_id || memberMembership.plan?.id || "";
          detectedProductId = memberMembership.product_id || memberMembership.product?.id || "";
          detectedMembershipId = memberMembership.id || "";
          if (memberMembership.user?.email) detectedEmail = memberMembership.user.email;
          if (memberMembership.user?.username) detectedUsername = memberMembership.user.username;
        }
      }
    } catch (err: any) {
      console.error("Membership lookup:", err?.message);
    }
  }

  // Fallback: search payments for this member (paginate to find them)
  if (!detectedPlanId) {
    try {
      let page = 1;
      let found = false;
      while (!found && page <= 5) {
        const payments = await w.payments.list({ 
          company_id: acc.whop_company_id, 
          per: 50,
          page 
        });
        if (!payments?.data?.length) break;
        
        for (const p of payments.data) {
          if (p.member_id === member_id || p.user_id === member_id) {
            if (p.status === "paid" || p.status === "succeeded" || p.status === "completed" || p.status === "captured") {
              detectedPlanId = p.plan_id || "";
              detectedProductId = p.product_id || "";
              if (!detectedEmail && p.user?.email) detectedEmail = p.user.email;
              if (p.user?.username) detectedUsername = p.user.username;
              found = true;
              break;
            }
          }
        }
        page++;
      }
    } catch (err: any) {
      console.error("Payment lookup:", err?.message);
    }
  }
  
  const next = new Date(); next.setDate(next.getDate() + rebill_interval_days);
  await db.saveCustomer(account_id, { 
    member_id, user_id: "", email: detectedEmail, username: detectedUsername, 
    payment_method_id: pmid, membership_id: detectedMembershipId, 
    plan_id: detectedPlanId, product_id: detectedProductId,
    amount, currency, rebill_interval_days, 
    next_rebill_date: next.toISOString(), status: "active", 
    created_at: new Date().toISOString(), last_charged_at: null, 
    total_charged: 0, charge_count: 0, failed_count: 0, notes 
  });
  
  const planInfo = detectedPlanId ? ` → plan: ${detectedPlanId}` : " → no plan found (rebill won't show product name)";
  await db.log(account_id, "customer", `Added ${detectedEmail || member_id} — $${amount}/${rebill_interval_days}d${planInfo}`);
  return NextResponse.json({ 
    success: true, 
    plan_id: detectedPlanId, 
    product_id: detectedProductId,
    email: detectedEmail,
    warning: !detectedPlanId ? "No plan_id found — rebill won't be linked to a product. You can set it manually in customer settings." : undefined
  });
}

export async function PATCH(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  const { account_id, member_id, ...u } = await req.json();
  const c = await db.getCustomer(account_id, member_id); 
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (u.amount !== undefined) c.amount = u.amount; 
  if (u.currency) c.currency = u.currency;
  if (u.rebill_interval_days) c.rebill_interval_days = u.rebill_interval_days;
  if (u.status) c.status = u.status; 
  if (u.notes !== undefined) c.notes = u.notes;
  if (u.plan_id !== undefined) c.plan_id = u.plan_id;
  if (u.product_id !== undefined) c.product_id = u.product_id;
  await db.saveCustomer(account_id, c); 
  await db.log(account_id, "update", `Updated ${c.email || member_id}`);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  const p = new URL(req.url).searchParams;
  await db.deleteCustomer(p.get("account_id")!, p.get("member_id")!);
  return NextResponse.json({ success: true });
}

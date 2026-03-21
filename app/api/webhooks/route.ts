export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhop } from "@/lib/whop";

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    const data = JSON.parse(raw);
    const { type } = data;
    const d = data.data || data;

    // Log every webhook for debugging
    await db.logWebhook(type, { company: d.company?.id || d.company_id, member: d.member?.id || d.member_id, user_email: d.user?.email, status: d.status, amount: d.final_amount || d.subtotal });

    // Find which account this webhook belongs to
    const cid = d.company?.id || d.company_id || d.membership?.company_id || d.payment?.company_id || "";
    let acc = cid ? await db.getAccountByCompanyId(cid) : null;
    if (!acc) { const accs = await db.getAccounts(); if (accs.length === 1) acc = accs[0]; }
    if (!acc) return NextResponse.json({ ok: true });
    const aid = acc.id;
    const whop = getWhop(acc);

    // ─── PAYMENT SUCCEEDED ───
    // Auto-add customer if not exists, update if exists
    if (type === "payment.succeeded") {
      const mid = d.member?.id || d.member_id;
      const user = d.user || d.member?.user || {};
      const email = user.email || d.email || "";
      const username = user.username || "";
      const userId = user.id || d.user_id || "";
      
      // Get amount — Whop returns in cents for API, dollars for some fields
      let amount = d.final_amount ?? d.subtotal ?? d.amount ?? 0;
      if (typeof amount === "number" && amount > 500) amount = amount / 100; // likely cents
      const currency = d.currency || "usd";
      
      // Get plan & product info
      const planId = d.plan?.id || d.plan_id || "";
      const productId = d.product?.id || d.product_id || "";
      const membershipId = d.membership?.id || d.membership_id || "";

      if (mid) {
        let c = await db.getCustomer(aid, mid);
        
        if (c) {
          // Existing customer — update
          c.status = "active";
          c.last_charged_at = new Date().toISOString();
          c.total_charged += amount;
          c.charge_count++;
          c.failed_count = 0;
          // Update plan/product if we got new ones
          if (planId && !c.plan_id) c.plan_id = planId;
          if (productId && !c.product_id) c.product_id = productId;
          if (email && !c.email) c.email = email;
          if (username && !c.username) c.username = username;
          // Set next rebill
          const n = new Date();
          n.setDate(n.getDate() + c.rebill_interval_days);
          c.next_rebill_date = n.toISOString();
          await db.saveCustomer(aid, c);
          await db.log(aid, "payment", `✅ $${amount} from ${email || mid}`);
        } else {
          // NEW customer — auto-add with all info for rebilling
          let pmid = "";
          try {
            const pm = await whop.paymentMethods.list({ member_id: mid });
            if (pm.data?.length) pmid = pm.data[0].id;
          } catch {}

          const nextRebill = new Date();
          nextRebill.setDate(nextRebill.getDate() + 30);

          await db.saveCustomer(aid, {
            member_id: mid,
            user_id: userId,
            email,
            username,
            payment_method_id: pmid,
            membership_id: membershipId,
            plan_id: planId,
            product_id: productId,
            amount, // Use same amount as original purchase
            currency,
            rebill_interval_days: 30,
            next_rebill_date: nextRebill.toISOString(),
            status: "active",
            created_at: new Date().toISOString(),
            last_charged_at: new Date().toISOString(),
            total_charged: amount,
            charge_count: 1,
            failed_count: 0,
            notes: "Auto-added from webhook",
          });
          await db.log(aid, "auto-add", `🆕 ${email || mid} — $${amount} — payment method: ${pmid ? "✅" : "❌"}`);
        }
      }
    }

    // ─── PAYMENT FAILED ───
    if (type === "payment.failed") {
      const mid = d.member?.id || d.member_id;
      if (mid) {
        const c = await db.getCustomer(aid, mid);
        if (c) {
          c.failed_count++;
          const retry = new Date();
          retry.setDate(retry.getDate() + 3); // Retry in 3 days
          c.next_rebill_date = retry.toISOString();
          if (c.failed_count >= 3) c.status = "failed";
          await db.saveCustomer(aid, c);
          await db.log(aid, "failed", `❌ ${c.email || mid} — attempt ${c.failed_count}`);
        }
      }
    }

    // ─── SETUP INTENT SUCCEEDED (card saved) ───
    if (type === "setup_intent.succeeded") {
      const mid = d.member?.id || d.member_id;
      const pmid = d.payment_method?.id || d.payment_method_id;
      if (mid && pmid) {
        let c = await db.getCustomer(aid, mid);
        if (c) {
          c.payment_method_id = pmid;
          await db.saveCustomer(aid, c);
          await db.log(aid, "card", `💳 Card saved for ${c.email || mid}`);
        } else {
          // New member saved card — add them
          const user = d.user || d.member?.user || {};
          const nextRebill = new Date();
          nextRebill.setDate(nextRebill.getDate() + 30);
          
          await db.saveCustomer(aid, {
            member_id: mid,
            user_id: user.id || "",
            email: user.email || "",
            username: user.username || "",
            payment_method_id: pmid,
            membership_id: "",
            plan_id: "",
            product_id: "",
            amount: 0, // Will need to set amount manually or from first payment
            currency: "usd",
            rebill_interval_days: 30,
            next_rebill_date: nextRebill.toISOString(),
            status: "paused", // Paused until amount is set
            created_at: new Date().toISOString(),
            last_charged_at: null,
            total_charged: 0,
            charge_count: 0,
            failed_count: 0,
            notes: "Card saved — set amount to activate",
          });
          await db.log(aid, "card-new", `💳 New card saved: ${user.email || mid}`);
        }
      }
    }

    // ─── MEMBERSHIP ACTIVATED ───
    if (type === "membership.activated" || type === "membership.went_valid") {
      const mid = d.member?.id || d.member_id;
      const user = d.user || d.member?.user || {};
      if (mid && !(await db.getCustomer(aid, mid))) {
        let pmid = "";
        try {
          const pm = await whop.paymentMethods.list({ member_id: mid });
          if (pm.data?.length) pmid = pm.data[0].id;
        } catch {}

        const planId = d.plan?.id || d.plan_id || "";
        const productId = d.product?.id || d.product_id || "";

        const nextRebill = new Date();
        nextRebill.setDate(nextRebill.getDate() + 30);

        await db.saveCustomer(aid, {
          member_id: mid,
          user_id: user.id || "",
          email: user.email || "",
          username: user.username || "",
          payment_method_id: pmid,
          membership_id: d.id || "",
          plan_id: planId,
          product_id: productId,
          amount: 0,
          currency: "usd",
          rebill_interval_days: 30,
          next_rebill_date: nextRebill.toISOString(),
          status: pmid ? "active" : "paused",
          created_at: new Date().toISOString(),
          last_charged_at: null,
          total_charged: 0,
          charge_count: 0,
          failed_count: 0,
          notes: pmid ? "Auto-added from membership" : "No payment method — needs card",
        });
        await db.log(aid, "member", `🆕 ${user.email || mid} — ${pmid ? "ready to rebill" : "no card"}`);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ ok: true }); // Always return 200 to Whop
  }
}

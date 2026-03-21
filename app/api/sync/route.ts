export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getWhop } from "@/lib/whop";

export async function POST(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  try {
    const { account_id } = await req.json();
    const acc = await db.getAccount(account_id);
    if (!acc) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const whop = getWhop(acc);
    let allPayments: any[] = [];
    let page = 1;
    let hasMore = true;

    // Use official SDK: client.payments.list({ company_id })
    while (hasMore && page <= 20) {
      try {
        const result = await whop.payments.list({
          company_id: acc.whop_company_id,
          per: 50,
          page,
        });
        const payments = result?.data || [];
        if (payments.length === 0) { hasMore = false; break; }
        allPayments = allPayments.concat(payments);
        if (payments.length < 50) hasMore = false;
        // Check pagination
        if (result?.pagination?.next_page) { page = result.pagination.next_page; }
        else { page++; if (!result?.pagination?.total_pages || page > result.pagination.total_pages) hasMore = false; }
      } catch (err: any) {
        // If SDK fails, break
        console.error("Sync page error:", err?.message);
        hasMore = false;
      }
    }

    // Process payments — Whop returns amounts in CENTS
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const last30Date = new Date(now.getTime() - 30 * 86400000);
    const last7Date = new Date(now.getTime() - 7 * 86400000);

    let allTimeRevenue = 0, monthlyRevenue = 0, weeklyRevenue = 0, dailyRevenue = 0;
    let total = 0, succeeded = 0, failed = 0, refunded = 0;
    const dailyMap: Record<string, number> = {};
    const recentPayments: any[] = [];

    for (const p of allPayments) {
      // Whop API returns final_amount in cents
      const amountCents = p.final_amount ?? p.subtotal ?? 0;
      const amount = amountCents / 100; // Convert to dollars
      const status = (p.status || "").toLowerCase();
      
      // created_at can be unix timestamp (number) or ISO string
      let pDate: Date | null = null;
      if (typeof p.created_at === "number") pDate = new Date(p.created_at * 1000);
      else if (p.created_at) pDate = new Date(p.created_at);
      else if (p.paid_at) pDate = new Date(p.paid_at);
      
      const dateStr = pDate ? pDate.toISOString().split("T")[0] : "";

      total++;
      const isPaid = status === "paid" || status === "succeeded" || status === "completed" || status === "captured";
      const isFailed = status === "failed" || status === "declined" || status === "draft";
      const isRefunded = status === "refunded";

      if (isPaid && amount > 0) {
        succeeded++;
        allTimeRevenue += amount;
        if (dateStr === todayStr) dailyRevenue += amount;
        if (pDate && pDate >= last30Date) monthlyRevenue += amount;
        if (pDate && pDate >= last7Date) weeklyRevenue += amount;
        if (dateStr) dailyMap[dateStr] = (dailyMap[dateStr] || 0) + amount;
      }
      if (isFailed) failed++;
      if (isRefunded) { refunded++; }

      // Build recent list
      if (recentPayments.length < 100) {
        recentPayments.push({
          id: p.id,
          membership_id: p.membership_id || "",
          user_id: p.user_id || "",
          product_id: p.product_id || "",
          plan_id: p.plan_id || "",
          amount,
          currency: p.currency || "usd",
          status: isPaid ? "paid" : isFailed ? "failed" : isRefunded ? "refunded" : status,
          card_brand: p.card_brand || "",
          card_last_4: p.card_last_4 || "",
          created_at: pDate ? pDate.toISOString() : "",
          paid_at: p.paid_at || "",
          refunded_amount: (p.refunded_amount || 0) / 100,
        });
      }
    }

    // Build 7-day chart
    const last7Days: { date: string; amount: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      last7Days.push({ date: ds, amount: dailyMap[ds] || 0 });
    }

    // Build 30-day chart
    const last30Days: { date: string; amount: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      last30Days.push({ date: ds, amount: dailyMap[ds] || 0 });
    }

    const syncData = {
      account_id, synced_at: now.toISOString(),
      allTimeRevenue, monthlyRevenue, weeklyRevenue, dailyRevenue,
      totalPayments: total, succeededPayments: succeeded, failedPayments: failed, refundedPayments: refunded,
      successRate: total > 0 ? Math.round((succeeded / total) * 100) : 0,
      last7Days, last30Days, recentPayments,
    };

    await db.saveSyncData(account_id, syncData);
    await db.log(account_id, "sync", `Synced ${total} payments — $${allTimeRevenue.toFixed(2)} all-time`);

    return NextResponse.json({ success: true, ...syncData });
  } catch (err: any) {
    console.error("Sync error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  const aid = new URL(req.url).searchParams.get("account_id");
  if (!aid) return NextResponse.json({ error: "account_id required" }, { status: 400 });
  return NextResponse.json({ data: await db.getSyncData(aid) });
}

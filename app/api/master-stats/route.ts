export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const e = await auth(req); if (e) return e;
  try {
    const accounts = await db.getAccounts();
    const allSync = await db.getAllSyncData();

    let dailyRev = 0, weeklyRev = 0, monthlyRev = 0, allTimeRev = 0;
    let totalPayments = 0, totalSucceeded = 0, totalFailed = 0, totalRefunded = 0;
    const combined7: Record<string, number> = {};
    const perAccount: any[] = [];

    for (const acc of accounts) {
      const sync = allSync.find(s => s.account_id === acc.id);
      const customers = await db.getCustomers(acc.id);
      const now = new Date();
      const active = customers.filter(c => c.status === "active").length;
      const due = customers.filter(c => c.status === "active" && c.amount > 0 && c.payment_method_id && new Date(c.next_rebill_date) <= now).length;
      const mrr = customers.filter(c => c.status === "active").reduce((s, c) => s + (c.amount * 30 / (c.rebill_interval_days || 30)), 0);

      if (sync) {
        dailyRev += sync.dailyRevenue || 0;
        weeklyRev += sync.weeklyRevenue || 0;
        monthlyRev += sync.monthlyRevenue || 0;
        allTimeRev += sync.allTimeRevenue || 0;
        totalPayments += sync.totalPayments || 0;
        totalSucceeded += sync.succeededPayments || 0;
        totalFailed += sync.failedPayments || 0;
        totalRefunded += sync.refundedPayments || 0;
        for (const d of (sync.last7Days || [])) combined7[d.date] = (combined7[d.date] || 0) + d.amount;
      }

      perAccount.push({
        id: acc.id, name: acc.name, color: acc.color || "#6366f1", status: acc.status,
        customers: customers.length, active, due, mrr,
        dailyRevenue: sync?.dailyRevenue || 0,
        weeklyRevenue: sync?.weeklyRevenue || 0,
        monthlyRevenue: sync?.monthlyRevenue || 0,
        allTimeRevenue: sync?.allTimeRevenue || 0,
        totalPayments: sync?.totalPayments || 0,
        successRate: sync?.successRate || 0,
        synced_at: sync?.synced_at || null,
      });
    }

    const last7Days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const ds = d.toISOString().split("T")[0]; last7Days.push({ date: ds, amount: combined7[ds] || 0 }); }

    // Combine recent payments
    const allRecent: any[] = [];
    for (const s of allSync) for (const p of (s.recentPayments || []).slice(0, 15)) allRecent.push({ ...p, account_name: s.account_name, account_color: s.account_color });
    allRecent.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({
      totals: { dailyRevenue: dailyRev, weeklyRevenue: weeklyRev, monthlyRevenue: monthlyRev, allTimeRevenue: allTimeRev, totalPayments, totalSucceeded, totalFailed, totalRefunded, successRate: totalPayments > 0 ? Math.round((totalSucceeded / totalPayments) * 100) : 0 },
      perAccount, last7Days,
      recentPayments: allRecent.slice(0, 30),
      recentActivity: (await db.getGlobalActivity(20)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

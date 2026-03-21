// No top-level import of @vercel/kv — it crashes without env vars during build

let _kv: any = null;
async function kv() {
  if (!_kv) {
    const mod = await import("@vercel/kv");
    _kv = mod.kv;
  }
  return _kv;
}

export interface Account {
  id: string; name: string; whop_api_key: string; whop_company_id: string;
  webhook_secret: string; created_at: string; status: "active" | "paused"; color: string;
}
export interface Customer {
  member_id: string; user_id: string; email: string; username: string;
  payment_method_id: string; membership_id: string; plan_id: string; product_id: string;
  amount: number; currency: string; rebill_interval_days: number;
  next_rebill_date: string; status: "active" | "paused" | "failed" | "cancelled";
  created_at: string; last_charged_at: string | null;
  total_charged: number; charge_count: number; failed_count: number; notes: string;
}
export interface Charge {
  id: string; member_id: string; email: string; payment_id: string;
  amount: number; currency: string; status: "succeeded" | "failed" | "pending";
  type: "auto" | "manual" | "retry";
  created_at: string; failure_reason?: string;
  account_id: string; account_name: string;
}
export interface Activity {
  id: string; action: string; details: string; created_at: string; account_id: string;
}

const ACCOUNTS = "rebb:accounts";
const ck = (a: string) => `rebb:${a}:cust`;
const chk = (a: string) => `rebb:${a}:charges`;
const ak = (a: string) => `rebb:${a}:activity`;
const GC = "rebb:g:charges";
const GA = "rebb:g:activity";
const COLORS = ["#6366f1","#22c55e","#f59e0b","#ef4444","#ec4899","#06b6d4","#8b5cf6","#f97316"];

export const db = {
  async getAccounts(): Promise<Account[]> { const k = await kv(); const d = await k.hgetall(ACCOUNTS); return d ? Object.values(d) as Account[] : []; },
  async getAccount(id: string): Promise<Account | null> { const k = await kv(); return (await k.hget(ACCOUNTS, id) as Account) || null; },
  async saveAccount(a: Account) { const k = await kv(); await k.hset(ACCOUNTS, { [a.id]: a }); },
  async deleteAccount(id: string) { const k = await kv(); await k.hdel(ACCOUNTS, id); },
  async getAccountByCompanyId(cid: string): Promise<Account | null> { return (await this.getAccounts()).find(a => a.whop_company_id === cid) || null; },
  getNextColor(accs: Account[]) { return COLORS[accs.length % COLORS.length]; },

  async getCustomers(aid: string): Promise<Customer[]> { const k = await kv(); const d = await k.hgetall(ck(aid)); return d ? Object.values(d) as Customer[] : []; },
  async getCustomer(aid: string, mid: string): Promise<Customer | null> { const k = await kv(); return (await k.hget(ck(aid), mid) as Customer) || null; },
  async saveCustomer(aid: string, c: Customer) { const k = await kv(); await k.hset(ck(aid), { [c.member_id]: c }); },
  async deleteCustomer(aid: string, mid: string) { const k = await kv(); await k.hdel(ck(aid), mid); },
  async getDueCustomers(aid: string): Promise<Customer[]> {
    const all = await this.getCustomers(aid); const n = new Date();
    return all.filter(c => c.status === "active" && c.amount > 0 && c.payment_method_id && new Date(c.next_rebill_date) <= n);
  },

  async addCharge(aid: string, ch: Charge) {
    const k = await kv();
    const l = await this.getCharges(aid); l.unshift(ch); if (l.length > 500) l.length = 500; await k.set(chk(aid), l);
    const g = await this.getGlobalCharges(); g.unshift(ch); if (g.length > 1000) g.length = 1000; await k.set(GC, g);
  },
  async getCharges(aid: string, lim = 100): Promise<Charge[]> { const k = await kv(); return ((await k.get(chk(aid)) as Charge[]) || []).slice(0, lim); },
  async getGlobalCharges(lim = 200): Promise<Charge[]> { const k = await kv(); return ((await k.get(GC) as Charge[]) || []).slice(0, lim); },

  async saveSyncData(aid: string, data: any) { const k = await kv(); await k.set(`rebb:${aid}:sync`, data); },
  async getSyncData(aid: string): Promise<any | null> { const k = await kv(); return await k.get(`rebb:${aid}:sync`); },
  async getAllSyncData(): Promise<any[]> {
    const accs = await this.getAccounts(); const r = [];
    for (const a of accs) { const s = await this.getSyncData(a.id); if (s) r.push({ ...s, account_name: a.name, account_color: a.color }); }
    return r;
  },

  async log(aid: string, action: string, details: string) {
    const k = await kv();
    const e = { id: `log_${Date.now()}`, action, details, created_at: new Date().toISOString(), account_id: aid };
    const l = await this.getActivity(aid); l.unshift(e); if (l.length > 300) l.length = 300; await k.set(ak(aid), l);
    const g = await this.getGlobalActivity(); g.unshift(e); if (g.length > 500) g.length = 500; await k.set(GA, g);
  },
  async getActivity(aid: string, lim = 50): Promise<Activity[]> { const k = await kv(); return ((await k.get(ak(aid)) as Activity[]) || []).slice(0, lim); },
  async getGlobalActivity(lim = 100): Promise<Activity[]> { const k = await kv(); return ((await k.get(GA) as Activity[]) || []).slice(0, lim); },
  
  // Webhook log for debugging
  async logWebhook(type: string, data: any) {
    const k = await kv();
    const logs = ((await k.get("rebb:webhook_log")) as any[]) || [];
    logs.unshift({ type, data: JSON.stringify(data).slice(0, 500), at: new Date().toISOString() });
    if (logs.length > 50) logs.length = 50;
    await k.set("rebb:webhook_log", logs);
  },
  async getWebhookLog(): Promise<any[]> {
    const k = await kv();
    return ((await k.get("rebb:webhook_log")) as any[]) || [];
  },
};

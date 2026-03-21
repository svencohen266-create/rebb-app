"use client";
import { useState, useEffect, useCallback } from "react";

type Tab = "overview" | "orders" | "sales" | "customers" | "add" | "rebills" | "activity" | "settings";

export default function Page() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [acct, setAcct] = useState<string | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [charges, setCharges] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [activity, setActivity] = useState<any[]>([]);
  const [master, setMaster] = useState<any>(null);
  const [syncData, setSyncData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState(""); const [filt, setFilt] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [eAmt, setEAmt] = useState(""); const [eDays, setEDays] = useState(""); const [eNotes, setENotes] = useState("");
  const [nId, setNId] = useState(""); const [nEmail, setNEmail] = useState(""); const [nAmt, setNAmt] = useState("");
  const [nCur, setNCur] = useState("usd"); const [nDays, setNDays] = useState("30"); const [nNotes, setNNotes] = useState("");
  const [nPlanId, setNPlanId] = useState(""); const [nProductId, setNProductId] = useState("");
  const [modal, setModal] = useState<string | null>(null);
  const [aName, setAName] = useState(""); const [aKey, setAKey] = useState("");
  const [aBiz, setABiz] = useState(""); const [aSecret, setASecret] = useState("");
  const [chgModal, setChgModal] = useState<string | null>(null); const [chgAmt, setChgAmt] = useState("");
  const [mobile, setMobile] = useState(false); const [sideOpen, setSideOpen] = useState(false);

  useEffect(() => { const c = () => setMobile(window.innerWidth < 800); c(); window.addEventListener("resize", c); return () => window.removeEventListener("resize", c); }, []);
  useEffect(() => { const s = typeof window !== "undefined" ? window.localStorage.getItem("rebb_pw") : null; if (s) { setPw(s); setAuthed(true); } }, []);

  const getH = useCallback((): any => ({ "x-admin-password": pw || (typeof window !== "undefined" ? window.localStorage.getItem("rebb_pw") : "") || "", "Content-Type": "application/json" }), [pw]);
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };
  const api = async (u: string, m = "GET", b?: any) => { try { return (await fetch(u, { method: m, headers: getH(), body: b ? JSON.stringify(b) : undefined })).json(); } catch { return { error: "Network error" }; } };

  const loadAccounts = useCallback(async () => { const d = await api("/api/accounts"); if (d.data) setAccounts(d.data); }, [pw]);
  const loadMaster = useCallback(async () => { setLoading(true); const d = await api("/api/master-stats"); if (d.totals) setMaster(d); setLoading(false); }, [pw]);
  const loadAcct = useCallback(async (id: string) => { setLoading(true); const [d, s] = await Promise.all([api("/api/memberships?account_id=" + id), api("/api/sync?account_id=" + id)]); if (d.data) { setCustomers(d.data); setCharges(d.charges || []); setActivity(d.activity || []); } if (s.data) setSyncData(s.data); setLoading(false); }, [pw]);

  const syncAccount = async (aid: string) => { setSyncing(true); const d = await api("/api/sync", "POST", { account_id: aid }); if (d.success) { setSyncData(d); notify("Synced " + d.totalPayments + " payments"); } else notify("Error: " + d.error); setSyncing(false); };
  const loadOrders = async (aid: string) => { setOrdersLoading(true); const d = await api("/api/orders?account_id=" + aid); if (d.orders) setOrders(d.orders); else notify("Error: " + (d.error || "Failed")); setOrdersLoading(false); };
  const addFromOrder = async (o: any) => {
    const d = await api("/api/orders", "POST", { account_id: acct, member_id: o.member_id, email: o.email, username: o.username, amount: o.amount, currency: o.currency, plan_id: o.plan_id, product_id: o.product_id });
    if (d.success) { notify("✅ Added " + (o.email || o.member_id) + " to rebill"); if (acct) loadOrders(acct); loadAcct(acct!); }
    else if (d.existing) notify("Already added");
    else notify("❌ " + (d.error || "Failed"));
  };
  const syncAll = async () => { setSyncing(true); for (const a of accounts) await api("/api/sync", "POST", { account_id: a.id }); notify("All synced"); setSyncing(false); loadMaster(); };
  const login = async () => { const r = await fetch("/api/accounts", { headers: { "x-admin-password": pw } }); if (r.ok) { setAuthed(true); window.localStorage.setItem("rebb_pw", pw); } else notify("Wrong password"); };
  const doLogout = () => { setAuthed(false); setPw(""); window.localStorage.removeItem("rebb_pw"); setAccounts([]); setMaster(null); setAcct(null); };

  useEffect(() => { if (authed) { loadAccounts(); loadMaster(); } }, [authed]);
  useEffect(() => { if (acct) { loadAcct(acct); setTab("sales"); } }, [acct]);
  const goMaster = () => { setAcct(null); setSyncData(null); setTab("overview"); loadMaster(); if (mobile) setSideOpen(false); };
  const goAcct = (id: string) => { setAcct(id); if (mobile) setSideOpen(false); };

  const addAccount = async () => { if (!aName || !aKey || !aBiz) return notify("Fill all fields"); const d = await api("/api/accounts", "POST", { name: aName, whop_api_key: aKey, whop_company_id: aBiz, webhook_secret: aSecret }); if (d.success) { setModal(null); loadAccounts(); notify("Added"); loadMaster(); } else notify(d.error); };
  const delAccount = async (id: string) => { if (!confirm("Delete?")) return; await api("/api/accounts?id=" + id, "DELETE"); if (acct === id) goMaster(); loadAccounts(); loadMaster(); };
  const chargeSingle = async (mid: string, amt?: number) => { const d = await api("/api/charge", "POST", { action: "charge_single", account_id: acct, member_id: mid, amount: amt }); d.success ? notify("Charged $" + d.amount) : notify(d.error); loadAcct(acct!); };
  const chargeAllDue = async () => { const d = await api("/api/charge", "POST", { action: "charge_all_due", account_id: acct }); notify(d.success ? d.charged + " charged" : d.error); loadAcct(acct!); };
  const retryFailed = async () => { const d = await api("/api/charge", "POST", { action: "retry_failed", account_id: acct }); notify(d.success ? d.retried + " retried" : d.error); loadAcct(acct!); };
  const updateCust = async (mid: string, u: any) => { await api("/api/memberships", "PATCH", { account_id: acct, member_id: mid, ...u }); setEditId(null); loadAcct(acct!); notify("Updated"); };
  const removeCust = async (mid: string) => { if (!confirm("Remove?")) return; await api("/api/memberships?account_id=" + acct + "&member_id=" + mid, "DELETE"); loadAcct(acct!); };
  const addCust = async () => { if (!nId || !nAmt) return notify("Member ID & amount required"); const d = await api("/api/memberships", "POST", { account_id: acct, member_id: nId, email: nEmail, amount: parseFloat(nAmt), currency: nCur, rebill_interval_days: parseInt(nDays), notes: nNotes, plan_id: nPlanId, product_id: nProductId }); if (d.success) { setNId(""); setNEmail(""); setNAmt(""); setNNotes(""); setNPlanId(""); setNProductId(""); setTab("customers"); loadAcct(acct!); notify(d.plan_id ? "Added - linked to product" : "Added"); } else notify(d.error); };

  const exportCustomers = () => { if (!customers.length) return notify("No customers"); const h = ["member_id","email","username","amount","currency","status","plan_id","product_id","payment_method_id","rebill_interval_days","next_rebill_date","total_charged","charge_count","notes","created_at"]; const csv = [h.join(",")]; for (const c of customers) csv.push(h.map(k => '"' + ((c[k] ?? "").toString().replace(/"/g, '""')) + '"').join(",")); const b = new Blob([csv.join("\n")], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "customers-" + (acctObj?.name || "all") + ".csv"; a.click(); URL.revokeObjectURL(u); notify("Exported " + customers.length); };
  const exportAll = async () => { let all: any[] = []; for (const acc of accounts) { const d = await api("/api/memberships?account_id=" + acc.id); if (d.data) all = all.concat(d.data.map((c: any) => ({ ...c, account: acc.name }))); } if (!all.length) return notify("No customers"); const h = ["account","member_id","email","amount","status","plan_id","product_id","payment_method_id","total_charged","notes"]; const csv = [h.join(",")]; for (const c of all) csv.push(h.map(k => '"' + ((c[k] ?? "").toString().replace(/"/g, '""')) + '"').join(",")); const b = new Blob([csv.join("\n")], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "all-customers.csv"; a.click(); URL.revokeObjectURL(u); notify("Exported " + all.length); };

  const filtered = customers.filter(c => (!search || (c.email || "").toLowerCase().includes(search.toLowerCase()) || c.member_id.includes(search)) && (filt === "all" || c.status === filt));
  const acctObj = accounts.find(a => a.id === acct);
  const due = customers.filter(c => c.status === "active" && c.amount > 0 && c.payment_method_id && new Date(c.next_rebill_date) <= new Date()).length;
  const $ = (n: number) => n >= 10000 ? "$" + (n/1000).toFixed(1) + "k" : n >= 1 ? "$" + n.toFixed(2) : "$0.00";
  const timeAgo = (d: string) => { if (!d) return ""; const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000); if (s < 60) return "now"; if (s < 3600) return Math.floor(s/60) + "m"; if (s < 86400) return Math.floor(s/3600) + "h"; return Math.floor(s/86400) + "d"; };
  const Badge = ({ s }: { s: string }) => { const c: any = { paid:["#ecfdf5","#059669"],succeeded:["#ecfdf5","#059669"],active:["#ecfdf5","#059669"],failed:["#fef2f2","#dc2626"],paused:["#fffbeb","#d97706"] }; const [bg,fg] = c[s] || ["#f3f4f6","#6b7280"]; return <span style={{display:"inline-block",padding:"2px 8px",borderRadius:6,fontSize:11,fontWeight:600,background:bg,color:fg}}>{s}</span>; };
  const Chart = ({ data, h=140 }: { data:any[];h?:number }) => { if (!data?.length) return null; const mx = Math.max(...data.map(d=>d.amount),0.01); return <div style={{display:"flex",alignItems:"flex-end",gap:mobile?2:5,height:h,padding:"8px 0"}}>{data.map((d,i) => <div key={i} style={{flex:1,display:"flex",flexDirection:"column" as const,alignItems:"center",gap:2}}><span style={{fontSize:9,color:"#8892a4"}}>{d.amount>0?d.amount.toFixed(0):""}</span><div style={{width:"100%",maxWidth:32,height:Math.max((d.amount/mx)*(h-36),3),background:i===data.length-1?"#6366f1":"#e8eaed",borderRadius:5}}/><span style={{fontSize:9,color:"#8892a4"}}>{new Date(d.date+"T12:00:00").toLocaleDateString("en",{weekday:"short"})}</span></div>)}</div>; };

  if (!authed) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0f0f13",fontFamily:"'DM Sans',system-ui",padding:20}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center" as const,marginBottom:32}}>
          <div style={{width:56,height:56,background:"linear-gradient(135deg,#6366f1,#818cf8)",borderRadius:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:24,marginBottom:16}}>🔄</div>
          <h1 style={{fontSize:28,fontWeight:800,color:"#fff",margin:"0 0 6px"}}>Rebb</h1>
          <p style={{color:"#6b7280",fontSize:14,margin:0}}>Multi-Account Rebilling</p>
        </div>
        <div style={{background:"#18181b",border:"1px solid #27272a",borderRadius:16,padding:28}}>
          <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} style={{width:"100%",height:44,background:"#27272a",border:"1px solid #3f3f46",borderRadius:10,padding:"0 14px",fontSize:15,color:"#fff",outline:"none",boxSizing:"border-box" as const}} placeholder="Password"/>
          <button onClick={login} style={{width:"100%",height:44,background:"linear-gradient(135deg,#6366f1,#818cf8)",border:"none",borderRadius:10,fontSize:15,fontWeight:700,color:"#fff",cursor:"pointer",marginTop:12}}>Sign In</button>
        </div>
      </div>
      {toast&&<div style={{position:"fixed" as const,bottom:24,right:24,background:"#18181b",color:"#fff",padding:"12px 20px",borderRadius:10,fontSize:14,fontWeight:600,zIndex:99999}}>{toast}</div>}
    </div>
  );

  return (
    <div style={{display:"flex",minHeight:"100vh",fontFamily:"'DM Sans',system-ui",background:"#f8f9fb",color:"#111827"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box}button:hover{opacity:.85}input:focus,select:focus{border-color:#6366f1!important}`}</style>
      {mobile&&<button onClick={()=>setSideOpen(!sideOpen)} style={{position:"fixed" as const,top:14,left:14,zIndex:10001,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"#fff",borderRadius:10,fontSize:18,boxShadow:"0 1px 4px rgba(0,0,0,.08)",cursor:"pointer"}}>{sideOpen?"✕":"☰"}</button>}
      {(!mobile||sideOpen)&&<aside style={{width:mobile?"85vw":240,maxWidth:280,background:"#fff",borderRight:"1px solid #e5e7eb",display:"flex",flexDirection:"column" as const,position:mobile?"fixed" as const:"relative" as const,top:0,left:0,bottom:0,zIndex:10000,overflowY:"auto" as const}}>
        <div style={{padding:"20px 20px 16px",borderBottom:"1px solid #f3f4f6"}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:36,height:36,background:"linear-gradient(135deg,#6366f1,#818cf8)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🔄</div><div><div style={{fontSize:16,fontWeight:800}}>Rebb</div><div style={{fontSize:10,color:"#9ca3af"}}>Dashboard</div></div></div></div>
        <div style={{padding:"12px 12px 4px"}}><button onClick={goMaster} style={!acct?sAct:sBtn}>📊 Overview</button></div>
        <div style={{padding:"8px 12px 4px"}}><div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase" as const,letterSpacing:1,padding:"4px 8px"}}>Accounts</div></div>
        <div style={{padding:"0 12px"}}>{accounts.map(a=><button key={a.id} onClick={()=>goAcct(a.id)} style={acct===a.id?sAct:sBtn}><span style={{width:8,height:8,borderRadius:"50%",background:a.color||"#6366f1",flexShrink:0}}/>{a.name}</button>)}<button onClick={()=>{setModal("add");setAName("");setAKey("");setABiz("");setASecret("")}} style={{...sBtn,color:"#6366f1"}}>+ Add Account</button></div>
        {acct&&<div style={{padding:"8px 12px",marginTop:4}}><div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase" as const,letterSpacing:1,padding:"4px 8px",marginBottom:2}}>{acctObj?.name}</div>{(([["orders","📦","Orders"],["sales","💳","Sales"],["customers","👥","Customers"],["add","➕","Add Customer"],["rebills","🔁","Rebill Log"],["activity","📋","Activity"],["settings","⚙️","Settings"]])as[Tab,string,string][]).map(([id,ic,lb])=><button key={id} onClick={()=>{setTab(id);if(id==="orders"&&acct)loadOrders(acct)}} style={tab===id?sAct:sBtn}>{ic} {lb}</button>)}</div>}
      </aside>}
      {mobile&&sideOpen&&<div onClick={()=>setSideOpen(false)} style={{position:"fixed" as const,inset:0,background:"rgba(0,0,0,.2)",zIndex:9999}}/>}

      <main style={{flex:1,overflow:"auto" as const,minWidth:0}}>
        <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:mobile?"14px 16px 14px 60px":"16px 28px",borderBottom:"1px solid #e5e7eb",background:"#fff"}}>
          <h2 style={{margin:0,fontSize:mobile?17:20,fontWeight:800}}>{acct?acctObj?.name||"":"Overview"}</h2>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {acct&&<button onClick={()=>syncAccount(acct)} disabled={syncing} style={{...bP,opacity:syncing?.6:1}}>{syncing?"Syncing...":"↻ Sync"}</button>}
            {!acct&&accounts.length>0&&<button onClick={syncAll} disabled={syncing} style={{...bP,opacity:syncing?.6:1}}>{syncing?"Syncing...":"↻ Sync All"}</button>}
            {!acct&&accounts.length>0&&<button onClick={exportAll} style={bO}>📥 Export All</button>}
            <button onClick={()=>{if(acct)loadAcct(acct);else{loadMaster();loadAccounts();}notify("↻ Refreshed")}} style={bO}>↻</button>
            <button onClick={doLogout} style={{...bO,fontSize:12,padding:"8px 12px",color:"#9ca3af"}}>Logout</button>
          </div>
        </header>
        <div style={{padding:mobile?16:28,maxWidth:1200}}>
          {loading&&<div style={{padding:60,textAlign:"center" as const,color:"#9ca3af"}}>Loading...</div>}

          {!acct&&master&&!loading&&<>
            <div style={{display:"grid",gridTemplateColumns:mobile?"1fr 1fr":"repeat(4,1fr)",gap:14}}>
              {[{l:"Today",v:$(master.totals.dailyRevenue),c:"#059669"},{l:"This Week",v:$(master.totals.weeklyRevenue),c:"#7c3aed"},{l:"30 Days",v:$(master.totals.monthlyRevenue),c:"#2563eb"},{l:"All Time",v:$(master.totals.allTimeRevenue),c:"#dc2626"},{l:"Payments",v:master.totals.totalPayments||0,c:"#6366f1"},{l:"Succeeded",v:master.totals.totalSucceeded||0,c:"#059669"},{l:"Failed",v:master.totals.totalFailed||0,c:"#dc2626"},{l:"Rate",v:(master.totals.successRate||0)+"%",c:"#0891b2"}].map((s,i)=><div key={i} style={{background:"#fff",borderRadius:14,padding:"18px 20px",border:"1px solid #e5e7eb"}}><div style={{fontSize:12,color:"#6b7280",fontWeight:600,marginBottom:6}}>{s.l}</div><div style={{fontSize:26,fontWeight:800,color:i<4?s.c:"#111827"}}>{s.v}</div></div>)}
            </div>
            <div style={{...cd,marginTop:18}}><h3 style={{margin:"0 0 8px",fontSize:15,fontWeight:700}}>Revenue — 7 Days</h3><Chart data={master.last7Days||[]}/></div>
            <div style={{...cd,marginTop:18}}><h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:700}}>Accounts</h3>
              {accounts.length===0?<div style={{textAlign:"center" as const,padding:40,color:"#9ca3af"}}><button onClick={()=>setModal("add")} style={bP}>+ Add Account</button></div>:
              <table style={{width:"100%",fontSize:13}}><thead><tr>{["Account","Today","30 Days","All Time","Payments","Rate",""].map((h,i)=><th key={i} style={{padding:10,textAlign:"left" as const,fontSize:11,color:"#9ca3af",fontWeight:600,borderBottom:"1px solid #f3f4f6"}}>{h}</th>)}</tr></thead><tbody>{(master.perAccount||[]).map((a:any)=><tr key={a.id} style={{cursor:"pointer"}} onClick={()=>goAcct(a.id)}><td style={{padding:12,fontWeight:700,borderBottom:"1px solid #f9fafb"}}><span style={{width:10,height:10,borderRadius:"50%",background:a.color,display:"inline-block",marginRight:8}}/>{a.name}</td><td style={{padding:12,color:"#059669",fontWeight:700,borderBottom:"1px solid #f9fafb"}}>{$(a.dailyRevenue)}</td><td style={{padding:12,borderBottom:"1px solid #f9fafb"}}>{$(a.monthlyRevenue)}</td><td style={{padding:12,fontWeight:700,borderBottom:"1px solid #f9fafb"}}>{$(a.allTimeRevenue)}</td><td style={{padding:12,borderBottom:"1px solid #f9fafb"}}>{a.totalPayments}</td><td style={{padding:12,borderBottom:"1px solid #f9fafb"}}>{a.successRate}%</td><td style={{padding:12,borderBottom:"1px solid #f9fafb"}}><button onClick={e=>{e.stopPropagation();goAcct(a.id)}} style={bS}>View →</button></td></tr>)}</tbody></table>}
            </div>
          </>}

          {!acct&&!master&&!loading&&<div style={{textAlign:"center" as const,padding:"80px 20px"}}><div style={{width:64,height:64,background:"linear-gradient(135deg,#6366f1,#818cf8)",borderRadius:18,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:28,marginBottom:16}}>🔄</div><h2>Welcome to Rebb</h2><p style={{color:"#6b7280"}}>Add your first account</p><button onClick={()=>setModal("add")} style={{...bP,marginTop:12}}>+ Add Account</button></div>}

          {acct&&tab==="orders"&&<div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap" as const,gap:8}}>
              <h3 style={{margin:0,fontSize:16,fontWeight:700}}>📦 Whop Orders</h3>
              <div style={{display:"flex",gap:8}}>
                <button onClick={async()=>{if(!acct)return;setOrdersLoading(true);const d=await api("/api/orders","POST",{action:"auto_add_all",account_id:acct});if(d.success){notify(`✅ Auto-added ${d.added} customers (${d.no_payment_method} no card)`);loadAcct(acct);loadOrders(acct)}else notify("❌ "+(d.error||"Failed"));setOrdersLoading(false)}} disabled={ordersLoading} style={{...bP,background:"#059669",opacity:ordersLoading?.6:1}}>{ordersLoading?"Processing...":"⚡ Auto-Add All"}</button>
                <button onClick={()=>{if(acct)loadOrders(acct)}} disabled={ordersLoading} style={{...bO,opacity:ordersLoading?.6:1}}>{ordersLoading?"Loading...":"↻ Fetch"}</button>
              </div>
            </div>
            <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:12,fontSize:12,color:"#166534",marginBottom:14}}>
              💡 <strong>Auto-Add All</strong> fetches every paid order from Whop and adds customers with saved payment methods to your rebill list automatically.
            </div>
            {ordersLoading&&<div style={{padding:40,textAlign:"center" as const,color:"#9ca3af"}}>Fetching orders from Whop...</div>}
            {!ordersLoading&&orders.length===0&&<div style={{...cd,textAlign:"center" as const,padding:40}}><p style={{color:"#6b7280"}}>Click "Fetch" to see orders or "Auto-Add All" to import customers.</p></div>}
            {!ordersLoading&&orders.length>0&&<div style={cd}>
              <div style={{fontSize:12,color:"#9ca3af",marginBottom:12}}>{orders.length} orders found</div>
              {orders.map((o:any,i:number)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"12px 0",borderBottom:"1px solid #f3f4f6",fontSize:13,flexWrap:"wrap" as const}}>
                <div style={{flex:2,minWidth:140}}>
                  <strong>{o.email||o.username||"—"}</strong><br/>
                  <span style={{fontSize:11,color:"#9ca3af"}}>{o.member_id}</span>
                </div>
                <div style={{minWidth:70}}><strong style={{color:o.status==="paid"||o.status==="succeeded"?"#059669":"#dc2626"}}>${o.amount?.toFixed(2)}</strong></div>
                <Badge s={o.status}/>
                {o.product_name&&<span style={{fontSize:11,color:"#6366f1",background:"#f0f0ff",padding:"2px 6px",borderRadius:4}}>{o.product_name}</span>}
                {o.card_last_4&&<span style={{fontSize:11,color:"#9ca3af"}}>•••• {o.card_last_4}</span>}
                <span style={{flex:1}}/>
                <span style={{fontSize:11,color:"#9ca3af"}}>{o.created_at?timeAgo(o.created_at):""}</span>
                {o.already_added?<span style={{fontSize:11,color:"#059669",fontWeight:600,padding:"4px 8px",background:"#ecfdf5",borderRadius:6}}>✓ Added</span>:
                  (o.status==="paid"||o.status==="succeeded"||o.status==="completed")&&o.member_id?<button onClick={()=>addFromOrder(o)} style={{...bS,background:"#059669"}}>+ Rebill</button>:<span style={{fontSize:11,color:"#9ca3af"}}>—</span>}
              </div>)}
            </div>}
          </div>}

          {acct&&tab==="sales"&&!loading&&<>{syncData?<><div style={{display:"grid",gridTemplateColumns:mobile?"1fr 1fr":"repeat(4,1fr)",gap:14}}>{[{l:"Today",v:$(syncData.dailyRevenue),c:"#059669"},{l:"Week",v:$(syncData.weeklyRevenue),c:"#7c3aed"},{l:"30 Days",v:$(syncData.monthlyRevenue),c:"#2563eb"},{l:"All Time",v:$(syncData.allTimeRevenue),c:"#dc2626"}].map((s,i)=><div key={i} style={{background:"#fff",borderRadius:14,padding:"18px 20px",border:"1px solid #e5e7eb"}}><div style={{fontSize:12,color:"#6b7280",fontWeight:600,marginBottom:6}}>{s.l}</div><div style={{fontSize:26,fontWeight:800,color:s.c}}>{s.v}</div></div>)}</div><div style={{...cd,marginTop:16}}><h3 style={{margin:"0 0 8px",fontSize:15,fontWeight:700}}>7-Day Revenue</h3><Chart data={syncData.last7Days||[]}/></div><div style={{...cd,marginTop:16}}><h3 style={{margin:"0 0 12px",fontSize:15,fontWeight:700}}>Recent Payments</h3>{(syncData.recentPayments||[]).map((p:any,i:number)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:"1px solid #f3f4f6",fontSize:13,flexWrap:"wrap" as const}}><strong>{p.email||p.user_id?.slice(0,12)||"—"}</strong><strong style={{color:p.status==="paid"?"#059669":"#dc2626"}}>{$(p.amount)}</strong><Badge s={p.status}/>{p.card_brand&&<span style={{fontSize:11,color:"#9ca3af"}}>{p.card_brand} {p.card_last_4}</span>}<span style={{flex:1}}/><span style={{fontSize:11,color:"#9ca3af"}}>{timeAgo(p.created_at)}</span></div>)}</div></>:<div style={{...cd,textAlign:"center" as const,padding:50}}><p style={{color:"#6b7280"}}>Click Sync to fetch data</p><button onClick={()=>syncAccount(acct)} style={{...bP,marginTop:8}}>↻ Sync</button></div>}</>}

          {acct&&tab==="customers"&&!loading&&<><div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap" as const}}><input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{...iS,flex:1,minWidth:160}}/><select value={filt} onChange={e=>setFilt(e.target.value)} style={{...iS,width:110}}><option value="all">All</option><option value="active">Active</option><option value="paused">Paused</option><option value="failed">Failed</option></select><button onClick={chargeAllDue} style={bP}>⚡ Due ({due})</button><button onClick={retryFailed} style={bO}>🔁 Retry</button><button onClick={exportCustomers} style={bO}>📥 Export</button><button onClick={()=>{if(acct)loadAcct(acct);notify("↻ Refreshed")}} style={bO}>↻ Refresh</button></div>
            {filtered.length===0?<div style={{...cd,textAlign:"center" as const,padding:40}}><p style={{color:"#6b7280"}}>No customers</p><button onClick={()=>setTab("add")} style={{...bP,marginTop:8}}>+ Add</button></div>:
            <div style={cd}>{filtered.map(c=><div key={c.member_id} style={{padding:"12px 0",borderBottom:"1px solid #f3f4f6"}}><div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" as const}}><div style={{flex:2,minWidth:140}}><strong>{c.email||c.username||"—"}</strong><br/><span style={{fontSize:11,color:"#9ca3af"}}>{c.member_id}</span></div><div style={{minWidth:70}}><strong>${c.amount}</strong><span style={{color:"#9ca3af"}}>/{c.rebill_interval_days}d</span></div><div style={{minWidth:70}}>{new Date(c.next_rebill_date)<=new Date()?<span style={{color:"#dc2626",fontWeight:700,fontSize:12}}>DUE</span>:<span style={{fontSize:12}}>{new Date(c.next_rebill_date).toLocaleDateString()}</span>}</div><div style={{minWidth:70}}><strong>${(c.total_charged||0).toFixed(2)}</strong></div><Badge s={c.status}/><div style={{display:"flex",gap:4}}><button style={bS} onClick={()=>{setChgModal(c.member_id);setChgAmt(String(c.amount))}}>💰</button><button style={bSO} onClick={()=>{setEditId(c.member_id);setEAmt(String(c.amount));setEDays(String(c.rebill_interval_days));setENotes(c.notes||"")}}>✏️</button><button style={bSO} onClick={()=>updateCust(c.member_id,{status:c.status==="active"?"paused":"active"})}>{c.status==="active"?"⏸":"▶"}</button><button style={{...bSO,borderColor:"#fecaca",color:"#dc2626"}} onClick={()=>removeCust(c.member_id)}>✕</button></div></div>{editId===c.member_id&&<div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap" as const}}><input value={eAmt} onChange={e=>setEAmt(e.target.value)} placeholder="$" style={{...iS,width:70,height:32,fontSize:12}}/><input value={eDays} onChange={e=>setEDays(e.target.value)} placeholder="Days" style={{...iS,width:60,height:32,fontSize:12}}/><input value={eNotes} onChange={e=>setENotes(e.target.value)} placeholder="Notes" style={{...iS,flex:1,height:32,fontSize:12,minWidth:100}}/><button style={bS} onClick={()=>updateCust(c.member_id,{amount:parseFloat(eAmt),rebill_interval_days:parseInt(eDays),notes:eNotes})}>Save</button><button style={bSO} onClick={()=>setEditId(null)}>✕</button></div>}{c.product_id&&editId!==c.member_id&&<div style={{fontSize:11,color:"#6366f1",marginTop:2}}>🔗 {c.product_id}</div>}{c.notes&&editId!==c.member_id&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>📝 {c.notes}</div>}</div>)}</div>}
          </>}

          {acct&&tab==="add"&&<div style={{maxWidth:520}}><div style={cd}><h3 style={{margin:"0 0 16px",fontSize:16,fontWeight:700}}>Add Customer</h3><div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1fr 1fr",gap:12}}><div><label style={lS}>Member ID *</label><input style={iS} placeholder="mber_XXX" value={nId} onChange={e=>setNId(e.target.value)}/></div><div><label style={lS}>Email</label><input style={iS} placeholder="email" value={nEmail} onChange={e=>setNEmail(e.target.value)}/></div><div><label style={lS}>Amount ($) *</label><input style={iS} type="number" step="0.01" value={nAmt} onChange={e=>setNAmt(e.target.value)}/></div><div><label style={lS}>Currency</label><select style={iS} value={nCur} onChange={e=>setNCur(e.target.value)}><option value="usd">USD</option><option value="eur">EUR</option></select></div><div><label style={lS}>Interval (days)</label><input style={iS} type="number" value={nDays} onChange={e=>setNDays(e.target.value)}/></div><div><label style={lS}>Notes</label><input style={iS} value={nNotes} onChange={e=>setNNotes(e.target.value)}/></div><div><label style={lS}>Plan ID <span style={{color:"#9ca3af",fontWeight:400}}>(optional)</span></label><input style={iS} placeholder="plan_XXX" value={nPlanId} onChange={e=>setNPlanId(e.target.value)}/></div><div><label style={lS}>Product ID <span style={{color:"#9ca3af",fontWeight:400}}>(optional)</span></label><input style={iS} placeholder="prod_XXX" value={nProductId} onChange={e=>setNProductId(e.target.value)}/></div></div><p style={{fontSize:11,color:"#9ca3af",margin:"8px 0 0"}}>Leave Plan & Product IDs empty to auto-detect.</p><button onClick={addCust} style={{...bP,marginTop:16,width:"100%"}}>Add Customer</button></div></div>}

          {acct&&tab==="rebills"&&<div style={cd}><h3 style={{margin:"0 0 12px",fontSize:15,fontWeight:700}}>Rebill Log</h3>{charges.length===0?<p style={{color:"#9ca3af",textAlign:"center" as const,padding:24}}>No rebills</p>:charges.map((ch:any,i:number)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:"1px solid #f3f4f6",fontSize:13}}><strong>{ch.email||ch.member_id?.slice(0,12)}</strong><strong>{$(ch.amount)}</strong><Badge s={ch.status}/><Badge s={ch.type}/><span style={{flex:1}}/><span style={{fontSize:11,color:"#9ca3af"}}>{new Date(ch.created_at).toLocaleString()}</span></div>)}</div>}

          {acct&&tab==="activity"&&<div style={cd}><h3 style={{margin:"0 0 12px",fontSize:15,fontWeight:700}}>Activity</h3>{activity.length===0?<p style={{color:"#9ca3af",textAlign:"center" as const,padding:24}}>No activity</p>:activity.map((a:any,i:number)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:"1px solid #f3f4f6",fontSize:13}}><Badge s={a.action}/><span style={{flex:1}}>{a.details}</span><span style={{fontSize:11,color:"#9ca3af"}}>{timeAgo(a.created_at)}</span></div>)}</div>}

          {acct&&tab==="settings"&&acctObj&&<div style={{maxWidth:520}}><div style={cd}><h3 style={{margin:"0 0 16px",fontSize:16,fontWeight:700}}>Settings</h3>{([["ID",acctObj.id],["Company",acctObj.whop_company_id],["API Key",acctObj.whop_api_key.slice(0,20)+"..."],["Status",acctObj.status]]as[string,string][]).map(([l,v],i)=><div key={i} style={{display:"flex",padding:"10px 0",borderBottom:"1px solid #f3f4f6",fontSize:13}}><span style={{color:"#6b7280",minWidth:110}}>{l}</span><strong>{v}</strong></div>)}<div style={{marginTop:14,padding:14,background:"#f0f4ff",borderRadius:10,fontSize:12}}><strong>Webhook URL:</strong><br/><code style={{wordBreak:"break-all" as const,color:"#4f46e5"}}>{typeof window!=="undefined"?window.location.origin:""}/api/webhooks</code></div><div style={{display:"flex",gap:8,marginTop:16}}><button onClick={()=>syncAccount(acct)} style={bO}>↻ Sync</button><button onClick={()=>delAccount(acctObj.id)} style={{...bO,borderColor:"#fecaca",color:"#dc2626"}}>Delete</button></div></div></div>}
        </div>
      </main>

      {modal==="add"&&<div style={ov} onClick={()=>setModal(null)}><div style={md} onClick={e=>e.stopPropagation()}><h3 style={{margin:"0 0 16px",fontSize:18,fontWeight:800}}>Add Whop Account</h3><div style={{display:"flex",flexDirection:"column" as const,gap:12}}><div><label style={lS}>Name *</label><input style={iS} placeholder="My Store" value={aName} onChange={e=>setAName(e.target.value)}/></div><div><label style={lS}>API Key *</label><input style={iS} placeholder="apik_XXX" value={aKey} onChange={e=>setAKey(e.target.value)}/></div><div><label style={lS}>Company ID *</label><input style={iS} placeholder="biz_XXX" value={aBiz} onChange={e=>setABiz(e.target.value)}/></div><div><label style={lS}>Webhook Secret</label><input style={iS} placeholder="Optional" value={aSecret} onChange={e=>setASecret(e.target.value)}/></div></div><div style={{display:"flex",gap:8,marginTop:16}}><button onClick={addAccount} style={{...bP,flex:1}}>Add</button><button onClick={()=>setModal(null)} style={{...bO,flex:1}}>Cancel</button></div></div></div>}
      {chgModal&&<div style={ov} onClick={()=>setChgModal(null)}><div style={md} onClick={e=>e.stopPropagation()}><h3 style={{margin:"0 0 12px",fontSize:18,fontWeight:800}}>Charge</h3><label style={lS}>Amount ($)</label><input style={iS} type="number" step="0.01" value={chgAmt} onChange={e=>setChgAmt(e.target.value)}/><div style={{display:"flex",gap:8,marginTop:14}}><button onClick={()=>{chargeSingle(chgModal,parseFloat(chgAmt));setChgModal(null)}} style={{...bP,flex:1}}>Charge ${chgAmt}</button><button onClick={()=>setChgModal(null)} style={{...bO,flex:1}}>Cancel</button></div></div></div>}
      {toast&&<div style={{position:"fixed" as const,bottom:24,right:24,background:"#18181b",color:"#fff",padding:"12px 20px",borderRadius:12,fontSize:14,fontWeight:600,zIndex:99999}}>{toast}</div>}
    </div>
  );
}

const cd:React.CSSProperties={background:"#fff",borderRadius:14,border:"1px solid #e5e7eb",padding:"20px 22px"};
const iS:React.CSSProperties={height:42,border:"1px solid #d1d5db",borderRadius:10,padding:"0 14px",fontSize:14,outline:"none",width:"100%",background:"#fff",color:"#111827",boxSizing:"border-box" as const};
const lS:React.CSSProperties={display:"block",fontSize:12,fontWeight:600,color:"#6b7280",marginBottom:4};
const bP:React.CSSProperties={padding:"10px 18px",border:"none",borderRadius:10,background:"#6366f1",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"};
const bO:React.CSSProperties={padding:"10px 18px",border:"1px solid #d1d5db",borderRadius:10,background:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",color:"#374151"};
const bS:React.CSSProperties={padding:"5px 10px",border:"none",borderRadius:7,background:"#6366f1",color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer"};
const bSO:React.CSSProperties={padding:"5px 10px",border:"1px solid #d1d5db",borderRadius:7,background:"#fff",fontSize:11,cursor:"pointer",color:"#374151"};
const ov:React.CSSProperties={position:"fixed" as const,inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10002};
const md:React.CSSProperties={background:"#fff",borderRadius:18,padding:28,width:"92%",maxWidth:440,boxShadow:"0 24px 80px rgba(0,0,0,.15)"};
const sBtn:React.CSSProperties={display:"flex",alignItems:"center",gap:10,padding:"9px 12px",border:"none",background:"transparent",borderRadius:9,cursor:"pointer",fontSize:13,color:"#6b7280",textAlign:"left" as const,width:"100%",fontWeight:500};
const sAct:React.CSSProperties={...sBtn,background:"#f0f0ff",color:"#4f46e5",fontWeight:700};

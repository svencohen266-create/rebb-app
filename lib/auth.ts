import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

// Lazy KV
let _kv: any = null;
async function getKv() {
  if (!_kv) { const mod = await import("@vercel/kv"); _kv = mod.kv; }
  return _kv;
}

// ─── Login ───
export async function tryLogin(req: NextRequest, password: string): Promise<{ success: boolean; token?: string; error?: string }> {
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return { success: false, error: "Wrong password" };
  }
  const token = randomBytes(32).toString("hex");
  try {
    const kv = await getKv();
    await kv.set(`rebb:s:${token}`, "1", { ex: 365 * 24 * 3600 });
  } catch (e) {
    console.error("KV set error:", e);
  }
  return { success: true, token };
}

// ─── Auth check ───
export async function auth(req: NextRequest): Promise<NextResponse | null> {
  // First try session token
  const token = req.headers.get("x-session-token");
  if (token) {
    try {
      const kv = await getKv();
      const exists = await kv.get(`rebb:s:${token}`);
      if (exists) return null; // Valid session
    } catch (e) {
      console.error("KV get error:", e);
    }
  }
  
  // Fallback: accept direct password (for reliability)
  const pw = req.headers.get("x-admin-password");
  if (pw && pw === process.env.ADMIN_PASSWORD) return null;
  
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// ─── Logout ───
export async function logout(token: string) {
  try { const kv = await getKv(); await kv.del(`rebb:s:${token}`); } catch {}
}

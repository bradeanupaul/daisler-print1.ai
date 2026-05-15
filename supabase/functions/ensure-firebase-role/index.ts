import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import admin from "npm:firebase-admin@13";
import { createClient } from "npm:@supabase/supabase-js@2";

let adminAuth: ReturnType<typeof admin.auth> | null = null;

async function getServiceAccountJson(): Promise<string> {
  const fromEnv = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (fromEnv) return fromEnv;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("Lipsește configurația Supabase în runtime-ul edge.");
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb.rpc("get_integration_secret", {
    p_key: "FIREBASE_SERVICE_ACCOUNT_JSON",
  });

  if (error || !data) {
    throw new Error(`Cheia Firebase nu e configurată: ${error?.message ?? "empty"}`);
  }
  return data as string;
}

async function getAdminAuth() {
  if (!adminAuth) {
    const raw = await getServiceAccountJson();
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(raw)),
    });
    adminAuth = admin.auth();
  }
  return adminAuth;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing Bearer token" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const auth = await getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const role = (decoded as { role?: string }).role;

    if (role !== "authenticated") {
      await auth.setCustomUserClaims(decoded.uid, { role: "authenticated" });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        uid: decoded.uid,
        updated: role !== "authenticated",
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("ensure-firebase-role:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

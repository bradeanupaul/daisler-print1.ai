import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { auth } from "../../firebase";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
/** Prefer legacy anon JWT — works reliably with Firebase third-party auth. */
const supabaseKey = (
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
)?.trim();

export function isSupabaseConfigured(): boolean {
  return Boolean(url?.trim() && supabaseKey);
}

let client: SupabaseClient<Database> | null = null;
let clientKey: string | null = null;

export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;
  if (!client || clientKey !== supabaseKey) {
    clientKey = supabaseKey!;
    client = createClient<Database>(url!, supabaseKey!, {
      accessToken: async () => {
        const user = auth.currentUser;
        if (!user) return null;
        return user.getIdToken(false);
      },
    });
  }
  return client;
}

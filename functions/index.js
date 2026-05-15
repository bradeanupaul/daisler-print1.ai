const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

const SUPABASE_ROLE = { role: "authenticated" };

async function applySupabaseRole(uid) {
  const user = await admin.auth().getUser(uid);
  if (user.customClaims?.role === "authenticated") {
    return { updated: false };
  }
  await admin.auth().setCustomUserClaims(uid, SUPABASE_ROLE);
  return { updated: true };
}

/** La fiecare cont nou: claim pentru Supabase RLS. */
exports.setSupabaseRoleOnCreate = functions.auth.user().onCreate(async (user) => {
  await admin.auth().setCustomUserClaims(user.uid, SUPABASE_ROLE);
});

/**
 * Backup idempotent: la login, dacă lipsește claim-ul (user vechi sau onCreate întârziat).
 * Apelat din app după autentificare.
 */
exports.ensureSupabaseRole = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Trebuie să fii autentificat.");
  }
  const result = await applySupabaseRole(context.auth.uid);
  return { ok: true, ...result };
});

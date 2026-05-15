/**
 * One-time: set Firebase custom claim `role: authenticated` for Supabase RLS.
 * Usage: node scripts/set-supabase-role.mjs
 */
import { readFileSync } from "node:fs";
import admin from "firebase-admin";

const KEY_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
  "/Users/paulbradeanu/Downloads/print1ai-firebase-adminsdk-fbsvc-edda49d2c1.json";

const serviceAccount = JSON.parse(readFileSync(KEY_PATH, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();

async function setRoleForAllUsers() {
  let nextPageToken;
  let count = 0;

  do {
    const { users, pageToken } = await auth.listUsers(1000, nextPageToken);
    nextPageToken = pageToken;

    for (const user of users) {
      await auth.setCustomUserClaims(user.uid, { role: "authenticated" });
      console.log(`✓ ${user.email ?? user.uid} → role: authenticated`);
      count++;
    }
  } while (nextPageToken);

  console.log(`\nDone. Updated ${count} user(s).`);
  console.log("Sign out and sign in again in print1.ai, then upload a file to test history.");
}

setRoleForAllUsers().catch((err) => {
  console.error(err);
  process.exit(1);
});

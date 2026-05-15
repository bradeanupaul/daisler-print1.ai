import { readFileSync } from "node:fs";
import { google } from "googleapis";

const KEY_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
  "/Users/paulbradeanu/Downloads/print1ai-firebase-adminsdk-fbsvc-edda49d2c1.json";

const projectId = JSON.parse(readFileSync(KEY_PATH, "utf8")).project_id;

const auth = new google.auth.GoogleAuth({
  keyFile: KEY_PATH,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const serviceusage = google.serviceusage({ version: "v1", auth });

const apis = [
  "cloudfunctions.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "run.googleapis.com",
  "eventarc.googleapis.com",
];

for (const api of apis) {
  const name = `projects/${projectId}/services/${api}`;
  try {
    await serviceusage.services.enable({ name });
    console.log(`✓ enabled ${api}`);
  } catch (e) {
    const msg = e?.response?.data?.error?.message ?? e.message;
    console.warn(`⚠ ${api}: ${msg}`);
  }
}

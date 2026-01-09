import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function getPrivateKey(): string {
  const raw = requireEnv("FIREBASE_PRIVATE_KEY");
  return raw.replace(/\\n/g, "\n");
}

function initAdminApp() {
  if (getApps().length) return getApps()[0];

  return initializeApp({
    credential: cert({
      projectId: requireEnv("FIREBASE_PROJECT_ID"),
      clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: getPrivateKey(),
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
  });
}

export const firebaseAdminApp = initAdminApp();
export const adminFirestore = getFirestore(firebaseAdminApp);
export const adminAuth = getAuth(firebaseAdminApp);

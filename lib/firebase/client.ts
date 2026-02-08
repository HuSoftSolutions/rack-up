import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";
import { FirebaseStorage, getStorage } from "firebase/storage";

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const firebaseConfig: FirebaseWebConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

const missingEnv = [
  ["NEXT_PUBLIC_FIREBASE_API_KEY", firebaseConfig.apiKey],
  ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", firebaseConfig.authDomain],
  ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", firebaseConfig.projectId],
  ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", firebaseConfig.storageBucket],
  ["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", firebaseConfig.messagingSenderId],
  ["NEXT_PUBLIC_FIREBASE_APP_ID", firebaseConfig.appId],
].filter(([, value]) => !value);

if (missingEnv.length > 0) {
  throw new Error(`Missing required env var: ${missingEnv[0][0]}`);
}

function resolveAssumeMode(): boolean {
  if (typeof window === "undefined") return false;
  const isAssumePath = window.location.pathname.startsWith("/assume");
  if (isAssumePath) {
    try {
      sessionStorage.setItem("rackup:assume", "1");
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }
  try {
    return sessionStorage.getItem("rackup:assume") === "1";
  } catch {
    return isAssumePath;
  }
}

function initFirebaseApp(name?: string): FirebaseApp {
  if (name) {
    const existing = getApps().find((app) => app.name === name);
    return existing ?? initializeApp(firebaseConfig, name);
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

const assumeMode = resolveAssumeMode();
export const firebaseApp = initFirebaseApp(assumeMode ? "rackup-assume" : undefined);
export const firebaseAuth: Auth = getAuth(firebaseApp);
export const firestore: Firestore = getFirestore(firebaseApp);
export const firebaseStorage: FirebaseStorage = getStorage(firebaseApp);

import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import {
  Auth,
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  inMemoryPersistence,
  setPersistence,
} from "firebase/auth";
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

const ASSUME_MODE_KEY = "rackup:assume";
const ASSUME_APP_NAME = "rackup-assume";

function isAssumeModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(ASSUME_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAssumeMode(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      window.sessionStorage.setItem(ASSUME_MODE_KEY, "1");
    } else {
      window.sessionStorage.removeItem(ASSUME_MODE_KEY);
    }
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

function initFirebaseApp(name?: string): FirebaseApp {
  if (name) {
    const existing = getApps().find((app) => app.name === name);
    return existing ?? initializeApp(firebaseConfig, name);
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getAssumeAuth(): Auth {
  return getAuth(initFirebaseApp(ASSUME_APP_NAME));
}

const assumeMode = isAssumeModeEnabled();
export const firebaseApp = initFirebaseApp(assumeMode ? ASSUME_APP_NAME : undefined);
export const firebaseAuth: Auth = getAuth(firebaseApp);
export const firestore: Firestore = getFirestore(firebaseApp);
export const firebaseStorage: FirebaseStorage = getStorage(firebaseApp);

let defaultPersistenceInit: Promise<void> | null = null;

export function ensureDefaultAuthPersistence() {
  if (typeof window === "undefined") return Promise.resolve();
  if (isAssumeModeEnabled()) return Promise.resolve();
  if (defaultPersistenceInit) return defaultPersistenceInit;

  defaultPersistenceInit = (async () => {
    try {
      await setPersistence(firebaseAuth, browserLocalPersistence);
      return;
    } catch {
      // Fall through to weaker persistence modes.
    }

    try {
      await setPersistence(firebaseAuth, browserSessionPersistence);
      return;
    } catch {
      // Fall through to in-memory as last resort.
    }

    try {
      await setPersistence(firebaseAuth, inMemoryPersistence);
    } catch {
      // Ignore; auth can still work with Firebase defaults.
    }
  })();

  return defaultPersistenceInit;
}

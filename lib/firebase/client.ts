import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const firebaseConfig: FirebaseWebConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
    "AIzaSyBOeABfrbnEggXLh4a9suWG_AM81mNs6FQ",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "rack-up-dev.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "rack-up-dev",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    "rack-up-dev.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "994378549742",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??
    "1:994378549742:web:d6c538f91bcf92cf5026ff",
};

function initFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export const firebaseApp = initFirebaseApp();
export const firebaseAuth: Auth = getAuth(firebaseApp);
export const firestore: Firestore = getFirestore(firebaseApp);


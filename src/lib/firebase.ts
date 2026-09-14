import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import defaultConfig from "../../firebase-applet-config.json";

// Firebase web config is public by design; values can be overridden per deployment.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? defaultConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? defaultConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? defaultConfig.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? defaultConfig.appId,
  messagingSenderId: defaultConfig.messagingSenderId,
  storageBucket: defaultConfig.storageBucket,
};

const app = initializeApp(config);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

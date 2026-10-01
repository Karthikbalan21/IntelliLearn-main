import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDDAA4Vqg7a2s-6qtMIhzGXAbDMlOpieFQ",
  authDomain: "intellilearn-1beda.firebaseapp.com",
  projectId: "intellilearn-1beda",
  storageBucket: "intellilearn-1beda.firebasestorage.app",
  messagingSenderId: "97356939193",
  appId: "1:97356939193:web:2a03a33843fcdc80700068",
  measurementId: "G-6ZCH4WDH4J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
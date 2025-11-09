import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyAQY-tXbLL-u1MLGDo_keO2HmSnmaAOlF0',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'memorizewholetext.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'memorizewholetext',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'memorizewholetext.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '1017620600279',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:1017620600279:web:1ef89648b5c2d17f56e792',
  measurementId: 'G-HYV1GDPW35',
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);

// Firebase 서비스들 export
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;

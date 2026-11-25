import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyB_LgDtc1wnciB3gRPH6FtbJamYC66o9Iw',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'emochosting.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'emochosting',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'emochosting.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '645507772717',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:645507772717:web:de9cf868783d952b3323a4',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-78XD4T16TS',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const isEmulator = false;

export { app, auth, isEmulator, firebaseConfig };

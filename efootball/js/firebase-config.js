import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD00oEj0Tib4xkrHfJrvmnyl3a2jG1c4uw",
  authDomain: "e-football-47cb0.firebaseapp.com",
  projectId: "e-football-47cb0",
  storageBucket: "e-football-47cb0.firebasestorage.app",
  messagingSenderId: "1048316484623",
  appId: "1:1048316484623:web:78acd645c4e7dbd230177a",
  measurementId: "G-SLGXYF1SCB"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
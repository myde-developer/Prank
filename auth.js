// auth.js
import { auth, db, COLLECTIONS } from './firebase.js';
import { 
  signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let isAdmin = false;

export function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
      const userRef = doc(db, COLLECTIONS.users, user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, { email: user.email, role: 'user', name: user.displayName || '' });
      }
      const role = snap.exists() ? snap.data().role : 'user';
      isAdmin = role === 'admin';
      updateAdminUI();
      showToast(`Welcome ${user.email}`, "success");
    } else {
      isAdmin = false;
      updateAdminUI();
    }
    window.dispatchEvent(new CustomEvent('authChanged', { detail: { user, isAdmin } }));
  });
}

function updateAdminUI() {
  const adminLink = document.getElementById('adminDashboardLink');
  if (adminLink) adminLink.style.display = isAdmin ? 'flex' : 'none';
}

export async function login(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function register(email, password, name) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, COLLECTIONS.users, cred.user.uid), { email, role: 'user', name });
}

export async function googleSignIn() {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

export async function logout() {
  await signOut(auth);
}

export function getCurrentUser() { return currentUser; }
export function userIsAdmin() { return isAdmin; }

function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
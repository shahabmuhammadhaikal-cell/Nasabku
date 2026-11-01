import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

/** Inisialisasi Firebase client sekali; menandai kesiapan konfigurasi. */
let auth = null;
let configured = false;

const apiKeyPlaceholder = firebaseConfig.apiKey?.includes("ISI_DARI_");
configured = Boolean(firebaseConfig.apiKey) && !apiKeyPlaceholder && Boolean(firebaseConfig.authDomain);

export const firebaseReady = new Promise((resolve) => {
  if (!configured) {
    // Konfigurasi belum diisi: tampilkan panduan, jangan crash.
    document.getElementById("auth-setup").textContent =
      "Konfigurasi Firebase web belum diisi (firebase-config.js). Isi apiKey/authDomain/appId dari Project settings → General → Your apps, lalu muat ulang halaman.";
    document.getElementById("auth-setup").classList.remove("hidden");
    document.getElementById("btn-login").disabled = true;
    document.getElementById("btn-register").disabled = true;
    resolve({ onAuthChanged() {} });
    return;
  }
  initializeApp(firebaseConfig);
  auth = getAuth();
  resolve({ onAuthChanged: (cb) => onAuthStateChanged(auth, (u) => cb(u)) });
});

export async function signIn(email, password) {
  if (!configured) throw new Error("Firebase belum dikonfigurasi (firebase-config.js).");
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user.getIdToken();
}

export async function register(email, password) {
  if (!configured) throw new Error("Firebase belum dikonfigurasi (firebase-config.js).");
  await createUserWithEmailAndPassword(auth, email, password);
  await signOut(auth); // akun launcher baru: minta user masuk manual agar jelas.
}

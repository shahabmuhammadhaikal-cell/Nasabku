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

export async function signOutFirebase() {
  if (!auth) throw new Error("Firebase belum diinisialisasi.");
  await signOut(auth);
}

/**
 * Daftar akun baru lewat Firebase Auth (client-side), lalu langsung
 * masuk: minta idToken dari akun yang baru dibuat dan serahkan ke
 * endpoint /api/v1/auth/login backend pakai sesi cookie.
 *
 * Pendekatan ini meninggalkan login manual berulang; flow menjadi
 * satu langkah: daftar → masuk → masuk ke app.
 */
export async function register(email, password) {
  if (!configured) throw new Error("Firebase belum dikonfigurasi (firebase-config.js).");
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  // Ambil ID token untuk sesi backend (akun barusan dibuat, sudah ada
  // di dalam auth state setelah createUserWithEmailAndPassword resolves).
  const idToken = await cred.user.getIdToken();
  // Hubungkan ke backend sekaligus: buat sesi cookie.
  await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ idToken }),
  }).catch(() => {});
}

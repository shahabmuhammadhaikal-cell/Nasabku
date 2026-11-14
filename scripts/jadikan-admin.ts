/**
 * Menaikkan satu akun menjadi admin lewat terminal:
 *
 *   npm run admin:promote -- email@contoh.com
 *
 * Membaca kredensial Firestore dari variabel lingkungan yang sama dengan
 * aplikasi (FIREBASE_SERVICE_ACCOUNT_JSON dan FIREBASE_PROJECT_ID).
 */
import process from "node:process";
import { muatKonfigurasi } from "../src/config.js";
import { buatPenyimpananFirestore } from "../src/data/firestore.js";

async function utama(): Promise<void> {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    console.error("Pemakaian: npm run admin:promote -- email@contoh.com");
    process.exitCode = 1;
    return;
  }

  const konfigurasi = muatKonfigurasi();
  if (!konfigurasi.firestore) {
    console.error(
      konfigurasi.firestoreMasalah ??
        "Firestore belum dikonfigurasi. Setel FIREBASE_SERVICE_ACCOUNT_JSON dan FIREBASE_PROJECT_ID.",
    );
    process.exitCode = 1;
    return;
  }

  const penyimpanan = buatPenyimpananFirestore(konfigurasi.firestore);
  try {
    const pengguna = await penyimpanan.cariPengguna(email);
    if (!pengguna) {
      console.error(`Akun dengan email ${email} tidak ditemukan.`);
      process.exitCode = 1;
      return;
    }

    const diubah = await penyimpanan.ubahPengguna(pengguna.id, {
      peran: "admin",
      status: "aktif",
    });
    console.log(
      JSON.stringify({
        pesan: "Akun sekarang admin dan aktif.",
        id: diubah?.id,
        email: diubah?.email,
        peran: diubah?.peran,
        status: diubah?.status,
      }),
    );
  } finally {
    await penyimpanan.tutup();
  }
}

void utama().catch((kesalahan: unknown) => {
  console.error(kesalahan instanceof Error ? kesalahan.message : String(kesalahan));
  process.exitCode = 1;
});

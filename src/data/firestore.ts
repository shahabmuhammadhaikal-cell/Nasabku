import {
  Firestore,
  type CollectionReference,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "@google-cloud/firestore";
import type { KonfigurasiFirestore } from "../config.js";
import type { BasisDokumen, Dokumen, Koleksi } from "./port.js";
import { buatPenyimpanan, type Penyimpanan } from "./penyimpanan.js";

/** Struktur minimal Firestore yang dipakai `refKoleksi` — cukup untuk diuji dengan objek palsu. */
export interface DbMirip {
  collection(nama: string): KoleksiMirip;
}
export interface KoleksiMirip {
  doc(id: string): DokumenMirip;
}
export interface DokumenMirip {
  collection(nama: string): KoleksiMirip;
}

/**
 * Menerjemahkan jalur berselang-seling menjadi referensi koleksi Firestore.
 * ["ruangKerja"] → ruangKerja
 * ["ruangKerja", "<id>", "orang"] → ruangKerja/<id>/orang
 */
export function refKoleksi(db: DbMirip, jalur: readonly string[]): KoleksiMirip {
  if (jalur.length === 0 || jalur.length % 2 === 0) {
    throw new Error(`Jalur koleksi harus ganjil (koleksi/dokumen/koleksi): ${jalur.join("/")}`);
  }
  const pertama = jalur[0] ?? "";
  let ref = db.collection(pertama);
  for (let i = 1; i + 1 < jalur.length; i += 2) {
    ref = ref.doc(jalur[i] ?? "").collection(jalur[i + 1] ?? "");
  }
  return ref;
}

/** Kode gRPC ALREADY_EXISTS: dokumen dengan id itu sudah ada. */
const KODE_SUDAH_ADA = 6;
const UKURAN_HALAMAN = 500;

function kodeGalat(galat: unknown): unknown {
  return typeof galat === "object" && galat !== null ? (galat as { code?: unknown }).code : undefined;
}

class KoleksiFirestore implements Koleksi {
  constructor(private readonly ref: CollectionReference<DocumentData>) {}

  async ambil(id: string): Promise<Dokumen | null> {
    const snapshot = await this.ref.doc(id).get();
    return snapshot.exists ? { id, data: snapshot.data() ?? {} } : null;
  }

  async simpan(id: string, data: Record<string, unknown>): Promise<void> {
    await this.ref.doc(id).set(data);
  }

  async buat(id: string, data: Record<string, unknown>): Promise<boolean> {
    try {
      await this.ref.doc(id).create(data);
      return true;
    } catch (galat) {
      if (kodeGalat(galat) === KODE_SUDAH_ADA) return false;
      throw galat;
    }
  }

  async hapus(id: string): Promise<boolean> {
    const snapshot = await this.ref.doc(id).get();
    if (!snapshot.exists) return false;
    await this.ref.doc(id).delete();
    return true;
  }

  async daftar(batas = 5000): Promise<Dokumen[]> {
    const hasil: Dokumen[] = [];
    let setelah: QueryDocumentSnapshot<DocumentData> | null = null;
    while (hasil.length < batas) {
      const ukuran = Math.min(UKURAN_HALAMAN, batas - hasil.length);
      let kueri: Query<DocumentData> = this.ref.limit(ukuran);
      if (setelah) kueri = kueri.startAfter(setelah);
      const snapshot = await kueri.get();
      if (snapshot.empty) break;
      for (const dokumen of snapshot.docs) hasil.push({ id: dokumen.id, data: dokumen.data() });
      if (snapshot.size < ukuran) break;
      setelah = snapshot.docs[snapshot.size - 1] ?? null;
      if (!setelah) break;
    }
    return hasil;
  }

  async cari(field: string, nilai: unknown): Promise<Dokumen[]> {
    const snapshot = await this.ref.where(field, "==", nilai).limit(1000).get();
    return snapshot.docs.map((dokumen) => ({ id: dokumen.id, data: dokumen.data() }));
  }
}

export function buatBasisFirestore(db: Firestore): BasisDokumen {
  return {
    koleksi: (jalur) =>
      new KoleksiFirestore(refKoleksi(db as unknown as DbMirip, jalur) as CollectionReference<DocumentData>),
    tutup: async () => {
      await db.terminate();
    },
  };
}

/**
 * Membuat klien Firestore dari service account. Kredensial hanya hidup di server;
 * peramban tidak pernah memegang kunci Google dan tidak berbicara langsung ke Firestore.
 * Bila `FIRESTORE_EMULATOR_HOST` disetel, klien otomatis memakai emulator (tanpa kredensial).
 */
export function buatPenyimpananFirestore(konfigurasi: KonfigurasiFirestore): Penyimpanan {
  const db = new Firestore({
    projectId: konfigurasi.projectId,
    ...(konfigurasi.clientEmail && konfigurasi.privateKey
      ? {
          credentials: {
            client_email: konfigurasi.clientEmail,
            private_key: konfigurasi.privateKey,
          },
        }
      : {}),
    ignoreUndefined: true,
  });
  return buatPenyimpanan(buatBasisFirestore(db));
}

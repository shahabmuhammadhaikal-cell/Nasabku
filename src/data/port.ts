/** Satu dokumen dengan id dan isinya. */
export interface Dokumen {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Antarmuka koleksi dokumen yang sengaja dibuat sempit: hanya operasi yang benar-benar
 * dipakai aplikasi. Firestore dan penyimpanan memori sama-sama memenuhinya, sehingga
 * logika silsilah bisa diuji tanpa kredensial dan tanpa emulator.
 */
export interface Koleksi {
  ambil(id: string): Promise<Dokumen | null>;
  /** Menulis ulang dokumen (upsert). */
  simpan(id: string, data: Record<string, unknown>): Promise<void>;
  /** Membuat dokumen baru; mengembalikan false bila id sudah dipakai. */
  buat(id: string, data: Record<string, unknown>): Promise<boolean>;
  hapus(id: string): Promise<boolean>;
  daftar(batas?: number): Promise<Dokumen[]>;
  /** Mencari dokumen dengan satu field bernilai tertentu. */
  cari(field: string, nilai: unknown): Promise<Dokumen[]>;
}

/**
 * Akar penyimpanan. Jalur koleksi berselang-seling dan selalu dimulai koleksi:
 * ["ruangKerja"], ["ruangKerja", "<id>", "orang"].
 */
export interface BasisDokumen {
  koleksi(jalur: readonly string[]): Koleksi;
  tutup?(): Promise<void>;
}

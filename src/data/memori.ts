import type { BasisDokumen, Dokumen, Koleksi } from "./port.js";

/**
 * Penyimpanan di memori yang memenuhi antarmuka `Koleksi`.
 * Dipakai pengujian: seluruh logika aplikasi berjalan tanpa kredensial Firestore.
 */
export function buatBasisMemori(): BasisDokumen {
  const gudang = new Map<string, Record<string, unknown>>();
  return {
    koleksi: (jalur) => new KoleksiMemori(gudang, [...jalur]),
  };
}

class KoleksiMemori implements Koleksi {
  constructor(
    private readonly gudang: Map<string, Record<string, unknown>>,
    private readonly jalur: string[],
  ) {}

  private kunci(id: string): string {
    return [...this.jalur, id].join("/");
  }

  private awalan(): string {
    return `${this.jalur.join("/")}/`;
  }

  async ambil(id: string): Promise<Dokumen | null> {
    const data = this.gudang.get(this.kunci(id));
    return data ? { id, data: structuredClone(data) } : null;
  }

  async simpan(id: string, data: Record<string, unknown>): Promise<void> {
    this.gudang.set(this.kunci(id), structuredClone(data));
  }

  async buat(id: string, data: Record<string, unknown>): Promise<boolean> {
    if (this.gudang.has(this.kunci(id))) return false;
    this.gudang.set(this.kunci(id), structuredClone(data));
    return true;
  }

  async hapus(id: string): Promise<boolean> {
    return this.gudang.delete(this.kunci(id));
  }

  async daftar(batas = 5000): Promise<Dokumen[]> {
    const awalan = this.awalan();
    const hasil: Dokumen[] = [];
    for (const [kunci, data] of this.gudang) {
      if (!kunci.startsWith(awalan)) continue;
      const sisa = kunci.slice(awalan.length).split("/");
      if (sisa.length !== 1) continue;
      hasil.push({ id: sisa[0] ?? "", data: structuredClone(data) });
      if (hasil.length >= batas) break;
    }
    return hasil.sort((a, b) => a.id.localeCompare(b.id));
  }

  async cari(field: string, nilai: unknown): Promise<Dokumen[]> {
    return (await this.daftar()).filter((dokumen) => dokumen.data[field] === nilai);
  }
}

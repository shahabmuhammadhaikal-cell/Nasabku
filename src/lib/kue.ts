export interface OpsiKue {
  maxAgeDetik?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
}

/** Membuat satu header Set-Cookie. */
export function buatKue(nama: string, nilai: string, opsi: OpsiKue = {}): string {
  const bagian = [`${nama}=${nilai}`, `Path=${opsi.path ?? "/"}`];
  if (opsi.maxAgeDetik !== undefined) bagian.push(`Max-Age=${Math.floor(opsi.maxAgeDetik)}`);
  if (opsi.httpOnly !== false) bagian.push("HttpOnly");
  if (opsi.secure) bagian.push("Secure");
  bagian.push(`SameSite=${opsi.sameSite ?? "Lax"}`);
  return bagian.join("; ");
}

/** Membuat header Set-Cookie yang langsung menghapus kue. */
export function hapusKue(nama: string, opsi: OpsiKue = {}): string {
  return buatKue(nama, "", { ...opsi, maxAgeDetik: 0 });
}

/** Membaca satu nilai kue dari header Cookie. */
export function bacaKue(headerKue: string | undefined, nama: string): string | null {
  if (!headerKue) return null;
  for (const potongan of headerKue.split(";")) {
    const pemisah = potongan.indexOf("=");
    if (pemisah === -1) continue;
    if (potongan.slice(0, pemisah).trim() === nama) {
      const nilai = potongan.slice(pemisah + 1).trim();
      return nilai.length > 0 ? decodeURIComponent(nilai) : null;
    }
  }
  return null;
}

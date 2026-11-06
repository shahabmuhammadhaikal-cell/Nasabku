import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PANJANG_KUNCI = 64;
const PENANDA = "scrypt";

/** Menghasilkan "scrypt$<garam>$<kunci>" dari kata sandi polos. */
export function hashSandi(sandi: string): string {
  const garam = randomBytes(16);
  const kunci = scryptSync(sandi, garam, PANJANG_KUNCI);
  return `${PENANDA}$${garam.toString("base64url")}$${kunci.toString("base64url")}`;
}

/** Membandingkan kata sandi polos dengan hash tersimpan secara waktu-tetap. */
export function cocokSandi(sandi: string, tersimpan: string): boolean {
  const bagian = tersimpan.split("$");
  if (bagian.length !== 3 || bagian[0] !== PENANDA) return false;
  const garam = Buffer.from(bagian[1] ?? "", "base64url");
  const kunciTersimpan = Buffer.from(bagian[2] ?? "", "base64url");
  if (garam.length === 0 || kunciTersimpan.length !== PANJANG_KUNCI) return false;
  const kunciUji = scryptSync(sandi, garam, PANJANG_KUNCI);
  return timingSafeEqual(kunciUji, kunciTersimpan);
}

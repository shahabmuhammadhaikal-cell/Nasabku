const DASAR = "/api/v1";

/** Galat API dengan kode dari server agar UI bisa memberi pesan yang tepat. */
export class GalatApi extends Error {
  constructor(pesan, kode, status) {
    super(pesan);
    this.name = "GalatApi";
    this.kode = kode;
    this.status = status;
  }
}

async function panggil(jalur, { metode = "GET", badan } = {}) {
  const opsi = { method: metode, credentials: "same-origin", headers: { Accept: "application/json" } };
  if (badan !== undefined) {
    opsi.headers["Content-Type"] = "application/json";
    opsi.body = JSON.stringify(badan);
  }

  let respons;
  try {
    respons = await fetch(`${DASAR}${jalur}`, opsi);
  } catch {
    throw new GalatApi("Tidak bisa menghubungi server. Periksa koneksi Anda.", "JARINGAN", 0);
  }

  if (respons.status === 204) return null;

  const teks = await respons.text();
  let data = null;
  if (teks) {
    try {
      data = JSON.parse(teks);
    } catch {
      data = null;
    }
  }

  if (!respons.ok) {
    const galat = data?.error;
    throw new GalatApi(
      galat?.pesan ?? `Permintaan gagal (${respons.status}).`,
      galat?.kode ?? "GALAT_TIDAK_DIKENAL",
      respons.status,
    );
  }

  return data;
}

const badanOrang = (nilai) => ({
  nama: nilai.nama,
  jenisKelamin: nilai.jenisKelamin,
  tahunLahir: nilai.tahunLahir === "" ? null : nilai.tahunLahir,
  tahunWafat: nilai.tahunWafat === "" ? null : nilai.tahunWafat,
  catatan: nilai.catatan === "" ? null : nilai.catatan,
});

export const api = {
  daftar: (data) => panggil("/auth/register", { metode: "POST", badan: data }),
  masuk: (data) => panggil("/auth/login", { metode: "POST", badan: data }),
  keluar: () => panggil("/auth/logout", { metode: "POST" }),
  saya: () => panggil("/auth/me"),

  ruangKerja: () => panggil("/workspaces"),
  buatRuangKerja: (nama) => panggil("/workspaces", { metode: "POST", badan: { nama } }),
  hapusRuangKerja: (id) => panggil(`/workspaces/${id}`, { metode: "DELETE" }),
  statistik: (id) => panggil(`/workspaces/${id}/stats`),
  ekspor: (id) => panggil(`/workspaces/${id}/export`),

  orang: (ruangId, q = "") =>
    panggil(`/workspaces/${ruangId}/persons${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  buatOrang: (ruangId, data) =>
    panggil(`/workspaces/${ruangId}/persons`, { metode: "POST", badan: badanOrang(data) }),
  ubahOrang: (ruangId, id, data) =>
    panggil(`/workspaces/${ruangId}/persons/${id}`, { metode: "PATCH", badan: badanOrang(data) }),
  hapusOrang: (ruangId, id) => panggil(`/workspaces/${ruangId}/persons/${id}`, { metode: "DELETE" }),

  relasi: (ruangId, orangId) =>
    panggil(`/workspaces/${ruangId}/relations${orangId ? `?orangId=${encodeURIComponent(orangId)}` : ""}`),
  buatRelasi: (ruangId, orangTuaId, anakId) =>
    panggil(`/workspaces/${ruangId}/relations`, { metode: "POST", badan: { orangTuaId, anakId } }),
  hapusRelasi: (ruangId, id) => panggil(`/workspaces/${ruangId}/relations/${id}`, { metode: "DELETE" }),

  silsilah: (ruangId, orangId, arah, kedalaman = 5) =>
    panggil(`/workspaces/${ruangId}/tree/${orangId}?arah=${arah}&kedalaman=${kedalaman}`),
};

import { api } from "./api.js";

const $ = (id) => document.getElementById(id);

const state = {
  pengguna: null,
  ruangKerja: [],
  ruang: null,
  orang: [],
  terpilihId: null,
  arah: "turun",
  cari: "",
  modeForm: "tambah",
};

const esc = (nilai) =>
  String(nilai ?? "").replace(/[&<>"']/g, (huruf) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[huruf]);

function tahunTeks(orang) {
  if (!orang.tahunLahir && !orang.tahunWafat) return "";
  const lahir = orang.tahunLahir ?? "?";
  return orang.tahunWafat ? `${lahir}–${orang.tahunWafat}` : `lahir ${lahir}`;
}

const labelKelamin = { L: "Laki-laki", P: "Perempuan", U: "Belum diketahui" };

function pesan(elemen, teks) {
  if (!teks) {
    elemen.hidden = true;
    elemen.textContent = "";
    return;
  }
  elemen.hidden = false;
  elemen.textContent = teks;
}

/* ------------------------------ Autentikasi ------------------------------ */

function tampilkanMasuk() {
  $("tampilan-aplikasi").hidden = true;
  $("sisi-pengguna").hidden = true;
  $("tampilan-masuk").hidden = false;
}

async function bukaAplikasi() {
  $("tampilan-masuk").hidden = true;
  $("tampilan-aplikasi").hidden = false;
  $("sisi-pengguna").hidden = false;
  $("nama-pengguna").textContent = state.pengguna?.nama ?? "";
  await muatRuangKerja();
}

function pasangTab() {
  for (const tombol of document.querySelectorAll(".tab button")) {
    tombol.addEventListener("click", () => {
      const mode = tombol.dataset.mode;
      for (const lain of document.querySelectorAll(".tab button")) {
        lain.classList.toggle("tab-aktif", lain === tombol);
      }
      $("form-masuk").hidden = mode !== "masuk";
      $("form-daftar").hidden = mode !== "daftar";
      pesan($("pesan-masuk"), "");
    });
  }
}

async function tanganiMasuk(peristiwa) {
  peristiwa.preventDefault();
  // currentTarget bernilai null setelah await, jadi formulir disimpan lebih dulu.
  const formulir = peristiwa.currentTarget;
  const data = new FormData(formulir);
  const tombol = formulir.querySelector("button[type=submit]");
  tombol.disabled = true;
  pesan($("pesan-masuk"), "");
  try {
    const hasil = await api.masuk({ email: String(data.get("email") ?? ""), sandi: String(data.get("sandi") ?? "") });
    state.pengguna = hasil.pengguna;
    formulir.reset();
    await bukaAplikasi();
  } catch (galat) {
    pesan($("pesan-masuk"), galat.message);
  } finally {
    tombol.disabled = false;
  }
}

async function tanganiDaftar(peristiwa) {
  peristiwa.preventDefault();
  // currentTarget bernilai null setelah await, jadi formulir disimpan lebih dulu.
  const formulir = peristiwa.currentTarget;
  const data = new FormData(formulir);
  const tombol = formulir.querySelector("button[type=submit]");
  tombol.disabled = true;
  pesan($("pesan-masuk"), "");
  try {
    const hasil = await api.daftar({
      nama: String(data.get("nama") ?? ""),
      email: String(data.get("email") ?? ""),
      sandi: String(data.get("sandi") ?? ""),
    });
    state.pengguna = hasil.pengguna;
    formulir.reset();
    await bukaAplikasi();
  } catch (galat) {
    pesan($("pesan-masuk"), galat.message);
  } finally {
    tombol.disabled = false;
  }
}

/* ------------------------------- Ruang kerja ----------------------------- */

async function muatRuangKerja() {
  const hasil = await api.ruangKerja();
  state.ruangKerja = hasil.ruangKerja;
  gambarDaftarRuang();
  const sebelumnya = state.ruang?.id;
  const berikut = state.ruangKerja.find((r) => r.id === sebelumnya) ?? state.ruangKerja[0] ?? null;
  await pilihRuang(berikut);
}

function gambarDaftarRuang() {
  const daftar = $("daftar-ruang");
  daftar.innerHTML = "";
  for (const ruang of state.ruangKerja) {
    const li = document.createElement("li");
    const tombol = document.createElement("button");
    tombol.type = "button";
    tombol.className = "tombol-ruang";
    tombol.textContent = ruang.nama;
    tombol.classList.toggle("aktif", ruang.id === state.ruang?.id);
    tombol.addEventListener("click", async () => {
      await pilihRuang(ruang);
    });
    li.append(tombol);
    daftar.append(li);
  }
}

async function pilihRuang(ruang) {
  state.ruang = ruang;
  state.terpilihId = null;
  state.cari = "";
  $("cari").value = "";
  $("rinci").hidden = true;
  tutupFormOrang();
  gambarDaftarRuang();
  $("judul-ruang").textContent = ruang ? ruang.nama : "Belum ada ruang kerja";
  $("tombol-tambah").disabled = !ruang;
  if (!ruang) {
    state.orang = [];
    gambarDaftarOrang();
    return;
  }
  await muatOrang();
}

async function buatRuang(peristiwa) {
  peristiwa.preventDefault();
  const masukan = peristiwa.currentTarget.elements.nama;
  const nama = String(masukan.value ?? "").trim();
  if (nama.length < 2) return;
  const hasil = await api.buatRuangKerja(nama);
  masukan.value = "";
  state.ruang = hasil.ruangKerja;
  await muatRuangKerja();
}

/* --------------------------------- Orang --------------------------------- */

async function muatOrang() {
  if (!state.ruang) return;
  const hasil = await api.orang(state.ruang.id, state.cari);
  state.orang = hasil.orang;
  gambarDaftarOrang();
}

function gambarDaftarOrang() {
  const daftar = $("daftar-orang");
  daftar.innerHTML = "";
  $("kosong-orang").hidden = state.orang.length > 0 || !state.ruang;
  $("jumlah-orang").textContent = state.ruang
    ? `${state.orang.length} orang${state.cari ? " cocok" : " tercatat"}`
    : "";

  for (const orang of state.orang) {
    const li = document.createElement("li");
    const tombol = document.createElement("button");
    tombol.type = "button";
    tombol.className = "kartu-orang";
    tombol.classList.toggle("aktif", orang.id === state.terpilihId);
    tombol.innerHTML = `
      <span class="awalan">${esc(orang.nama.slice(0, 1).toUpperCase())}</span>
      <span class="isi-orang">
        <strong>${esc(orang.nama)}</strong>
        <small>${esc([tahunTeks(orang), labelKelamin[orang.jenisKelamin]].filter(Boolean).join(" · "))}</small>
      </span>`;
    tombol.addEventListener("click", () => {
      bukaRinci(orang.id);
    });
    li.append(tombol);
    daftar.append(li);
  }
}

function bukaFormOrang(orang) {
  const form = $("form-orang");
  form.hidden = false;
  $("judul-form-orang").textContent = orang ? "Ubah data orang" : "Tambah orang";
  form.elements.nama.value = orang?.nama ?? "";
  form.elements.jenisKelamin.value = orang?.jenisKelamin ?? "U";
  form.elements.tahunLahir.value = orang?.tahunLahir ?? "";
  form.elements.tahunWafat.value = orang?.tahunWafat ?? "";
  form.elements.catatan.value = orang?.catatan ?? "";
  state.modeForm = orang ? orang.id : "tambah";
  pesan($("pesan-orang"), "");
  form.elements.nama.focus();
}

function tutupFormOrang() {
  $("form-orang").hidden = true;
  $("form-orang").reset();
  state.modeForm = "tambah";
  pesan($("pesan-orang"), "");
}

async function simpanOrang(peristiwa) {
  peristiwa.preventDefault();
  if (!state.ruang) return;
  const form = peristiwa.currentTarget;
  const data = {
    nama: String(form.elements.nama.value ?? "").trim(),
    jenisKelamin: String(form.elements.jenisKelamin.value ?? "U"),
    tahunLahir: form.elements.tahunLahir.value,
    tahunWafat: form.elements.tahunWafat.value,
    catatan: String(form.elements.catatan.value ?? "").trim(),
  };
  const tombol = form.querySelector("button[type=submit]");
  tombol.disabled = true;
  pesan($("pesan-orang"), "");
  try {
    if (state.modeForm === "tambah") {
      const hasil = await api.buatOrang(state.ruang.id, data);
      await muatOrang();
      tutupFormOrang();
      await bukaRinci(hasil.orang.id);
    } else {
      await api.ubahOrang(state.ruang.id, state.modeForm, data);
      await muatOrang();
      tutupFormOrang();
      await bukaRinci(state.modeForm);
    }
  } catch (galat) {
    pesan($("pesan-orang"), galat.message);
  } finally {
    tombol.disabled = false;
  }
}

/* --------------------------------- Rinci --------------------------------- */

async function bukaRinci(orangId) {
  const orang = state.orang.find((o) => o.id === orangId);
  if (!orang) return;
  state.terpilihId = orangId;
  gambarDaftarOrang();

  const panel = $("rinci");
  panel.hidden = false;
  panel.innerHTML = `<p class="keterangan kecil">Memuat…</p>`;

  const hasil = await api.relasi(state.ruang.id, orangId);
  const relasi = hasil.relasi;
  const orangTua = relasi
    .filter((r) => r.anakId === orangId)
    .map((r) => ({ relasiId: r.id, orang: cari(r.orangTuaId) }));
  const anak = relasi
    .filter((r) => r.orangTuaId === orangId)
    .map((r) => ({ relasiId: r.id, orang: cari(r.anakId) }));

  const calon = state.orang.filter((o) => o.id !== orangId);
  const opsi = (daftar) => daftar.map((o) => `<option value="${esc(o.id)}">${esc(o.nama)}</option>`).join("");

  panel.innerHTML = `
    <div class="rinci-kepala">
      <div>
        <h3>${esc(orang.nama)}</h3>
        <p class="keterangan kecil">${esc([tahunTeks(orang), labelKelamin[orang.jenisKelamin]].filter(Boolean).join(" · "))}</p>
      </div>
      <button type="button" class="tombol tombol-samar kecil" data-aksi="tutup" aria-label="Tutup">✕</button>
    </div>
    ${orang.catatan ? `<p class="rinci-catatan">${esc(orang.catatan)}</p>` : ""}

    <div class="tombol-baris">
      <button type="button" class="tombol tombol-samar kecil" data-aksi="ubah">Ubah data</button>
      <button type="button" class="tombol tombol-bahaya kecil" data-aksi="hapus">Hapus orang</button>
    </div>

    <section class="blok">
      <h4>Orang tua</h4>
      ${
        orangTua.length
          ? `<ul class="daftar-relasi">${orangTua
              .map(
                (r) => `<li><button type="button" class="tautan-orang" data-buka="${esc(r.orang?.id ?? "")}">${esc(r.orang?.nama ?? "?")}</button>
                <button type="button" class="tombol-ikon" data-hapus-relasi="${esc(r.relasiId)}" aria-label="Lepas relasi">✕</button></li>`,
              )
              .join("")}</ul>`
          : `<p class="keterangan kecil">Belum dicatat.</p>`
      }
      <div class="relasi-baris">
        <select data-pilih="orangTua">${opsi(calon)}</select>
        <button type="button" class="tombol tombol-samar kecil" data-aksi="tambah-orangtua" ${calon.length ? "" : "disabled"}>Tambah</button>
      </div>
    </section>

    <section class="blok">
      <h4>Anak</h4>
      ${
        anak.length
          ? `<ul class="daftar-relasi">${anak
              .map(
                (r) => `<li><button type="button" class="tautan-orang" data-buka="${esc(r.orang?.id ?? "")}">${esc(r.orang?.nama ?? "?")}</button>
                <button type="button" class="tombol-ikon" data-hapus-relasi="${esc(r.relasiId)}" aria-label="Lepas relasi">✕</button></li>`,
              )
              .join("")}</ul>`
          : `<p class="keterangan kecil">Belum dicatat.</p>`
      }
      <div class="relasi-baris">
        <select data-pilih="anak">${opsi(calon)}</select>
        <button type="button" class="tombol tombol-samar kecil" data-aksi="tambah-anak" ${calon.length ? "" : "disabled"}>Tambah</button>
      </div>
    </section>

    <section class="blok">
      <div class="blok-kepala">
        <h4>Silsilah</h4>
        <div class="tab tab-kecil">
          <button type="button" data-arah="turun" class="${state.arah === "turun" ? "tab-aktif" : ""}">Keturunan</button>
          <button type="button" data-arah="naik" class="${state.arah === "naik" ? "tab-aktif" : ""}">Leluhur</button>
        </div>
      </div>
      <div id="pohon" class="pohon-wadah"><p class="keterangan kecil">Memuat silsilah…</p></div>
    </section>

    <p class="pesan" id="pesan-rinci" role="alert" hidden></p>
  `;

  panel.querySelector('[data-aksi="tutup"]').addEventListener("click", () => {
    panel.hidden = true;
    state.terpilihId = null;
    gambarDaftarOrang();
  });

  panel.querySelector('[data-aksi="ubah"]').addEventListener("click", () => bukaFormOrang(orang));

  panel.querySelector('[data-aksi="hapus"]').addEventListener("click", async () => {
    if (!confirm(`Hapus ${orang.nama} beserta semua relasinya?`)) return;
    await api.hapusOrang(state.ruang.id, orang.id);
    panel.hidden = true;
    state.terpilihId = null;
    await muatOrang();
  });

  async function tambahRelasi(peran) {
    const pilihan = panel.querySelector(`[data-pilih="${peran}"]`);
    const idLain = pilihan?.value;
    if (!idLain) return;
    try {
      if (peran === "orangTua") await api.buatRelasi(state.ruang.id, idLain, orang.id);
      else await api.buatRelasi(state.ruang.id, orang.id, idLain);
      await bukaRinci(orang.id);
    } catch (galat) {
      pesan($("pesan-rinci"), galat.message);
    }
  }

  panel.querySelector('[data-aksi="tambah-orangtua"]').addEventListener("click", () => tambahRelasi("orangTua"));
  panel.querySelector('[data-aksi="tambah-anak"]').addEventListener("click", () => tambahRelasi("anak"));

  panel.addEventListener("click", async (peristiwa) => {
    const tombolHapus = peristiwa.target.closest("[data-hapus-relasi]");
    if (tombolHapus) {
      await api.hapusRelasi(state.ruang.id, tombolHapus.dataset.hapusRelasi);
      await bukaRinci(orang.id);
      return;
    }
    const tautan = peristiwa.target.closest("[data-buka]");
    if (tautan?.dataset.buka) {
      await bukaRinci(tautan.dataset.buka);
    }
  });

  for (const tombol of panel.querySelectorAll("[data-arah]")) {
    tombol.addEventListener("click", async () => {
      state.arah = tombol.dataset.arah;
      for (const lain of panel.querySelectorAll("[data-arah]")) {
        lain.classList.toggle("tab-aktif", lain === tombol);
      }
      await gambarPohon(orang.id);
    });
  }

  await gambarPohon(orang.id);

  /** Mencari orang berdasarkan id di daftar yang sudah dimuat. */
  function cari(id) {
    return state.orang.find((o) => o.id === id) ?? null;
  }
}

async function gambarPohon(orangId) {
  const wadah = $("pohon");
  if (!wadah) return;
  try {
    const hasil = await api.silsilah(state.ruang.id, orangId, state.arah, 6);
    const anakDari = new Map();
    for (const simpul of hasil.simpul) {
      if (simpul.lewat.length < 2) continue;
      const induk = simpul.lewat[simpul.lewat.length - 2];
      if (!anakDari.has(induk)) anakDari.set(induk, []);
      anakDari.get(induk).push(simpul);
    }

    const bangun = (simpul) => {
      const cabang = anakDari.get(simpul.orang.id) ?? [];
      const keterangan = tahunTeks(simpul.orang);
      const isi = `<button type="button" class="tautan-orang" data-buka="${esc(simpul.orang.id)}">${esc(simpul.orang.nama)}</button>${keterangan ? ` <span class="kecil samar">${esc(keterangan)}</span>` : ""}`;
      return `<li>${isi}${cabang.length ? `<ul>${cabang.map(bangun).join("")}</ul>` : ""}</li>`;
    };

    wadah.innerHTML = `<ul class="pohon">${bangun(hasil.simpul[0])}</ul>`;
    if (hasil.simpul.length === 1) {
      wadah.insertAdjacentHTML(
        "beforeend",
        `<p class="keterangan kecil">Belum ada ${state.arah === "turun" ? "keturunan" : "leluhur"} yang tercatat.</p>`,
      );
    }
  } catch (galat) {
    wadah.innerHTML = `<p class="keterangan kecil">${esc(galat.message)}</p>`;
  }
}

/* ------------------------------- Inisialisasi ---------------------------- */

function pasangPeristiwa() {
  pasangTab();
  $("form-masuk").addEventListener("submit", tanganiMasuk);
  $("form-daftar").addEventListener("submit", tanganiDaftar);
  $("form-ruang").addEventListener("submit", buatRuang);
  $("form-orang").addEventListener("submit", simpanOrang);
  $("batal-orang").addEventListener("click", tutupFormOrang);
  $("tombol-tambah").addEventListener("click", () => bukaFormOrang(null));
  $("tombol-keluar").addEventListener("click", async () => {
    await api.keluar();
    state.pengguna = null;
    state.ruang = null;
    state.orang = [];
    tampilkanMasuk();
  });

  let pewaktu;
  $("cari").addEventListener("input", (peristiwa) => {
    state.cari = peristiwa.target.value.trim();
    clearTimeout(pewaktu);
    pewaktu = setTimeout(async () => {
      await muatOrang();
      if (state.terpilihId) await bukaRinci(state.terpilihId);
    }, 220);
  });
}

async function mulai() {
  pasangPeristiwa();
  try {
    const hasil = await api.saya();
    state.pengguna = hasil.pengguna;
    await bukaAplikasi();
  } catch {
    tampilkanMasuk();
  }
}

mulai();

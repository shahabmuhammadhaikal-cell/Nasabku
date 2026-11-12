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
  saring: { jk: "", status: "", dari: "", sampai: "" },
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

const BULAN_PANJANG = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** Tanggal bertingkat ("1954", "1954-06", "1954-06-12") menjadi teks Indonesia. */
function formatTanggal(tanggal) {
  if (!tanggal) return "";
  const cocok = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(tanggal);
  if (!cocok) return tanggal;
  const tahun = Number(cocok[1]);
  if (!cocok[2]) return String(tahun);
  const bulan = BULAN_PANJANG[Number(cocok[2]) - 1] ?? "";
  if (!cocok[3]) return `${bulan} ${tahun}`;
  return `${Number(cocok[3])} ${bulan} ${tahun}`;
}

function tahunTeks(orang) {
  const lahir = formatTanggal(orang.tanggalLahir);
  const wafat = formatTanggal(orang.tanggalWafat);
  if (!lahir && !wafat) return "";
  if (wafat) return `${lahir || "?"} – ${wafat}`;
  return `lahir ${lahir}`;
}

function faktaOrang(orang) {
  const baris = [
    ["Nama panggilan", orang.namaLain],
    ["Jenis kelamin", labelKelamin[orang.jenisKelamin] ?? "Belum diketahui"],
    ["Lahir", [formatTanggal(orang.tanggalLahir), orang.tempatLahir].filter(Boolean).join(" · ") || "—"],
    ["Wafat", [formatTanggal(orang.tanggalWafat), orang.tempatWafat].filter(Boolean).join(" · ") || "—"],
    ["Makam", orang.tempatPemakaman],
    ["Pekerjaan", orang.pekerjaan],
    ["Sumber", orang.sumber],
  ];
  return `<dl class="rinci-fakta">${baris
    .filter(([, nilai]) => Boolean(nilai))
    .map(([label, nilai]) => `<div><dt>${esc(label)}</dt><dd>${esc(nilai)}</dd></div>`)
    .join("")}</dl>`;
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
  state.saring = { jk: "", status: "", dari: "", sampai: "" };
  $("saring-jk").value = "";
  $("saring-status").value = "";
  $("saring-dari").value = "";
  $("saring-sampai").value = "";
  $("rinci").hidden = true;
  tutupFormOrang();
  gambarDaftarRuang();
  $("judul-ruang").textContent = ruang ? ruang.nama : "Belum ada ruang kerja";
  $("tombol-tambah").disabled = !ruang;
  if (!ruang) {
    state.orang = [];
    gambarDaftarOrang();
    $("statistik").hidden = true;
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
  await muatStatistik();
}

/* ------------------------------- Statistik ------------------------------- */

async function muatStatistik() {
  const wadah = $("statistik");
  if (!wadah) return;
  if (!state.ruang) {
    wadah.hidden = true;
    wadah.innerHTML = "";
    return;
  }
  try {
    const hasil = await api.statistik(state.ruang.id);
    gambarStatistik(hasil.statistik);
  } catch {
    wadah.hidden = true;
  }
}

function gambarStatistik(statistik) {
  const wadah = $("statistik");
  const chip = (nilai, label) =>
    `<span class="chip"><strong>${esc(String(nilai))}</strong> ${esc(label)}</span>`;
  const rentang = statistik.tahunTertua
    ? `${statistik.tahunTertua}${
        statistik.tahunTermuda && statistik.tahunTermuda !== statistik.tahunTertua
          ? `–${statistik.tahunTermuda}`
          : ""
      }`
    : null;

  wadah.innerHTML = [
    chip(statistik.jumlahOrang, "orang"),
    chip(statistik.jumlahAngkatan, "angkatan"),
    chip(statistik.jumlahRelasi, "relasi"),
    chip(`${statistik.lakiLaki}/${statistik.perempuan}`, "L/P"),
    chip(statistik.jumlahAkar, "akar"),
    ...(rentang ? [chip(rentang, "rentang lahir")] : []),
  ].join("");
  wadah.hidden = statistik.jumlahOrang === 0;
}

function unduhBerkas(isi, namaBerkasUnduhan, tipe) {
  const blob = new Blob([isi], { type: tipe });
  const tautan = document.createElement("a");
  tautan.href = URL.createObjectURL(blob);
  tautan.download = namaBerkasUnduhan;
  document.body.append(tautan);
  tautan.click();
  tautan.remove();
  setTimeout(() => URL.revokeObjectURL(tautan.href), 2000);
}

async function tanganiEkspor() {
  if (!state.ruang) return;
  try {
    const data = await api.ekspor(state.ruang.id);
    unduhBerkas(
      JSON.stringify(data, null, 2),
      `nasabku-${namaBerkas(state.ruang.nama)}.json`,
      "application/json",
    );
  } catch (galat) {
    alert(galat.message);
  }
}

async function tanganiEksporGedcom() {
  if (!state.ruang) return;
  try {
    const teks = await api.eksporGedcom(state.ruang.id);
    unduhBerkas(teks, `nasabku-${namaBerkas(state.ruang.nama)}.ged`, "text/plain;charset=utf-8");
  } catch (galat) {
    alert(galat.message);
  }
}

async function tanganiImporGedcom(peristiwa) {
  const berkas = peristiwa.target.files?.[0];
  peristiwa.target.value = "";
  if (!berkas || !state.ruang) return;
  if (
    !confirm(
      `Impor “${berkas.name}” ke ruang kerja “${state.ruang.nama}”? Data yang ada akan ditambah, tidak ditimpa.`,
    )
  ) {
    return;
  }

  try {
    const hasil = await api.imporGedcom(state.ruang.id, await berkas.text());
    const info = hasil.impor;
    const catatan = [
      `${info.orang} orang`,
      `${info.relasi} relasi`,
      info.relasiDilewati ? `${info.relasiDilewati} relasi dilewati` : null,
      info.tanggalDiabaikan ? `${info.tanggalDiabaikan} tanggal tidak dikenali` : null,
      info.namaDiabaikan ? `${info.namaDiabaikan} entri tanpa nama dilewati` : null,
    ]
      .filter(Boolean)
      .join(", ");
    alert(`Impor selesai: ${catatan}.`);
    await muatOrang();
  } catch (galat) {
    alert(galat.message);
  }
}

function namaBerkas(nama) {
  return (
    nama
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "silsilah"
  );
}

const tahunLahir = (orang) => {
  const tahun = Number(String(orang.tanggalLahir ?? "").slice(0, 4));
  return Number.isInteger(tahun) && tahun > 0 ? tahun : null;
};

/** Daftar orang setelah disaring di peramban: jenis kelamin, status hidup, rentang tahun lahir. */
function orangTersaring() {
  const { jk, status, dari, sampai } = state.saring;
  const batasDari = dari ? Number(dari) : null;
  const batasSampai = sampai ? Number(sampai) : null;
  return state.orang.filter((orang) => {
    if (jk && orang.jenisKelamin !== jk) return false;
    if (status === "hidup" && orang.tanggalWafat) return false;
    if (status === "wafat" && !orang.tanggalWafat) return false;
    const tahun = tahunLahir(orang);
    if (batasDari !== null && (tahun === null || tahun < batasDari)) return false;
    if (batasSampai !== null && (tahun === null || tahun > batasSampai)) return false;
    return true;
  });
}

function gambarDaftarOrang() {
  const daftar = $("daftar-orang");
  const tampil = orangTersaring();
  daftar.innerHTML = "";
  $("kosong-orang").hidden = state.orang.length > 0 || !state.ruang;
  $("kosong-saring").hidden = !state.ruang || state.orang.length === 0 || tampil.length > 0;
  $("jumlah-orang").textContent = state.ruang
    ? tampil.length === state.orang.length
      ? `${tampil.length} orang${state.cari ? " cocok" : " tercatat"}`
      : `${tampil.length} dari ${state.orang.length} orang`
    : "";

  for (const orang of tampil) {
    const li = document.createElement("li");
    const tombol = document.createElement("button");
    tombol.type = "button";
    tombol.className = "kartu-orang";
    tombol.classList.toggle("aktif", orang.id === state.terpilihId);
    tombol.innerHTML = `
      <span class="awalan awalan-${orang.jenisKelamin.toLowerCase()}">${esc(orang.nama.slice(0, 1).toUpperCase())}</span>
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
  form.elements.namaLain.value = orang?.namaLain ?? "";
  form.elements.jenisKelamin.value = orang?.jenisKelamin ?? "U";
  form.elements.pekerjaan.value = orang?.pekerjaan ?? "";
  form.elements.tanggalLahir.value = orang?.tanggalLahir ?? "";
  form.elements.tempatLahir.value = orang?.tempatLahir ?? "";
  form.elements.tanggalWafat.value = orang?.tanggalWafat ?? "";
  form.elements.tempatWafat.value = orang?.tempatWafat ?? "";
  form.elements.tempatPemakaman.value = orang?.tempatPemakaman ?? "";
  form.elements.catatan.value = orang?.catatan ?? "";
  form.elements.sumber.value = orang?.sumber ?? "";
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
    namaLain: String(form.elements.namaLain.value ?? "").trim(),
    jenisKelamin: String(form.elements.jenisKelamin.value ?? "U"),
    pekerjaan: String(form.elements.pekerjaan.value ?? "").trim(),
    tanggalLahir: form.elements.tanggalLahir.value,
    tempatLahir: form.elements.tempatLahir.value,
    tanggalWafat: form.elements.tanggalWafat.value,
    tempatWafat: form.elements.tempatWafat.value,
    tempatPemakaman: String(form.elements.tempatPemakaman.value ?? "").trim(),
    catatan: String(form.elements.catatan.value ?? "").trim(),
    sumber: String(form.elements.sumber.value ?? "").trim(),
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
        <p class="keterangan kecil">${esc(labelKelamin[orang.jenisKelamin] ?? "Belum diketahui")}</p>
      </div>
      <button type="button" class="tombol tombol-samar kecil" data-aksi="tutup" aria-label="Tutup">✕</button>
    </div>
    ${faktaOrang(orang)}
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

const UKURAN_POHON = { lebar: 158, tinggi: 54, jarakX: 24, jarakY: 66 };

function potongTeks(teks, maks) {
  return teks.length > maks ? `${teks.slice(0, maks - 1)}…` : teks;
}

/**
 * Menggambar silsilah sebagai SVG: tiap angkatan satu baris, garis penghubung
 * mengikuti rantai `lewat` dari server sehingga percabangan tetap terlihat.
 */
function gambarPohonSvg(simpul) {
  const perAngkatan = new Map();
  for (const s of simpul) {
    const daftar = perAngkatan.get(s.kedalaman) ?? [];
    daftar.push(s);
    perAngkatan.set(s.kedalaman, daftar);
  }

  const angkatan = [...perAngkatan.keys()].sort((a, b) => a - b);
  const lebarKolom = UKURAN_POHON.lebar + UKURAN_POHON.jarakX;
  const kolomTerbanyak = Math.max(...angkatan.map((k) => perAngkatan.get(k).length));
  const lebar = Math.max(kolomTerbanyak * lebarKolom - UKURAN_POHON.jarakX, UKURAN_POHON.lebar);
  const tinggi = angkatan.length * (UKURAN_POHON.tinggi + UKURAN_POHON.jarakY) - UKURAN_POHON.jarakY;

  const posisi = new Map();
  for (const k of angkatan) {
    const daftar = perAngkatan.get(k);
    const total = daftar.length * lebarKolom - UKURAN_POHON.jarakX;
    const mulai = (lebar - total) / 2;
    daftar.forEach((s, i) => {
      posisi.set(s.orang.id, {
        x: mulai + i * lebarKolom,
        y: k * (UKURAN_POHON.tinggi + UKURAN_POHON.jarakY),
      });
    });
  }

  const garis = [];
  for (const s of simpul) {
    if (s.lewat.length < 2) continue;
    const induk = posisi.get(s.lewat[s.lewat.length - 2]);
    const anak = posisi.get(s.orang.id);
    if (!induk || !anak) continue;
    const x1 = induk.x + UKURAN_POHON.lebar / 2;
    const x2 = anak.x + UKURAN_POHON.lebar / 2;
    const y1 = induk.y + UKURAN_POHON.tinggi;
    const y2 = anak.y;
    const tengah = (y1 + y2) / 2;
    garis.push(
      `<path d="M${x1} ${y1} C ${x1} ${tengah}, ${x2} ${tengah}, ${x2} ${y2}" fill="none" stroke="#c9d8d0" stroke-width="1.5" />`,
    );
  }

  const kotak = simpul.map((s) => {
    const p = posisi.get(s.orang.id);
    const aktif = s.orang.id === state.terpilihId ? " aktif" : "";
    const keterangan = tahunTeks(s.orang) || "—";
    return `<g class="simpul-pohon${aktif}" data-buka="${esc(s.orang.id)}" transform="translate(${p.x} ${p.y})" role="button" tabindex="0">
      <rect width="${UKURAN_POHON.lebar}" height="${UKURAN_POHON.tinggi}" rx="12" />
      <circle cx="24" cy="${UKURAN_POHON.tinggi / 2}" r="14" />
      <text x="24" y="${UKURAN_POHON.tinggi / 2 + 5}" text-anchor="middle" class="awalan-pohon">${esc(
        s.orang.nama.slice(0, 1).toUpperCase(),
      )}</text>
      <text x="46" y="23" class="nama-pohon">${esc(potongTeks(s.orang.nama, 15))}</text>
      <text x="46" y="39" class="tahun-pohon">${esc(keterangan)}</text>
    </g>`;
  });

  return `<div class="pohon-gulir"><svg class="pohon-svg" width="${lebar}" height="${tinggi}" viewBox="0 0 ${lebar} ${tinggi}" role="img" aria-label="Pohon silsilah">${garis.join(
    "",
  )}${kotak.join("")}</svg></div>`;
}

async function gambarPohon(orangId) {
  const wadah = $("pohon");
  if (!wadah) return;
  try {
    const hasil = await api.silsilah(state.ruang.id, orangId, state.arah, 6);
    if (hasil.simpul.length <= 1) {
      wadah.innerHTML = `<p class="keterangan kecil">Belum ada ${
        state.arah === "turun" ? "keturunan" : "leluhur"
      } yang tercatat.</p>`;
      return;
    }
    wadah.innerHTML = gambarPohonSvg(hasil.simpul);
  } catch (galat) {
    wadah.innerHTML = `<p class="keterangan kecil">${esc(galat.message)}</p>`;
  }
}

/* ------------------------------- Inisialisasi ---------------------------- */

function perbaruiSaring() {
  state.saring = {
    jk: $("saring-jk").value,
    status: $("saring-status").value,
    dari: $("saring-dari").value.trim(),
    sampai: $("saring-sampai").value.trim(),
  };
  gambarDaftarOrang();
}

function pasangPeristiwa() {
  pasangTab();
  $("form-masuk").addEventListener("submit", tanganiMasuk);
  $("form-daftar").addEventListener("submit", tanganiDaftar);
  $("form-ruang").addEventListener("submit", buatRuang);
  $("form-orang").addEventListener("submit", simpanOrang);
  $("batal-orang").addEventListener("click", tutupFormOrang);
  $("tombol-tambah").addEventListener("click", () => bukaFormOrang(null));
  $("tombol-ekspor").addEventListener("click", tanganiEkspor);
  $("tombol-gedcom").addEventListener("click", tanganiEksporGedcom);
  $("tombol-impor").addEventListener("click", () => $("berkas-gedcom").click());
  $("berkas-gedcom").addEventListener("change", tanganiImporGedcom);
  for (const id of ["saring-jk", "saring-status", "saring-dari", "saring-sampai"]) {
    $(id).addEventListener("input", perbaruiSaring);
  }
  $("saring-bersih").addEventListener("click", () => {
    state.saring = { jk: "", status: "", dari: "", sampai: "" };
    $("saring-jk").value = "";
    $("saring-status").value = "";
    $("saring-dari").value = "";
    $("saring-sampai").value = "";
    gambarDaftarOrang();
  });
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

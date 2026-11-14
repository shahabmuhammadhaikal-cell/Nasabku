import { api } from "./api.js";

const $ = (id) => document.getElementById(id);

const state = {
  pengguna: null,
  ruangKerja: [],
  ruang: null,
  orang: [],
  pasangan: [],
  ubahPasangan: null,
  terpilihId: null,
  arah: "turun",
  cari: "",
  saring: { jk: "", status: "", dari: "", sampai: "" },
  modeForm: "tambah",
  tampilan: "ringkasan",
  statistik: null,
  sidebarCiut: false,
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
    ["Usia saat wafat", usiaTeks(orang)],
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
  $("navigasi-utama").hidden = true;
  $("sisi-pengguna").hidden = true;
  $("tampilan-masuk").hidden = false;
}

async function bukaAplikasi() {
  $("tampilan-masuk").hidden = true;
  $("tampilan-aplikasi").hidden = false;
  $("navigasi-utama").hidden = false;
  $("sisi-pengguna").hidden = false;
  const nama = state.pengguna?.nama ?? "";
  $("nama-pengguna").textContent = nama;
  $("awalan-pengguna").textContent = (nama.trim().slice(0, 1) || "U").toUpperCase();
  await muatRuangKerja();
}

const KUNCI_SIDEBAR = "nasabku.sidebar-ciut";

/** Menyembunyikan/menampilkan sidebar ruang kerja (hanya berlaku di layar lebar). */
function terapkanSidebar(ciut) {
  state.sidebarCiut = Boolean(ciut);
  document.querySelector(".tata-letak")?.classList.toggle("ciut", state.sidebarCiut);

  const tombol = $("tombol-sidebar");
  if (tombol) {
    tombol.setAttribute("aria-expanded", state.sidebarCiut ? "false" : "true");
    tombol.title = state.sidebarCiut ? "Tampilkan ruang kerja" : "Sembunyikan ruang kerja";
    const label = tombol.querySelector(".label-ciut");
    if (label) label.textContent = state.sidebarCiut ? "Tampilkan ruang kerja" : "Ruang kerja";
  }

  try {
    localStorage.setItem(KUNCI_SIDEBAR, state.sidebarCiut ? "1" : "0");
  } catch {
    // Mode privat / penyimpanan ditolak: cukup diingat selama sesi ini.
  }
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
  state.pasangan = [];
  state.ubahPasangan = null;
  state.statistik = null;
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
    setTampilan("ringkasan");
    return;
  }
  setTampilan("ringkasan");
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
  const [hasil, hasilPasangan] = await Promise.all([
    api.orang(state.ruang.id, state.cari),
    api.pasangan(state.ruang.id),
  ]);
  state.orang = hasil.orang;
  state.pasangan = hasilPasangan.pasangan;
  gambarDaftarOrang();
  if (state.tampilan === "ringkasan") gambarRingkasan();
  if (!$("kronologi").hidden) gambarKronologi();
  await muatStatistik();
}

/* ------------------------------- Kronologi -------------------------------- */

/** Peristiwa lahir dan wafat dari data yang sudah dimuat, diurutkan menurut tahun. */
function peristiwaKronologi() {
  const daftar = [];
  for (const orang of state.orang) {
    const tahunLahirOrang = tahunLahir(orang);
    if (tahunLahirOrang) {
      daftar.push({
        tahun: tahunLahirOrang,
        nama: orang.nama,
        teks: orang.tempatLahir ? `lahir di ${orang.tempatLahir}` : "lahir",
      });
    }
    const tahunWafat = Number(String(orang.tanggalWafat ?? "").slice(0, 4));
    if (Number.isInteger(tahunWafat) && tahunWafat > 0) {
      const usia = usiaTeks(orang);
      daftar.push({
        tahun: tahunWafat,
        nama: orang.nama,
        teks: [
          orang.tempatWafat ? `wafat di ${orang.tempatWafat}` : "wafat",
          usia ? `(${usia})` : null,
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
  }
  const namaOrang = (id) => state.orang.find((satu) => satu.id === id)?.nama ?? "?";
  for (const satu of state.pasangan) {
    const tahunMenikah = Number(String(satu.tanggalMenikah ?? "").slice(0, 4));
    if (!Number.isInteger(tahunMenikah) || tahunMenikah <= 0) continue;
    const namaA = namaOrang(satu.orangAId);
    const namaB = namaOrang(satu.orangBId);
    const statusTeks =
      satu.status === "cerai"
        ? "bercerai"
        : satu.status === "meninggal"
          ? "berakhir karena kematian"
          : null;
    daftar.push({
      tahun: tahunMenikah,
      nama: `${namaA} & ${namaB}`,
      teks: `menikah (ke-${satu.urutanA} bagi ${namaA}, ke-${satu.urutanB} bagi ${namaB})${
        statusTeks ? ` · ${statusTeks}` : ""
      }`,
    });

    const tahunBerakhir = Number(String(satu.tanggalBerakhir ?? "").slice(0, 4));
    if (satu.status !== "menikah" && Number.isInteger(tahunBerakhir) && tahunBerakhir > 0) {
      daftar.push({
        tahun: tahunBerakhir,
        nama: `${namaA} & ${namaB}`,
        teks:
          satu.status === "cerai"
            ? "bercerai"
            : "pernikahan berakhir (salah satu meninggal)",
      });
    }
  }

  return daftar.sort(
    (a, b) => a.tahun - b.tahun || a.nama.localeCompare(b.nama, "id", { sensitivity: "base" }),
  );
}

function gambarKronologi() {
  const daftar = peristiwaKronologi();
  $("kronologi-kosong").hidden = daftar.length > 0;
  $("daftar-kronologi").innerHTML = daftar
    .map(
      (peristiwa) =>
        `<li><span class="kronologi-tahun">${esc(String(peristiwa.tahun))}</span><span class="kronologi-isi"><strong>${esc(peristiwa.nama)}</strong> ${esc(peristiwa.teks)}</span></li>`,
    )
    .join("");
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
    state.statistik = hasil.statistik;
    gambarStatistik(hasil.statistik);
    if (state.tampilan === "ringkasan") gambarRingkasan();
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
    ...(statistik.jumlahPasangan ? [chip(statistik.jumlahPasangan, "pasangan")] : []),
    chip(`${statistik.lakiLaki}/${statistik.perempuan}`, "L/P"),
    chip(statistik.jumlahAkar, "akar"),
    ...(rentang ? [chip(rentang, "rentang lahir")] : []),
  ].join("");
  wadah.hidden = statistik.jumlahOrang === 0 || state.tampilan === "ringkasan";
}

/* ------------------------------- Ringkasan ------------------------------- */

const labelStatusPernikahan = {
  menikah: "Masih menikah",
  cerai: "Bercerai",
  meninggal: "Pasangan meninggal",
};

/** Ulang tahun berikutnya untuk orang dengan tanggal lahir lengkap. */
function ulangTahunTerdekat(batas = 5) {
  const sekarang = new Date();
  const hariIni = new Date(sekarang.getFullYear(), sekarang.getMonth(), sekarang.getDate());
  const hasil = [];

  for (const orang of state.orang) {
    if (orang.tanggalWafat) continue;
    const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(orang.tanggalLahir ?? "");
    if (!cocok) continue;
    const tahun = Number(cocok[1]);
    const bulan = Number(cocok[2]) - 1;
    const tanggal = Number(cocok[3]);
    let ulang = new Date(hariIni.getFullYear(), bulan, tanggal);
    if (ulang < hariIni) ulang = new Date(hariIni.getFullYear() + 1, bulan, tanggal);
    const selisih = Math.round((ulang - hariIni) / 86_400_000);
    hasil.push({
      orang,
      selisih,
      usia: ulang.getFullYear() - tahun,
      tanggal: `${tanggal} ${BULAN_PANJANG[bulan] ?? ""}`,
    });
  }

  return hasil.sort((a, b) => a.selisih - b.selisih).slice(0, batas);
}

/** Pernikahan dengan tanggal terbaru, untuk kartu ringkasan. */
function pernikahanTerbaru(batas = 5) {
  const nama = (id) => state.orang.find((orang) => orang.id === id)?.nama ?? "?";
  return state.pasangan
    .filter((satu) => Boolean(satu.tanggalMenikah))
    .sort((a, b) => (b.tanggalMenikah ?? "").localeCompare(a.tanggalMenikah ?? ""))
    .slice(0, batas)
    .map((satu) => ({ ...satu, namaA: nama(satu.orangAId), namaB: nama(satu.orangBId) }));
}

function gambarRingkasan() {
  const wadah = $("ringkasan");
  if (!wadah) return;
  if (!state.ruang) {
    wadah.innerHTML = `<p class="kosong">Pilih atau buat ruang kerja untuk melihat ringkasan.</p>`;
    return;
  }

  const statistik = state.statistik ?? {
    jumlahOrang: state.orang.length,
    jumlahRelasi: 0,
    jumlahPasangan: state.pasangan.length,
    jumlahAngkatan: 0,
    lakiLaki: 0,
    perempuan: 0,
  };

  const kartu = [
    [
      "Orang tercatat",
      statistik.jumlahOrang,
      `${statistik.lakiLaki} laki-laki · ${statistik.perempuan} perempuan`,
    ],
    [
      "Relasi orang tua–anak",
      statistik.jumlahRelasi,
      `${statistik.jumlahAngkatan ?? 0} angkatan`,
    ],
    ["Pasangan", statistik.jumlahPasangan, "pernikahan tercatat"],
  ];

  const ulangTahun = ulangTahunTerdekat();
  const pernikahan = pernikahanTerbaru();

  const daftarUlangTahun = ulangTahun.length
    ? `<ul class="ringkasan-daftar">${ulangTahun
        .map(({ orang, selisih, usia, tanggal }) => {
          const kapan =
            selisih === 0 ? "hari ini" : selisih === 1 ? "besok" : `dalam ${selisih} hari`;
          return `<li><button type="button" class="tautan-orang" data-buka="${esc(orang.id)}"><strong>${esc(orang.nama)}</strong><span>${esc(tanggal)} · ${esc(kapan)} · ulang tahun ke-${esc(String(usia))}</span></button></li>`;
        })
        .join("")}</ul>`
    : `<p class="keterangan kecil">Belum ada tanggal lahir lengkap (hari dan bulan) untuk dihitung.</p>`;

  const daftarPernikahan = pernikahan.length
    ? `<ul class="ringkasan-daftar">${pernikahan
        .map(
          (satu) =>
            `<li><button type="button" class="tautan-orang" data-buka="${esc(satu.orangAId)}"><strong>${esc(satu.namaA)} &amp; ${esc(satu.namaB)}</strong><span>${esc(formatTanggal(satu.tanggalMenikah))} · ke-${esc(String(satu.urutanA))} bagi ${esc(satu.namaA)}, ke-${esc(String(satu.urutanB))} bagi ${esc(satu.namaB)}${satu.status !== "menikah" ? ` · ${esc(labelStatusPernikahan[satu.status] ?? satu.status)}` : ""}</span></button></li>`,
        )
        .join("")}</ul>`
    : `<p class="keterangan kecil">Belum ada tanggal pernikahan yang tercatat.</p>`;

  wadah.innerHTML = `
    <div class="ringkasan-kartu">
      ${kartu
        .map(
          ([label, nilai, catatan]) =>
            `<article class="kartu ringkasan-angka"><span class="ringkasan-label">${esc(label)}</span><strong>${esc(String(nilai))}</strong><small>${esc(catatan)}</small></article>`,
        )
        .join("")}
    </div>
    <div class="ringkasan-panel-baris">
      <article class="kartu ringkasan-panel">
        <header>
          <h3>Ulang tahun terdekat</h3>
          <p class="keterangan kecil">Anggota keluarga yang masih hidup, urut dari yang paling dekat.</p>
        </header>
        ${daftarUlangTahun}
      </article>
      <article class="kartu ringkasan-panel">
        <header>
          <h3>Pernikahan terbaru</h3>
          <p class="keterangan kecil">Tanggal menikah terbaru beserta urutan per orang.</p>
        </header>
        ${daftarPernikahan}
      </article>
    </div>`;
}

/** Mengalihkan kolom tengah antara ringkasan dan daftar orang. */
function setTampilan(mode) {
  state.tampilan = mode === "orang" ? "orang" : "ringkasan";
  const ringkasan = mode === "ringkasan";

  for (const tombol of document.querySelectorAll(".tab-tampilan-tombol")) {
    const aktif = tombol.dataset.tampilan === state.tampilan;
    tombol.classList.toggle("aktif", aktif);
    tombol.setAttribute("aria-selected", aktif ? "true" : "false");
  }

  const wadah = $("ringkasan");
  if (wadah) wadah.hidden = !ringkasan;
  $("daftar-orang").hidden = ringkasan;
  $("saring").hidden = ringkasan;
  if ($("statistik")) $("statistik").hidden = ringkasan || !state.statistik;
  $("kosong-orang").hidden = true;
  $("kosong-saring").hidden = true;

  if (ringkasan) gambarRingkasan();
  else gambarDaftarOrang();

  if (!state.statistik) muatStatistik();
  else gambarStatistik(state.statistik);
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
      `Impor “${berkas.name}” ke ruang kerja “${state.ruang.nama}”? Orang yang sudah tercatat akan digabung, bukan diduplikasi.`,
    )
  ) {
    return;
  }

  try {
    const hasil = await api.imporGedcom(state.ruang.id, await berkas.text());
    const info = hasil.impor;
    const catatan = [
      `${info.orang} orang dibaca`,
      info.digabung ? `${info.digabung} digabung dengan data yang sudah ada` : null,
      `${info.relasi} relasi baru`,
      info.pasangan ? `${info.pasangan} pasangan baru` : null,
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

/** Nomor pernikahan `pasangan` dari sudut pandang `orangId` (1 = pertama). */
const urutanBagiOrang = (pasangan, orangId) =>
  pasangan.orangAId === orangId ? pasangan.urutanA : pasangan.urutanB;

/**
 * "Pernikahan ke-1 · bagi Siti Antarmuka ke-2 · 12 Juni 1995" — urutan dihitung
 * dari sisi masing-masing orang, jadi bila berbeda keduanya ditampilkan.
 */
function metaPasangan(pasangan) {
  const bagian = [`Pernikahan ke-${pasangan.urutan}`];
  if (pasangan.urutanPasangan && pasangan.urutanPasangan !== pasangan.urutan) {
    bagian.push(`bagi ${pasangan.orang?.nama ?? "pasangannya"} ke-${pasangan.urutanPasangan}`);
  }
  if (pasangan.tanggalMenikah) bagian.push(formatTanggal(pasangan.tanggalMenikah));
  if (pasangan.status === "cerai") {
    bagian.push(
      pasangan.tanggalBerakhir ? `bercerai ${formatTanggal(pasangan.tanggalBerakhir)}` : "bercerai",
    );
  } else if (pasangan.status === "meninggal") {
    bagian.push(
      pasangan.tanggalBerakhir
        ? `pasangan meninggal ${formatTanggal(pasangan.tanggalBerakhir)}`
        : "pasangan meninggal",
    );
  }
  return bagian.join(" · ");
}

/** Usia hanya bisa dihitung dari tahun; karena itu ditandai perkiraan (±). */
function usiaTeks(orang) {
  const lahir = tahunLahir(orang);
  const wafat = Number(String(orang.tanggalWafat ?? "").slice(0, 4));
  if (!lahir || !Number.isInteger(wafat) || wafat < lahir) return null;
  return `±${wafat - lahir} tahun`;
}

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

  if (state.terpilihId !== orangId) state.ubahPasangan = null;
  const relasi = (await api.relasi(state.ruang.id, orangId)).relasi;
  const pasangan = state.pasangan
    .filter((satu) => satu.orangAId === orangId || satu.orangBId === orangId)
    .map((satu) => ({
      pasanganId: satu.id,
      urutan: urutanBagiOrang(satu, orangId),
      urutanPasangan: urutanBagiOrang(
        satu,
        satu.orangAId === orangId ? satu.orangBId : satu.orangAId,
      ),
      tanggalMenikah: satu.tanggalMenikah,
      status: satu.status,
      tanggalBerakhir: satu.tanggalBerakhir,
      orang: cari(satu.orangAId === orangId ? satu.orangBId : satu.orangAId),
    }))
    .sort((a, b) => a.urutan - b.urutan);
  const sedangUbah = pasangan.find((satu) => satu.pasanganId === state.ubahPasangan) ?? null;
  const statusAwal = sedangUbah?.status ?? "menikah";
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
      <h4>Pasangan &amp; pernikahan</h4>
      <p class="keterangan kecil">Urutan pernikahan dihitung dari sisi masing-masing orang.</p>
      ${
        pasangan.length
          ? `<ul class="daftar-relasi">${pasangan
              .map(
                (r) => `<li class="baris-pasangan">
                <span class="pasangan-utama">
                  <button type="button" class="tautan-orang" data-buka="${esc(r.orang?.id ?? "")}">${esc(r.orang?.nama ?? "?")}</button>
                  <small class="pasangan-meta">${esc(metaPasangan(r))}</small>
                </span>
                <span class="pasangan-aksi">
                  <button type="button" class="tombol-ikon" data-ubah-pasangan="${esc(r.pasanganId)}" aria-label="Ubah data pernikahan">✎</button>
                  <button type="button" class="tombol-ikon" data-hapus-pasangan="${esc(r.pasanganId)}" aria-label="Lepas pasangan">✕</button>
                </span></li>`,
              )
              .join("")}</ul>`
          : `<p class="keterangan kecil">Belum dicatat.</p>`
      }
      <div class="form-pasangan">
        ${
          sedangUbah
            ? `<p class="keterangan kecil lebar-penuh">Ubah pernikahan dengan <strong>${esc(sedangUbah.orang?.nama ?? "?")}</strong></p>`
            : `<label class="isian-pasangan lebar-penuh">Pasangan
                <select data-isian="pasangan" ${calon.length ? "" : "disabled"}>${opsi(calon)}</select>
              </label>`
        }
        <label class="isian-pasangan">Tanggal menikah
          <input type="text" data-isian="tanggalMenikah" inputmode="numeric" maxlength="10" placeholder="1965-06-12" value="${esc(sedangUbah?.tanggalMenikah ?? "")}" />
        </label>
        <label class="isian-pasangan">Status pernikahan
          <select data-isian="status">
            <option value="menikah" ${statusAwal === "menikah" ? "selected" : ""}>Masih menikah</option>
            <option value="cerai" ${statusAwal === "cerai" ? "selected" : ""}>Bercerai</option>
            <option value="meninggal" ${statusAwal === "meninggal" ? "selected" : ""}>Pasangan meninggal</option>
          </select>
        </label>
        <label class="isian-pasangan">Tanggal berakhir
          <input type="text" data-isian="tanggalBerakhir" inputmode="numeric" maxlength="10" placeholder="1990-03-04" value="${esc(sedangUbah?.tanggalBerakhir ?? "")}" ${statusAwal === "menikah" ? "disabled" : ""} />
        </label>
        <div class="tombol-baris pasangan-tombol">
          <button type="button" class="tombol tombol-samar kecil" data-aksi="simpan-pasangan" ${!sedangUbah && !calon.length ? "disabled" : ""}>${sedangUbah ? "Simpan" : "Tambah"}</button>
          ${sedangUbah ? `<button type="button" class="tombol tombol-samar kecil" data-aksi="batal-pasangan">Batal</button>` : ""}
        </div>
      </div>
    </section>

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

  panel.querySelector('[data-aksi="simpan-pasangan"]').addEventListener("click", async () => {
    const form = panel.querySelector(".form-pasangan");
    const tanggalMentah = String(form.querySelector('[data-isian="tanggalMenikah"]').value ?? "").trim();
    const status = form.querySelector('[data-isian="status"]')?.value ?? "menikah";
    const berakhirMentah = String(
      form.querySelector('[data-isian="tanggalBerakhir"]')?.value ?? "",
    ).trim();
    const data = {
      tanggalMenikah: tanggalMentah === "" ? null : tanggalMentah,
      status,
      tanggalBerakhir: status === "menikah" || berakhirMentah === "" ? null : berakhirMentah,
    };
    try {
      if (state.ubahPasangan) {
        await api.ubahPasangan(state.ruang.id, state.ubahPasangan, data);
      } else {
        const pilihan = form.querySelector('[data-isian="pasangan"]');
        if (!pilihan?.value) return;
        await api.buatPasangan(state.ruang.id, orang.id, pilihan.value, data);
      }
      state.ubahPasangan = null;
      await muatOrang();
      await bukaRinci(orang.id);
    } catch (galat) {
      pesan($("pesan-rinci"), galat.message);
    }
  });

  panel.querySelector('[data-aksi="batal-pasangan"]')?.addEventListener("click", async () => {
    state.ubahPasangan = null;
    await bukaRinci(orang.id);
  });

  panel.querySelector('[data-isian="status"]')?.addEventListener("change", (peristiwa) => {
    const input = panel.querySelector('[data-isian="tanggalBerakhir"]');
    input.disabled = peristiwa.target.value === "menikah";
    if (input.disabled) input.value = "";
  });

  panel.addEventListener("click", async (peristiwa) => {
    const tombolHapus = peristiwa.target.closest("[data-hapus-relasi]");
    if (tombolHapus) {
      await api.hapusRelasi(state.ruang.id, tombolHapus.dataset.hapusRelasi);
      await bukaRinci(orang.id);
      return;
    }
    const tombolUbahPasangan = peristiwa.target.closest("[data-ubah-pasangan]");
    if (tombolUbahPasangan) {
      state.ubahPasangan = tombolUbahPasangan.dataset.ubahPasangan;
      await bukaRinci(orang.id);
      return;
    }
    const tombolPasangan = peristiwa.target.closest("[data-hapus-pasangan]");
    if (tombolPasangan) {
      await api.hapusPasangan(state.ruang.id, tombolPasangan.dataset.hapusPasangan);
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

const UKURAN_POHON = { lebar: 132, tinggi: 54, celah: 42, jarakX: 36, jarakY: 78, ruangAtas: 26 };

function potongTeks(teks, maks) {
  return teks.length > maks ? `${teks.slice(0, maks - 1)}…` : teks;
}

/** Semua pernikahan orang ini yang kedua ujungnya ikut digambar, urut tanggal. */
function perkawinanDalamPohon(orangId, ada) {
  return state.pasangan
    .filter((satu) => satu.orangAId === orangId || satu.orangBId === orangId)
    .filter((satu) => ada.has(satu.orangAId) && ada.has(satu.orangBId))
    .sort(
      (a, b) =>
        (a.tanggalMenikah ?? "9999").localeCompare(b.tanggalMenikah ?? "9999") ||
        a.dibuatPada.localeCompare(b.dibuatPada) ||
        a.id.localeCompare(b.id),
    )
    .map((pasangan) => ({
      pasangan,
      lainId: pasangan.orangAId === orangId ? pasangan.orangBId : pasangan.orangAId,
    }));
}

/**
 * Menggambar silsilah sebagai SVG. Suami–istri yang ikut tampil digabung menjadi
 * satu unit berdampingan dengan garis pernikahan dan lencana urutan pernikahan;
 * garis anak keluar dari tengah pasangan, bukan dari satu orang saja.
 */
function gambarPohonSvg(simpul) {
  const ada = new Set(simpul.map((s) => s.orang.id));
  const terpakai = new Set();
  const unit = [];
  const cariSimpul = (id) => simpul.find((s) => s.orang.id === id) ?? null;

  for (const satu of simpul) {
    const id = satu.orang.id;
    if (terpakai.has(id)) continue;

    // Semua pernikahan orang ini ikut digabung — bukan hanya yang paling awal —
    // supaya suami/istri berikutnya tampil berdampingan, bukan sebagai kartu tunggal.
    const kawin = perkawinanDalamPohon(id, ada).filter(
      (satuKawin) => !terpakai.has(satuKawin.lainId),
    );
    let anggota;

    if (kawin.length === 0) {
      anggota = [{ simpul: satu, urutan: null }];
    } else if (kawin.length === 1) {
      let kiri = satu;
      let kanan = cariSimpul(kawin[0].lainId);
      if (!kanan) {
        anggota = [{ simpul: satu, urutan: null }];
      } else {
        // Suami di kiri; bila jenis kelamin tidak jelas, urutan tetap seperti di server.
        if (kiri.orang.jenisKelamin === "P" && kanan.orang.jenisKelamin !== "P") {
          [kiri, kanan] = [kanan, kiri];
        }
        anggota = [
          { simpul: kiri, urutan: urutanBagiOrang(kawin[0].pasangan, kiri.orang.id) },
          { simpul: kanan, urutan: urutanBagiOrang(kawin[0].pasangan, kanan.orang.id) },
        ];
      }
    } else {
      // Beberapa pernikahan: orang ini di tengah, pasangan pertama di kiri, dan
      // pasangan berikutnya berderet ke kanan menurut tanggal pernikahan.
      const kiri = cariSimpul(kawin[0].lainId);
      if (!kiri) {
        anggota = [{ simpul: satu, urutan: null }];
      } else {
        anggota = [
          { simpul: kiri, urutan: urutanBagiOrang(kawin[0].pasangan, kiri.orang.id) },
          { simpul: satu, urutan: null },
          ...kawin.slice(1).flatMap((satuKawin) => {
            const orang = cariSimpul(satuKawin.lainId);
            if (!orang) return [];
            return [
              {
                simpul: orang,
                urutan: urutanBagiOrang(satuKawin.pasangan, orang.orang.id),
              },
            ];
          }),
        ];
      }
    }

    for (const a of anggota) terpakai.add(a.simpul.orang.id);
    unit.push({
      anggota,
      kedalaman: Math.max(...anggota.map((a) => a.simpul.kedalaman)),
      lebar: anggota.length * UKURAN_POHON.lebar + (anggota.length - 1) * UKURAN_POHON.celah,
    });
  }

  const perAngkatan = new Map();
  for (const satu of unit) {
    const daftar = perAngkatan.get(satu.kedalaman) ?? [];
    daftar.push(satu);
    perAngkatan.set(satu.kedalaman, daftar);
  }

  const angkatan = [...perAngkatan.keys()].sort((a, b) => a - b);
  const lebarBaris = (daftar) =>
    daftar.reduce((total, satu) => total + satu.lebar + UKURAN_POHON.jarakX, -UKURAN_POHON.jarakX);
  const lebar = Math.max(...angkatan.map((k) => lebarBaris(perAngkatan.get(k))), UKURAN_POHON.lebar);
  const tinggi =
    UKURAN_POHON.ruangAtas +
    angkatan.length * (UKURAN_POHON.tinggi + UKURAN_POHON.jarakY) -
    UKURAN_POHON.jarakY;

  const posisi = new Map();
  for (const k of angkatan) {
    const daftar = perAngkatan.get(k);
    let x = (lebar - lebarBaris(daftar)) / 2;
    const y = UKURAN_POHON.ruangAtas + k * (UKURAN_POHON.tinggi + UKURAN_POHON.jarakY);
    for (const satu of daftar) {
      satu.x = x;
      satu.y = y;
      satu.tengah = x + satu.lebar / 2;
      satu.anggota.forEach((a, i) => {
        posisi.set(a.simpul.orang.id, {
          x: x + i * (UKURAN_POHON.lebar + UKURAN_POHON.celah),
          y,
          nama: a.simpul.orang.nama,
        });
      });
      x += satu.lebar + UKURAN_POHON.jarakX;
    }
  }

  const garis = [];

  // Garis pernikahan untuk SEMUA pernikahan yang kedua orangnya tampil: lurus bila
  // kotaknya bersebelahan, jalur di atas baris bila tidak (mis. istri/suami kedua).
  const laneTerpakai = new Map();
  for (const satu of state.pasangan) {
    const a = posisi.get(satu.orangAId);
    const b = posisi.get(satu.orangBId);
    if (!a || !b) continue;

    const kiri = a.x <= b.x ? a : b;
    const kanan = a.x <= b.x ? b : a;
    const idKiri = a.x <= b.x ? satu.orangAId : satu.orangBId;
    const idKanan = a.x <= b.x ? satu.orangBId : satu.orangAId;
    const urutanKiri = urutanBagiOrang(satu, idKiri);
    const urutanKanan = urutanBagiOrang(satu, idKanan);
    const label = urutanKiri === urutanKanan ? String(urutanKiri) : `${urutanKiri}/${urutanKanan}`;
    const judul = `Pernikahan ke-${urutanKiri} bagi ${kiri.nama}, ke-${urutanKanan} bagi ${kanan.nama}`;
    const lencana = (x, y) =>
      `<g class="pohon-lencana" transform="translate(${x - 14} ${y - 10})"><title>${esc(judul)}</title><rect width="28" height="20" rx="10" /><text x="14" y="13.5" text-anchor="middle">♥${esc(label)}</text></g>`;

    const bersebelahan =
      kiri.y === kanan.y &&
      Math.abs(kanan.x - kiri.x - (UKURAN_POHON.lebar + UKURAN_POHON.celah)) < 0.5;

    if (bersebelahan) {
      const y = kiri.y + UKURAN_POHON.tinggi / 2;
      garis.push(
        `<line class="pohon-nikah" x1="${kiri.x + UKURAN_POHON.lebar}" y1="${y}" x2="${kanan.x}" y2="${y}" />`,
      );
      garis.push(lencana((kiri.x + UKURAN_POHON.lebar + kanan.x) / 2, y));
    } else {
      const lane = laneTerpakai.get(kiri.y) ?? 0;
      laneTerpakai.set(kiri.y, lane + 1);
      const yJalur = kiri.y - 12 - lane * 11;
      const x1 = kiri.x + UKURAN_POHON.lebar / 2;
      const x2 = kanan.x + UKURAN_POHON.lebar / 2;
      garis.push(
        `<path class="pohon-nikah pohon-nikah-jalur" d="M${x1} ${kiri.y} L${x1} ${yJalur} L${x2} ${yJalur} L${x2} ${kanan.y}" />`,
      );
      garis.push(lencana((x1 + x2) / 2, yJalur));
    }
  }

  // Garis orang tua → anak, keluar dari tengah kotak kedua orang tuanya.
  const sudah = new Set();
  for (const satu of simpul) {
    if (satu.lewat.length < 2) continue;
    const kotakInduk = satu.lewat
      .slice(-2)
      .map((id) => posisi.get(id))
      .filter(Boolean);
    const anak = posisi.get(satu.orang.id);
    if (!anak || kotakInduk.length === 0) continue;

    const sumbuX =
      kotakInduk.length === 2
        ? (Math.min(...kotakInduk.map((k) => k.x)) +
            UKURAN_POHON.lebar +
            Math.max(...kotakInduk.map((k) => k.x))) /
          2
        : kotakInduk[0].x + UKURAN_POHON.lebar / 2;
    const dariY = Math.min(...kotakInduk.map((k) => k.y)) + UKURAN_POHON.tinggi;
    const kunci = `${Math.round(sumbuX)}|${dariY}|${satu.orang.id}`;
    if (sudah.has(kunci)) continue;
    sudah.add(kunci);

    const keY = anak.y;
    const tengah = (dariY + keY) / 2;
    const anakX = anak.x + UKURAN_POHON.lebar / 2;
    garis.push(
      `<path class="pohon-garis" d="M${sumbuX} ${dariY} C ${sumbuX} ${tengah}, ${anakX} ${tengah}, ${anakX} ${keY}" />`,
    );
  }

  const kotak = [];
  for (const satu of unit) {
    for (const a of satu.anggota) {
      const orang = a.simpul.orang;
      const p = posisi.get(orang.id);
      const aktif = orang.id === state.terpilihId ? " aktif" : "";
      const keterangan = tahunTeks(orang) || "—";
      kotak.push(`<g class="simpul-pohon${aktif}" data-buka="${esc(orang.id)}" transform="translate(${p.x} ${p.y})" role="button" tabindex="0">
      <rect width="${UKURAN_POHON.lebar}" height="${UKURAN_POHON.tinggi}" rx="12" />
      <circle cx="22" cy="${UKURAN_POHON.tinggi / 2}" r="13" />
      <text x="22" y="${UKURAN_POHON.tinggi / 2 + 4.5}" text-anchor="middle" class="awalan-pohon">${esc(
        orang.nama.slice(0, 1).toUpperCase(),
      )}</text>
      <text x="42" y="23" class="nama-pohon">${esc(potongTeks(orang.nama, 12))}</text>
      <text x="42" y="39" class="tahun-pohon">${esc(keterangan)}</text>
    </g>`);
    }
  }

  return `<div class="pohon-gulir"><svg class="pohon-svg" width="${lebar}" height="${tinggi}" viewBox="0 0 ${lebar} ${tinggi}" role="img" aria-label="Pohon silsilah">${garis.join(
    "",
  )}${kotak.join("")}</svg></div>`;
}

async function gambarPohon(orangId) {
  const wadah = $("pohon");
  if (!wadah) return;
  try {
    const [hasil, hasilPasangan] = await Promise.all([
      api.silsilah(state.ruang.id, orangId, state.arah, 6),
      api.pasangan(state.ruang.id),
    ]);
    state.pasangan = hasilPasangan.pasangan;

    // Pasangan ikut digambar meski tidak berada di jalur keturunan/leluhur,
    // supaya suami–istri selalu tampil berdampingan.
    const simpul = hasil.simpul.map((satu) => ({ ...satu }));
    const idAda = new Set(simpul.map((satu) => satu.orang.id));
    for (const satu of hasil.simpul) {
      for (const pasangan of state.pasangan) {
        if (pasangan.orangAId !== satu.orang.id && pasangan.orangBId !== satu.orang.id) continue;
        const idLain = pasangan.orangAId === satu.orang.id ? pasangan.orangBId : pasangan.orangAId;
        if (idAda.has(idLain)) continue;
        const orang = state.orang.find((calon) => calon.id === idLain);
        if (!orang) continue;
        idAda.add(idLain);
        simpul.push({ orang, kedalaman: satu.kedalaman, lewat: [] });
      }
    }

    const hanyaSendiri = simpul.every(
      (satu) => satu.orang.id === orangId || simpul.length === 1,
    );
    if (simpul.length <= 1 && hanyaSendiri) {
      wadah.innerHTML = `<p class="keterangan kecil">Belum ada ${
        state.arah === "turun" ? "keturunan" : "leluhur"
      } yang tercatat.</p>`;
      return;
    }
    wadah.innerHTML = gambarPohonSvg(simpul);
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
  $("tombol-tambah").addEventListener("click", () => {
    setTampilan("orang");
    bukaFormOrang(null);
  });

  for (const tombol of document.querySelectorAll(".tab-tampilan-tombol")) {
    tombol.addEventListener("click", () => setTampilan(tombol.dataset.tampilan));
  }

  $("ringkasan").addEventListener("click", (peristiwa) => {
    const tombol = peristiwa.target.closest("[data-buka]");
    if (tombol) bukaRinci(tombol.dataset.buka);
  });
  $("tombol-ekspor").addEventListener("click", tanganiEkspor);
  $("tombol-kronologi").addEventListener("click", () => {
    const wadah = $("kronologi");
    wadah.hidden = !wadah.hidden;
    if (!wadah.hidden) gambarKronologi();
  });
  $("tutup-kronologi").addEventListener("click", () => {
    $("kronologi").hidden = true;
  });
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
  let sidebarCiut = false;
  try {
    sidebarCiut = localStorage.getItem(KUNCI_SIDEBAR) === "1";
  } catch {
    sidebarCiut = false;
  }
  terapkanSidebar(sidebarCiut);
  $("tombol-sidebar").addEventListener("click", () => terapkanSidebar(!state.sidebarCiut));

  const tutupMenuPengguna = () => {
    $("menu-pengguna").hidden = true;
    $("tombol-pengguna").setAttribute("aria-expanded", "false");
  };
  $("tombol-pengguna").addEventListener("click", (peristiwa) => {
    peristiwa.stopPropagation();
    const akanBuka = $("menu-pengguna").hidden;
    $("menu-pengguna").hidden = !akanBuka;
    $("tombol-pengguna").setAttribute("aria-expanded", akanBuka ? "true" : "false");
  });
  document.addEventListener("click", (peristiwa) => {
    if (!$("sisi-pengguna").contains(peristiwa.target)) tutupMenuPengguna();
  });
  document.addEventListener("keydown", (peristiwa) => {
    if (peristiwa.key === "Escape") tutupMenuPengguna();
  });

  $("tombol-keluar").addEventListener("click", async () => {
    tutupMenuPengguna();
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

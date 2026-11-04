import { apiFetch } from "./api.js";
import { firebaseConfig } from "./firebase-config.js";

/**
 * Alur Nasabku (v2):
 *  Daftar → POST /auth/register      (backend langsung, sesi cookie)
 *  Masuk  → REST accounts:signInWithPassword → POST /auth/login { idToken }
 *  Awal   → GET /auth/me (bootstrap saat halaman dibuka)
 *  Dasbor → /workspaces, lalu /workspaces/:id/persons + tracer silsilah.
 * Galat menampilkan requestId + diagnostik { tahap, kode database }
 * bila server menyisipkannya.
 */
const els = {
  chipPengguna: document.getElementById("chip-pengguna"),
  btnKeluar: document.getElementById("btn-keluar"),
  areaGalat: document.getElementById("area-galat"),
  panelAuth: document.getElementById("panel-auth"),
  tabDaftar: document.getElementById("tab-daftar"),
  tabMasuk: document.getElementById("tab-masuk"),
  bentukDaftar: document.getElementById("bentuk-daftar"),
  bentukMasuk: document.getElementById("bentuk-masuk"),
  panelDasbor: document.getElementById("panel-dasbor"),
  daftarProfil: document.getElementById("daftar-profil"),
  daftarWorkspace: document.getElementById("daftar-workspace"),
  bentukWorkspace: document.getElementById("bentuk-workspace"),
  workspaceNama: document.getElementById("workspace-nama"),
  panelNasab: document.getElementById("panel-nasab"),
  judulNasab: document.getElementById("judul-nasab"),
  btnTambahIndividu: document.getElementById("btn-tambah-individu"),
  bentukIndividu: document.getElementById("bentuk-individu"),
  indGender: document.getElementById("ind-gender"),
  indNama: document.getElementById("ind-nama"),
  indLahirTahun: document.getElementById("ind-lahir-tahun"),
  indLahirTempat: document.getElementById("ind-lahir-tempat"),
  indWafatTahun: document.getElementById("ind-wafat-tahun"),
  indWafatTempat: document.getElementById("ind-wafat-tempat"),
  indAyah: document.getElementById("ind-ayah"),
  indIbu: document.getElementById("ind-ibu"),
  indPasangan: document.getElementById("ind-pasangan"),
  indCatatan: document.getElementById("ind-catatan"),
  btnBatalIndividu: document.getElementById("btn-batal-individu"),
  daftarIndividu: document.getElementById("daftar-individu"),
  kartuTracer: document.getElementById("kartu-tracer"),
  judulTracer: document.getElementById("judul-tracer"),
  pohonTracer: document.getElementById("pohon-tracer"),
  btnTutupTracer: document.getElementById("btn-tutup-tracer"),
};

const keadaan = {
  saya: null,
  workspaces: [],
  workspaceId: null,
  individu: [],
  sibuk: false,
};

// ── Tampilan: pengaman HTML + panel + galat ────────────────────────
function esc(teks) {
  const div = document.createElement("div");
  div.textContent = String(teks ?? "");
  return div.innerHTML;
}

function hampusGalerat() {
  els.areaGalat.hidden = true;
  els.areaGalat.innerHTML = "";
  els.areaGalat.className = "area-galat";
}

function tampilGalat(err) {
  const baris = [`<p class="pesan-utama">${esc(err.message)}</p>`];
  if (err.code && err.code !== "NETWORK" && err.code !== "REST_IDENTITAS") {
    baris.push(`<p class="pesan-kecil">Kode: ${esc(err.code)}</p>`);
  }
  if (err.debug && (err.debug.stage || err.debug.dbCode)) {
    baris.push(
      `<p class="pesan-kecil">Diagnostik server — tahap: ${esc(
        err.debug.stage || "—",
      )}, kode database: ${esc(err.debug.dbCode || "—")}</p>`,
    );
  }
  if (err.requestId) {
    baris.push(`<p class="pesan-kecil">ID permintaan: ${esc(err.requestId)}</p>`);
  }
  els.areaGalat.innerHTML = baris.join("");
  els.areaGalat.className = "area-galat muncul";
  els.areaGalat.hidden = false;
}

function kunciBentuk(form, terkunci) {
  const tombol = form.querySelector("button[type=submit]");
  if (tombol) tombol.disabled = terkunci;
}

/** Pengikat bentuk: hindari kirim ganda + tunjukkan galat seragam. */
function bentukSubmit(form, pengurus) {
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (keadaan.sibuk) return;
    keadaan.sibuk = true;
    kunciBentuk(form, true);
    hampusGalerat();
    try {
      await pengurus();
    } catch (err) {
      tampilGalat(err);
    } finally {
      kunciBentuk(form, false);
      keadaan.sibuk = false;
    }
  });
}

// ── Panel autentikasi (dua tab) ────────────────────────────────────
function swalikanTab(masuk) {
  els.tabDaftar.classList.toggle("aktif", !masuk);
  els.tabMasuk.classList.toggle("aktif", masuk);
  els.bentukDaftar.hidden = masuk;
  els.bentukMasuk.hidden = !masuk;
}
els.tabDaftar.addEventListener("click", () => swalikanTab(false));
els.tabMasuk.addEventListener("click", () => swalikanTab(true));

function tampilAuth() {
  els.panelAuth.hidden = false;
  els.panelDasbor.hidden = true;
  els.panelNasab.hidden = true;
  els.kartuTracer.hidden = true;
  els.chipPengguna.hidden = true;
  els.btnKeluar.hidden = true;
}

// ── Sirkel autentikasi ─────────────────────────────────────────────
bentukSubmit(els.bentukDaftar, async () => {
  const email = document.getElementById("daftar-email").value.trim();
  const password = document.getElementById("daftar-sandi").value;
  const data = await apiFetch("/auth/register", {
    method: "POST",
    body: { email, password },
  });
  masukKeSistem(data.user, data.memberships);
});

bentukSubmit(els.bentukMasuk, async () => {
  const email = document.getElementById("masuk-email").value.trim();
  const password = document.getElementById("masuk-sandi").value;
  const idToken = await mintaIdToken(email, password);
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: { idToken },
  });
  masukKeSistem(data.user, data.memberships);
});

/** REST Firebase Auth — apiKey web memang dipublikasikan di FE. */
async function mintaIdToken(email, password) {
  const url =
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword" +
    `?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  let res;
  let payload;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    payload = await res.json();
  } catch {
    const galat = new Error("Tidak dapat menghubungi Firebase Auth. Periksa koneksi.");
    galat.status = 0;
    galat.code = "REST_IDENTITAS";
    throw galat;
  }
  if (res.ok && payload?.idToken) return payload.idToken;
  const galat = new Error(bacaKodeIdentitas(payload?.error?.message ?? ""));
  galat.status = res.status;
  galat.code = "REST_IDENTITAS";
  throw galat;
}

function bacaKodeIdentitas(kode) {
  const peta = {
    EMAIL_NOT_FOUND: "Email belum terdaftar. Gunakan tab Daftar.",
    INVALID_PASSWORD: "Email atau sandi tidak cocok.",
    INVALID_LOGIN_CREDENTIALS: "Email atau sandi tidak cocok.",
    INVALID_EMAIL: "Format email tidak sah.",
    MISSING_PASSWORD: "Kata sandi wajib diisi.",
    USER_DISABLED: "Akun ini diblokir. Hubungi pemilik aplikasi.",
    TOO_MANY_ATTEMPTS_TRY_LATER:
      "Terlalu banyak percobaan. Coba lagi sejenak nanti.",
  };
  if (kode.includes("TOO_MANY_ATTEMPTS")) return peta.TOO_MANY_ATTEMPTS_TRY_LATER;
  return peta[kode] ?? "Masuk gagal di Firebase Auth. Coba lagi nanti.";
}

// ── Sesi: masuk dasbor, keluar ─────────────────────────────────────
function masukKeSistem(user, memberships) {
  hampusGalerat();
  keadaan.saya = user;
  els.chipPengguna.textContent = user.email;
  els.chipPengguna.hidden = false;
  els.btnKeluar.hidden = false;
  els.panelAuth.hidden = true;
  els.panelDasbor.hidden = false;
  babarkanProfil(user, memberships);
  muatWorkspaces();
}

function babarkanProfil(user, memberships) {
  const baris = [
    ["Email", user.email],
    ["Nama", user.name ?? "—"],
    ["Email terverifikasi", user.emailVerified ? "ya" : "belum"],
  ];
  if (Array.isArray(memberships) && memberships.length > 0) {
    baris.push([
      "Keanggotaan",
      memberships.map((m) => `${m.role} @ ${m.workspaceId}`).join(", "),
    ]);
  }
  els.daftarProfil.innerHTML = baris
    .map(
      ([k, v]) =>
        `<div class="baris-dl"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`,
    )
    .join("");
}

els.btnKeluar.addEventListener("click", async () => {
  if (keadaan.sibuk) return;
  keadaan.sibuk = true;
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {
    // Keluar tetap berhasil sisi peramban walau API gagal; cookie
    // tetap dibersihkan server pada setiap respons logout.
  }
  Object.assign(keadaan, {
    saya: null,
    workspaces: [],
    workspaceId: null,
    individu: [],
  });
  tampilAuth();
  swalikanTab(false);
  hampusGalerat();
  keadaan.sibuk = false;
});

// ── Ruang keluarga (workspace) ─────────────────────────────────────
async function muatWorkspaces() {
  const data = await apiFetch("/workspaces");
  keadaan.workspaces = data.items ?? [];
  babarkWorkspace();
}

function babarkWorkspace() {
  if (keadaan.workspaces.length === 0) {
    els.daftarWorkspace.innerHTML =
      `<li class="senar-kosong">Belum ada ruang. Buat satu di bawah.</li>`;
    els.panelNasab.hidden = true;
    return;
  }
  els.daftarWorkspace.innerHTML = keadaan.workspaces
    .map((ws) => {
      const aktif = ws.id === keadaan.workspaceId ? " aktif" : "";
      return `<li><button class="butir-lengkap tombol penuh${aktif}"
        data-ws="${esc(ws.id)}" type="button">
          <strong>${esc(ws.name)}</strong>
          <span class="badge">${esc(ws.role ?? "OWNER")}</span>
        </button></li>`;
    })
    .join("");
  els.daftarWorkspace
    .querySelectorAll("button[data-ws]")
    .forEach((btn) =>
      btn.addEventListener("click", () => pilihWorkspace(btn.dataset.ws)),
    );
}

bentukSubmit(els.bentukWorkspace, async () => {
  await apiFetch("/workspaces", {
    method: "POST",
    body: { name: els.workspaceNama.value.trim() },
  });
  els.workspaceNama.value = "";
  await muatWorkspaces();
});

async function pilihWorkspace(workspaceId) {
  keadaan.workspaceId = workspaceId;
  babarkWorkspace();
  els.panelNasab.hidden = false;
  els.kartuTracer.hidden = true;
  els.bentukIndividu.hidden = true;
  const ws = keadaan.workspaces.find((w) => w.id === workspaceId);
  els.judulNasab.textContent = ws ? `Individu — ${ws.name}` : "Individu";
  await muatIndividu();
}

// ── Individu (entitas nasab) ───────────────────────────────────────
async function muatIndividu() {
  const data = await apiFetch(`/workspaces/${keadaan.workspaceId}/persons`);
  keadaan.individu = data.items ?? [];
  babarkanIndividu();
}

function namaIndividu(id) {
  const p = keadaan.individu.find((x) => x.id === id);
  return p ? p.name : "(individu belum dicatat)";
}

function babarkanIndividu() {
  if (keadaan.individu.length === 0) {
    els.daftarIndividu.innerHTML = `<li class="senar-kosong">Belum ada individu.</li>`;
    return;
  }
  els.daftarIndividu.innerHTML = keadaan.individu
    .map((b) => {
      const meta = [
        b.gender ? (b.gender === "L" ? "L" : "P") : "",
        b.birthDate,
        b.deathDate,
      ]
        .filter(Boolean)
        .join(" · ");
      const relasi = [];
      if (b.fatherId) relasi.push(`ayah ${namaIndividu(b.fatherId)}`);
      if (b.motherId) relasi.push(`ibu ${namaIndividu(b.motherId)}`);
      if (b.spouseId) relasi.push(`pasangan ${namaIndividu(b.spouseId)}`);
      return `<li data-id="${esc(b.id)}">
        <div class="butir-lengkap senor">
          <div class="susun-lenting">
            <strong>${esc(b.name)}</strong>
            <span class="badge">${esc(meta || "—")}</span>
            ${
              relasi.length
                ? `<span class="badge hening">${esc(relasi.join(", "))}</span>`
                : ""
            }
          </div>
          ${b.notes ? `<p class="catatan">${esc(b.notes)}</p>` : ""}
          <div class="susun-samping">
            <button class="tombol kecil" data-tracer="descendants" type="button">Keturunan</button>
            <button class="tombol kecil" data-tracer="ancestors" type="button">Leluhur</button>
            <button class="tombol kecil hening" data-edit="1" type="button">Sunting</button>
          </div>
        </div>
      </li>`;
    })
    .join("");
  els.daftarIndividu.querySelectorAll("li[data-id]").forEach((li) => {
    const personId = li.dataset.id;
    const nama = li.querySelector("strong")?.textContent ?? "";
    li.querySelectorAll("button[data-tracer]").forEach((btn) =>
      btn.addEventListener("click", () =>
        jalankanTracer(personId, btn.dataset.tracer, nama),
      ),
    );
    li.querySelector("button[data-edit]")?.addEventListener("click", () =>
      siapkanBentukIndividu(personId),
    );
  });
}

// ── Bentuk tambah/sunting individu ────────────────────────────────
els.btnTambahIndividu.addEventListener("click", () => siapkanBentukIndividu());
els.btnBatalIndividu.addEventListener("click", tutupBentukIndividu);

function tutupBentukIndividu() {
  els.bentukIndividu.hidden = true;
  els.bentukIndividu.dataset.editId = "";
  els.btnTambahIndividu.disabled = false;
}

function isiSelectIndividu(select, pilihId) {
  select.innerHTML = `<option value="">— belum dicatat —</option>`;
  for (const p of keadaan.individu) {
    const opsi = document.createElement("option");
    opsi.value = p.id;
    opsi.textContent = p.name;
    if (p.id === pilihId) opsi.selected = true;
    select.appendChild(opsi);
  }
}

function siapkanBentukIndividu(personId = null) {
  const p = personId ? keadaan.individu.find((x) => x.id === personId) : null;
  els.indNama.value = p?.name ?? "";
  els.indGender.value = p?.gender ?? "";
  els.indLahirTahun.value = p?.birthDate ?? "";
  els.indLahirTempat.value = p?.birthPlace ?? "";
  els.indWafatTahun.value = p?.deathDate ?? "";
  els.indWafatTempat.value = p?.deathPlace ?? "";
  els.indCatatan.value = p?.notes ?? "";
  isiSelectIndividu(els.indAyah, p?.fatherId ?? null);
  isiSelectIndividu(els.indIbu, p?.motherId ?? null);
  isiSelectIndividu(els.indPasangan, p?.spouseId ?? null);
  els.bentukIndividu.dataset.editId = personId ?? "";
  els.bentukIndividu.hidden = false;
  els.btnTambahIndividu.disabled = true;
  els.indNama.focus();
}

bentukSubmit(els.bentukIndividu, async () => {
  const ruangId = keadaan.workspaceId;
  const editId = els.bentukIndividu.dataset.editId || null;
  const body = {
    name: els.indNama.value.trim(),
    gender: els.indGender.value,
    birthDate: els.indLahirTahun.value.trim() || null,
    birthPlace: els.indLahirTempat.value.trim() || null,
    deathDate: els.indWafatTahun.value.trim() || null,
    deathPlace: els.indWafatTempat.value.trim() || null,
    fatherId: els.indAyah.value || null,
    motherId: els.indIbu.value || null,
    spouseId: els.indPasangan.value || null,
    notes: els.indCatatan.value.trim() || null,
  };
  if (editId) {
    await apiFetch(`/workspaces/${ruangId}/persons/${editId}`, {
      method: "PATCH",
      body,
    });
  } else {
    await apiFetch(`/workspaces/${ruangId}/persons`, {
      method: "POST",
      body,
    });
  }
  tutupBentukIndividu();
  await muatIndividu();
});

// ── Tracer silsilah (keturunan / leluhur) ─────────────────────────
els.btnTutupTracer.addEventListener("click", () => {
  els.kartuTracer.hidden = true;
});

async function jalankanTracer(personId, mode, nama) {
  const data = await apiFetch(
    `/workspaces/${keadaan.workspaceId}/persons/${personId}/${mode}`,
  );
  const items = data.items ?? [];
  const label =
    mode === "ancestors" ? `Para leluhur — ${nama}` : `Keturunan — ${nama}`;
  els.judulTracer.textContent = label;
  els.pohonTracer.innerHTML = items.length
    ? items
        .map((it) => {
          const p = it.person;
          const meta = [p.birthDate, p.deathDate].filter(Boolean).join(" → ");
          const via =
            mode === "ancestors"
              ? `lewat ${it.via}`
              : it.via === "keduanya"
                ? "anak"
                : `anak — ${it.via}`;
          return `<li class="cabang" style="margin-left:${(it.depth - 1) * 22}px">
            <span class="badge hening">${esc(via)} · tingkat ${esc(it.depth)}</span>
            <strong>${esc(p.name)}</strong>
            ${meta ? `<span class="badge">${esc(meta)}</span>` : ""}
          </li>`;
        })
        .join("")
    : `<li class="senar-kosong">Belum ada yang tercatat di jalur ini.</li>`;
  els.kartuTracer.hidden = false;
}

// ── Mulai: bootstrap /auth/me ──────────────────────────────────────
(async function mulaiBismillah() {
  try {
    const data = await apiFetch("/auth/me");
    masukKeSistem(data.user, data.memberships);
  } catch (err) {
    if (err.status === 401) {
      tampilAuth();
      hampusGalerat();
    } else {
      tampilAuth();
      tampilGalat(err);
    }
  }
})();

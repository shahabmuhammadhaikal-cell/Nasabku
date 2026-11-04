import { apiFetch } from "./api.js";
import { firebaseReady, signOutFirebase, signIn, register } from "./firebase.js";
import {
  renderActivity,
  renderDashboard,
  renderDetail,
  renderPersons,
  renderPersonDetail,
  renderRelation,
  renderStats,
  renderTree,
  toast,
} from "./ui.js";

/** Satu-satunya titik navigasi SPA sederhana. */
let state = { user: null, memberships: [], detailId: null, slug: "", persons: [], editPersonId: null, detailPersonId: null };

/** Peta kode galat Firebase Auth → pesan manusiawi berbahasa Indonesia. */
const PESAN_AUTH = {
  "auth/email-already-in-use": "Email ini sudah terdaftar. Gunakan tombol Masuk di bawah dengan sandi Anda.",
  "auth/invalid-email": "Format email tidak sah. Periksa kembali penulisannya.",
  "auth/weak-password": "Sandi terlalu lemah. Gunakan minimal 8 karakter campuran huruf, angka, dan simbol.",
  "auth/operation-not-allowed": "Pendaftaran lewat surel/sandi belum diaktifkan di Firebase Console.",
  "auth/unauthorized-domain": "Domain halaman ini belum ada di daftar Authorized domains Firebase.",
  "auth/user-not-found": "Tidak ada akun dengan email tersebut.",
  "auth/wrong-password": "Sandi salah untuk email ini.",
  "auth/invalid-credential": "Email atau sandi salah.",
  "auth/too-many-requests": "Terlalu banyak percobaan. Tunggu sejenak lalu coba lagi.",
  "auth/network-request-failed": "Jaringan bermasalah. Periksa koneksi internet Anda.",
};

function pesanAuth(err) {
  return PESAN_AUTH[err?.code] || err?.message || "Terjadi galat tak terduga.";
}

async function bootstrap() {
  // Sesi kue (cookie) mungkin masih sah dari kunjungan lalu:
  // /auth/me dipanggil dulu; gagal → tampilkan layar masuk.
  try {
    const me = await apiFetch("/api/v1/auth/me");
    state.user = me.user;
    state.memberships = me.memberships ?? [];
    enterApp();
  } catch {
    showAuth();
  }
  // Sinkron dengan status Firebase (mis. pengguna baru login di tab lain).
  const fb = await firebaseReady;
  fb.onAuthChanged(async (fbUser) => {
    if (!fbUser) {
      // Keluar di Firebase → bersihkan sesi API juga.
      await apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
      state.user = null;
      showAuth();
      return;
    }
    if (!state.user) {
      const idToken = await fbUser.getIdToken();
      const data = await apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: { idToken },
      });
      state.user = data.user;
      state.memberships = data.memberships ?? [];
      enterApp();
    }
  });
}

function showAuth() {
  document.getElementById("view-app").classList.add("hidden");
  document.getElementById("view-auth").classList.remove("hidden");
  document.getElementById("userbox").classList.add("hidden");
}

function enterApp() {
  document.getElementById("view-auth").classList.add("hidden");
  document.getElementById("view-app").classList.remove("hidden");
  const box = document.getElementById("userbox");
  box.classList.remove("hidden");
  document.getElementById("user-email").textContent = state.user?.email ?? "";
  // Sapaan di hero: tampilkan bagian sebelum @ agar terasa personal.
  const sapaan = (state.user?.email ?? "").split("@")[0];
  document.getElementById("hello-user").textContent = sapaan || "Pengguna";
  state.detail = null;
  void loadList();
}

async function loadList() {
  const data = await apiFetch("/api/v1/workspaces");
  renderDashboard(
    data.items.map((w) => ({ ...w, role: (state.memberships.find((m) => m.workspaceId === w.id))?.role })),
    openDetail,
  );
}

export async function openDetail(workspaceId) {
  // Statistik & jejak aktivitas opsional: dibungkus catch agar peran
  // tanpa izin tetap melihat detail dengan rapi (panel ikut disembunyikan).
  const [ws, members, stats, audit, persons] = await Promise.all([
    apiFetch(`/api/v1/workspaces/${workspaceId}`),
    apiFetch(`/api/v1/workspaces/${workspaceId}/members`),
    apiFetch(`/api/v1/workspaces/${workspaceId}/stats`).catch(() => null),
    apiFetch(`/api/v1/audit-events?workspaceId=${workspaceId}&limit=20`).catch(() => null),
    apiFetch(`/api/v1/workspaces/${workspaceId}/persons`).catch(() => ({ items: [] })),
  ]);
  const list = members.items ?? [];
  state.persons = persons.items ?? [];
  state.detail = ws.workspace;
  renderDetail({ workspace: ws.workspace, members: list }, {
    back: () => { state.detail = null; void loadList(); },
    invite: async (email, role) => {
      await apiFetch(`/api/v1/workspaces/${workspaceId}/members`, {
        method: "POST",
        body: { email, role },
      });
      void openDetail(workspaceId);
    },
    setRole: async (membershipId, role) => {
      await apiFetch(`/api/v1/workspaces/${workspaceId}/members/${membershipId}`, {
        method: "PATCH",
        body: { role },
      });
      void openDetail(workspaceId);
    },
    revoke: async (membershipId) => {
      await apiFetch(`/api/v1/workspaces/${workspaceId}/members/${membershipId}`, {
        method: "DELETE",
      });
      void openDetail(workspaceId);
    },
  });
  state.slug = ws.workspace.slug;
  renderStats(stats?.stats ?? null);
  renderActivity(audit?.items ?? null, list);
  const bolehEdit = ws.workspace.role === "PLATFORM_ADMIN";
  document.getElementById("btn-edit-ws").classList.toggle("hidden", !bolehEdit);
  document.getElementById("form-edit-ws").classList.add("hidden");

  // ===== Individu & silsilah =====
  const bolehTulis = ws.workspace.role === "RESEARCHER"; // person:write
  document.getElementById("ppl-hint").classList.toggle("hidden", bolehTulis);
  document.getElementById("btn-person-new-wrap").classList.toggle("hidden", !bolehTulis);
  document.getElementById("form-person").classList.add("hidden");
  state.editPersonId = null;
  const tbTree = document.getElementById("btn-tree");
  tbTree.textContent = "Gambar silsilah";
  document.getElementById("tree-wrap").classList.add("hidden");
  document.getElementById("person-detail").classList.add("hidden");
  state.detailPersonId = null;
  document.getElementById("relate-wrap").classList.add("hidden");
  document.getElementById("rel-out").innerHTML = "";
  document.getElementById("btn-relate").textContent = "Hitung hubungan";
  isiSelectRelate();
  renderPersons(state.persons, {
    canWrite: bolehTulis,
    onEdit: (person) => bukaFormPerson(person),
    onOpen: (person) => void bukaDetailIndividu(person),
    onDelete: async (person) => {
      const yakin = window.confirm(
        `Hapus individu "${person.name}"? Relasi yang merujuk kepadanya akan dibersihkan.`,
      );
      if (!yakin) return;
      try {
        await apiFetch(`/api/v1/workspaces/${workspaceId}/persons/${person.id}`, {
          method: "DELETE",
        });
        toast("Individu dihapus.");
        void openDetail(workspaceId);
      } catch (err) {
        toast(err?.message || "Gagal menghapus individu.", "err");
      }
    },
  });
  renderTree(state.persons);
}

// === Pengikatan form ===
document.getElementById("form-auth").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("btn-login");
  btn.disabled = true;
  try {
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const idToken = await signIn(email, password);
    const data = await apiFetch("/api/v1/auth/login", { method: "POST", body: { idToken } });
    state.user = data.user;
    state.memberships = data.memberships ?? [];
    enterApp();
  } catch (err) {
    document.getElementById("auth-error").textContent = pesanAuth(err);
    document.getElementById("auth-error").classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("btn-register").addEventListener("click", async () => {
  try {
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    await register(email, password);
    toast("Akun dibuat. Silakan masuk.");
    document.getElementById("btn-login").click();
  } catch (err) {
    document.getElementById("auth-error").textContent = pesanAuth(err);
    document.getElementById("auth-error").classList.remove("hidden");
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
  await signOutFirebase().catch(() => {});
  state.user = null;
  state.memberships = [];
  showAuth();
});

document.getElementById("form-create-ws").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("ws-name").value.trim();
  await apiFetch("/api/v1/workspaces", { method: "POST", body: { name } });
  document.getElementById("ws-name").value = "";
  toast("Workspace dibuat.");
  void loadList();
});

document.getElementById("btn-refresh").addEventListener("click", () => void loadList());
document.getElementById("btn-back").addEventListener("click", () => {
  state.detail = null;
  document.getElementById("ws-detail").classList.add("hidden");
  void loadList();
});

// === Salin slug ===
document.getElementById("btn-copy-slug").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.slug);
    toast(`Slug "${state.slug}" disalin ke clipboard.`);
  } catch {
    toast("Peramban menolak akses clipboard.", "err");
  }
});

// === Ubah nama workspace (hanya PLATFORM_ADMIN melihat tombolnya) ===
document.getElementById("btn-edit-ws").addEventListener("click", () => {
  document.getElementById("edit-name").value = state.detail?.name ?? "";
  document.getElementById("form-edit-ws").classList.remove("hidden");
  document.getElementById("edit-name").focus();
});
document.getElementById("btn-edit-cancel").addEventListener("click", () => {
  document.getElementById("form-edit-ws").classList.add("hidden");
});
document.getElementById("form-edit-ws").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = state.detail?.id;
  const name = document.getElementById("edit-name").value.trim();
  if (!id) return;
  try {
    await apiFetch(`/api/v1/workspaces/${id}`, { method: "PATCH", body: { name } });
    toast("Nama workspace diperbarui.");
    void openDetail(id);
  } catch (err) {
    toast(err?.message || "Gagal mengubah nama workspace.", "err");
  }
});

// ===== Individu & silsilah: formulir, dropdown relasi, pohon =====
const qid = (id) => document.getElementById(id);

/** Isi dropdown ayah/ibu/pasangan dari daftar individu saat ini. */
function isiSelectRelasi(editId) {
  for (const id of ["pp-father", "pp-mother", "pp-spouse"]) {
    const sel = qid(id);
    sel.innerHTML = "";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = "— tidak diisi —";
    sel.appendChild(def);
    for (const p of state.persons) {
      if (editId && p.id === editId) continue; // tidak boleh merujuk diri sendiri
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    }
  }
}

function bukaFormPerson(person) {
  state.editPersonId = person?.id ?? null;
  isiSelectRelasi(person?.id ?? null);
  qid("pp-name").value = person?.name ?? "";
  qid("pp-gender").value = person?.gender ?? "";
  qid("pp-birth").value = person?.birthDate ?? "";
  qid("pp-birth-pl").value = person?.birthPlace ?? "";
  qid("pp-death").value = person?.deathDate ?? "";
  qid("pp-death-pl").value = person?.deathPlace ?? "";
  qid("pp-father").value = person?.fatherId ?? "";
  qid("pp-mother").value = person?.motherId ?? "";
  qid("pp-spouse").value = person?.spouseId ?? "";
  qid("pp-notes").value = person?.notes ?? "";
  qid("pp-save").textContent = person ? "Simpan perubahan" : "Simpan individu";
  qid("btn-person-new-wrap").classList.add("hidden");
  qid("form-person").classList.remove("hidden");
  qid("pp-name").focus();
}

function tutupFormPerson() {
  state.editPersonId = null;
  qid("form-person").classList.add("hidden");
  if (state.detail?.role === "RESEARCHER") {
    qid("btn-person-new-wrap").classList.remove("hidden");
  }
}

qid("btn-person-new").addEventListener("click", () => bukaFormPerson(null));
qid("pp-cancel").addEventListener("click", tutupFormPerson);

qid("btn-tree").addEventListener("click", () => {
  const wrap = qid("tree-wrap");
  const tersembunyi = wrap.classList.toggle("hidden");
  qid("btn-tree").textContent = tersembunyi ? "Gambar silsilah" : "Sembunyikan pohon";
  if (!tersembunyi) renderTree(state.persons);
});

qid("form-person").addEventListener("submit", async (e) => {
  e.preventDefault();
  const wid = state.detail?.id;
  if (!wid) return;
  const tubuh = {
    name: qid("pp-name").value.trim(),
    gender: qid("pp-gender").value,
    birthDate: qid("pp-birth").value.trim(),
    birthPlace: qid("pp-birth-pl").value.trim(),
    deathDate: qid("pp-death").value.trim(),
    deathPlace: qid("pp-death-pl").value.trim(),
    fatherId: qid("pp-father").value || null,
    motherId: qid("pp-mother").value || null,
    spouseId: qid("pp-spouse").value || null,
    notes: qid("pp-notes").value.trim(),
  };
  const btn = qid("pp-save");
  btn.disabled = true;
  try {
    if (state.editPersonId) {
      await apiFetch(`/api/v1/workspaces/${wid}/persons/${state.editPersonId}`, {
        method: "PATCH",
        body: tubuh,
      });
      toast("Data individu diperbarui.");
    } else {
      await apiFetch(`/api/v1/workspaces/${wid}/persons`, {
        method: "POST",
        body: tubuh,
      });
      toast("Individu ditambahkan ke silsilah.");
    }
    tutupFormPerson();
    void openDetail(wid);
  } catch (err) {
    toast(err?.message || "Gagal menyimpan individu.", "err");
  } finally {
    btn.disabled = false;
  }
});

// ===== Detail individu, sumber/bukti, hubungan nasab, GEDCOM =====

/** Isi dropdown pencari hubungan dari daftar individu saat ini. */
function isiSelectRelate() {
  for (const [idx, id] of ["rel-a", "rel-b"].entries()) {
    const sel = qid(id);
    sel.innerHTML = "";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = idx === 0 ? "— pilih individu pertama —" : "— pilih individu kedua —";
    sel.appendChild(def);
    for (const p of state.persons) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    }
  }
}

/** Buka panel detail satu individu: leluhur + sumber diambil dari API. */
async function bukaDetailIndividu(person) {
  const wid = state.detail?.id;
  if (!wid) return;
  state.detailPersonId = person.id;
  const bolehTulis = state.detail?.role === "RESEARCHER";
  const wrap = qid("person-detail");
  wrap.innerHTML = "";
  wrap.classList.remove("hidden");
  wrap.innerHTML = "<p class='muted'>Memuat detail…</p>";
  try {
    const [anc, src] = await Promise.all([
      apiFetch(`/api/v1/workspaces/${wid}/persons/${person.id}/ancestors`).catch(() => ({ items: [] })),
      apiFetch(`/api/v1/workspaces/${wid}/persons/${person.id}/sources`).catch(() => ({ items: [] })),
    ]);
    if (state.detailPersonId !== person.id) return; // sudah diganti orang lain
    renderPersonDetail(person, anc.items ?? [], src.items ?? [], {
      canWrite: bolehTulis,
      onClose: () => {
        wrap.classList.add("hidden");
        state.detailPersonId = null;
      },
      onAddSource: async (data) => {
        try {
          await apiFetch(`/api/v1/workspaces/${wid}/persons/${person.id}/sources`, {
            method: "POST",
            body: data,
          });
          toast("Bukti ditambahkan.");
          void bukaDetailIndividu(person);
        } catch (err) {
          toast(err?.message || "Gagal menambah bukti.", "err");
        }
      },
      onDeleteSource: async (s) => {
        if (!window.confirm(`Hapus bukti "${s.title}"?`)) return;
        try {
          await apiFetch(`/api/v1/workspaces/${wid}/persons/${person.id}/sources/${s.id}`, {
            method: "DELETE",
          });
          toast("Bukti dihapus.");
          void bukaDetailIndividu(person);
        } catch (err) {
          toast(err?.message || "Gagal menghapus bukti.", "err");
        }
      },
    });
  } catch (err) {
    toast(err?.message || "Gagal memuat detail individu.", "err");
  }
}

/** Unduh file dari teks via Blob. */
function kirimUnduh(namaFile, isi, tipe) {
  const blob = new window.Blob([isi], { type: tipe });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Bangun GEDCOM 5.5.1 minimal dari daftar individu aktif. */
function susunGedcom() {
  const byId = new Map(state.persons.map((p) => [p.id, p]));
  const kode = new Map(state.persons.map((p, i) => [p.id, `@I${i + 1}@`]));

  // Keluarga = pasangan orang tua (kunci "ayah|ibu") termasuk pernikahan
  // tanpa anak. Relasi pasangan satu arah pun dinormalisasi di sini.
  const keluarga = new Map();
  let famN = 0;
  const keluargaBaru = (ayah, ibu) => {
    const kunci = `${ayah ?? "-"}|${ibu ?? "-"}`;
    if (!keluarga.has(kunci)) {
      famN += 1;
      keluarga.set(kunci, { id: `@F${famN}@`, ayah, ibu, anak: [] });
    }
    return keluarga.get(kunci);
  };
  for (const p of state.persons) {
    const ayah = p.fatherId && byId.has(p.fatherId) ? p.fatherId : null;
    const ibu = p.motherId && byId.has(p.motherId) ? p.motherId : null;
    if (ayah || ibu) keluargaBaru(ayah, ibu).anak.push(p.id);
    const pas = p.spouseId && byId.has(p.spouseId) ? p.spouseId : null;
    if (pas && p.id < pas) {
      const a = p.gender === "P" ? pas : p.id;
      const i = p.gender === "P" ? p.id : pas;
      keluargaBaru(a, i);
    }
  }

  const baris = ["0 HEAD", "1 SOUR NASABKU", "2 NAME Nasabku", "2 VERS 1.0", "1 GEDC", "2 VERS 5.5.1", "1 CHAR UTF-8"];
  state.persons.forEach((p, i) => {
    baris.push(`0 @I${i + 1}@ INDI`);
    baris.push(`1 NAME ${p.name.replace(/\//g, "?")} /`);
    baris.push(`1 SEX ${p.gender === "L" ? "M" : p.gender === "P" ? "F" : "U"}`);
    if (p.birthDate || p.birthPlace) {
      baris.push("1 BIRT");
      if (p.birthDate) baris.push(`2 DATE ${p.birthDate}`);
      if (p.birthPlace) baris.push(`2 PLAC ${p.birthPlace}`);
    }
    if (p.deathDate || p.deathPlace) {
      baris.push("1 DEAT");
      if (p.deathDate) baris.push(`2 DATE ${p.deathDate}`);
      if (p.deathPlace) baris.push(`2 PLAC ${p.deathPlace}`);
    }
    for (const fam of keluarga.values()) {
      if (fam.ayah === p.id || fam.ibu === p.id) baris.push(`1 FAMS ${fam.id}`);
      if (fam.anak.includes(p.id)) baris.push(`1 FAMC ${fam.id}`);
    }
  });
  for (const fam of keluarga.values()) {
    baris.push(`0 ${fam.id} FAM`);
    if (fam.ayah) baris.push(`1 HUSB ${kode.get(fam.ayah)}`);
    if (fam.ibu) baris.push(`1 WIFE ${kode.get(fam.ibu)}`);
    for (const an of fam.anak) baris.push(`1 CHIL ${kode.get(an)}`);
  }
  baris.push("0 TRLR");
  return `${baris.join("\n")}\n`;
}

qid("btn-gedcom").addEventListener("click", () => {
  if (!state.detail?.id) return;
  if (state.persons.length === 0) {
    toast("Belum ada individu untuk diekspor.", "err");
    return;
  }
  kirimUnduh(`${state.slug || "nasabku"}.ged`, susunGedcom(), "text/plain;charset=utf-8");
  toast(`Ekspor GEDCOM ${state.persons.length} individu berhasil diunduh.`);
});

qid("btn-relate").addEventListener("click", () => {
  const tersembunyi = qid("relate-wrap").classList.toggle("hidden");
  qid("btn-relate").textContent = tersembunyi ? "Hitung hubungan" : "Tutup pencari hubungan";
  if (!tersembunyi) qid("rel-a").focus();
});

qid("btn-relate-run").addEventListener("click", async () => {
  const wid = state.detail?.id;
  if (!wid) return;
  const a = qid("rel-a").value;
  const b = qid("rel-b").value;
  if (!a || !b) {
    toast("Pilih dua individu dulu.", "err");
    return;
  }
  const btn = qid("btn-relate-run");
  btn.disabled = true;
  try {
    const rel = await apiFetch(
      `/api/v1/workspaces/${wid}/person-relations?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`,
    );
    renderRelation(rel.relation);
  } catch (err) {
    toast(err?.message || "Gagal mencari jalur hubungan.", "err");
  } finally {
    btn.disabled = false;
  }
});

void bootstrap();

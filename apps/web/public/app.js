import { apiFetch } from "./api.js";
import { firebaseReady, signOutFirebase, signIn, register } from "./firebase.js";
import { renderActivity, renderDashboard, renderDetail, renderPersons, renderStats, renderTree, toast } from "./ui.js";

/** Satu-satunya titik navigasi SPA sederhana. */
let state = { user: null, memberships: [], detailId: null, slug: "", persons: [], editPersonId: null };

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
  renderPersons(state.persons, {
    canWrite: bolehTulis,
    onEdit: (person) => bukaFormPerson(person),
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
    document.getElementById("auth-error").textContent = err?.message || "Gagal masuk.";
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
    document.getElementById("auth-error").textContent = err?.message || "Gagal mendaftar.";
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

void bootstrap();

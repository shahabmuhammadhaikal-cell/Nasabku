import { apiFetch } from "./api.js";
import { firebaseReady, signOutFirebase, signIn, register } from "./firebase.js";
import { renderDashboard, renderDetail, toast } from "./ui.js";

/** Satu-satunya titik navigasi SPA sederhana. */
let state = { user: null, memberships: [], detailId: null };

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
  const ws = await apiFetch(`/api/v1/workspaces/${workspaceId}`);
  const members = await apiFetch(`/api/v1/workspaces/${workspaceId}/members`);
  state.detail = ws.workspace;
  renderDetail({ workspace: ws.workspace, members: members.items ?? [] }, {
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
  await signOutFirebase();
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

void bootstrap();

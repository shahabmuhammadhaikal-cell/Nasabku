import { ROLES } from "./roles.js";

const q = (id) => document.getElementById(id);

/** Tampilkan notifikasi masalah transien berwarna merah + pesan teks. */
export function toast(message) {
  const el = q("toast-error");
  el.textContent = message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

/** Isi dropdown peran dengan konstanta yang SESETIA dari backend. */
export function fillRoles(selectId = "invite-role") {
  const sel = q(selectId);
  sel.innerHTML = "";
  for (const role of ROLES) {
    if (role === "INTEGRATION_CLIENT") continue; // cakupan diberikan Fase 6
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = role;
    sel.appendChild(opt);
  }
}

/**
 * List dashboard: kartu workspace + jumlah anggota (jika ada).
 * items: [{ id, name, slug?, status?, role }]
 */
export function renderDashboard(items, openDetail) {
  const list = q("ws-list");
  list.innerHTML = "";
  if (items.length === 0) {
    list.innerHTML =
      '<p class="muted">Belum ada workspace. Buat workspace pertama dengan form di atas — mis. nama keluarga.</p>';
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "ws-item";
    row.innerHTML = `<div><b></b><div class="muted"></div></div>` +
      `<span class="badge badge-active"></span>`;
    row.querySelector("b").textContent = item.name;
    row.querySelector(".muted").textContent = `slug: ${item.slug ?? item.id} — peran Anda: ${item.role ?? "?"}`;
    row.querySelector(".badge").textContent = item.status ?? "ACTIVE";
    row.addEventListener("click", () => openDetail(item.id).catch((e) => toast(e.message)));
    list.appendChild(row);
  }
}

function memberRow(handle, member) {
  const tr = document.createElement("tr");
  const badgeClass = member.status === "ACTIVE" ? "badge-active" : member.status === "INVITED" ? "badge-invited" : "badge-revoked";
  tr.innerHTML = `
    <td class="mem-email"></td>
    <td><div class="role-select"></div></td>
    <td><span class="badge ${badgeClass}"></span></td>
    <td class="row-actions"></td>`;
  tr.querySelector(".mem-email").textContent = member.email ?? member.uid ?? "?";

  const roleDiv = tr.querySelector(".role-select");
  const sel = document.createElement("select");
  for (const role of ROLES) {
    if (role === "INTEGRATION_CLIENT") continue;
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = role;
    if (role === member.role) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => {
    sel.disabled = true;
    handle.setRole(member.userId ?? member.id, sel.value).catch((e) => {
      toast(e.message);
      sel.disabled = false;
    });
  });
  roleDiv.appendChild(sel);

  const actions = tr.querySelector(".row-actions");
  if (member.status !== "REVOKED") {
    const btn = document.createElement("button");
    btn.className = "btn btn-ghost btn-mini";
    btn.textContent = "Hapus akses";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      handle.revoke(member.userId ?? member.id).catch((e) => {
        toast(e.message);
        btn.disabled = false;
      });
    });
    actions.appendChild(btn);
  }
  return tr;
}

/** Section detail workspace: nama, meta, tabel anggota, form tambah. */
export function renderDetail({ workspace, members }, handle) {
  q("ws-detail").classList.remove("hidden");
  q("wsd-name").textContent = workspace.name;
  q("wsd-meta").textContent = `slug: ${workspace.slug} — peran Anda: ${workspace.role}`;
  fillRoles();

  const tb = q("member-list");
  tb.innerHTML = "";
  const table = document.createElement("table");
  table.innerHTML = `
    <thead><tr><th>Email</th><th>Peran</th><th>Status</th><th></th></tr></thead>`;
  const tbody = document.createElement("tbody");
  if (members.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="4" class="muted">Belum ada anggota selain Anda.</td>';
    tbody.appendChild(tr);
  }
  for (const m of members) tbody.appendChild(memberRow(handle, m));
  table.appendChild(tbody);
  tb.appendChild(table);

  const form = q("form-invite");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = q("invite-email").value.trim();
    const role = q("invite-role").value;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await handle.invite(email, role);
      q("invite-email").value = "";
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
    }
  };
}

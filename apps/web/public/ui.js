import { ROLES } from "./roles.js";

const q = (id) => document.getElementById(id);

function el(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

/** Notifikasi transien: varian "ok" (hijau) atau "err" (merah). */
export function toast(message, variant = "ok") {
  const box = q("toast-error");
  box.textContent = message;
  box.classList.toggle("err", variant === "err");
  box.classList.remove("hidden");
  clearTimeout(box._t);
  box._t = setTimeout(() => box.classList.add("hidden"), 3800);
}

/** Dropdown peran untuk form undang anggota. */
export function fillRoles(selectId = "invite-role") {
  const sel = q(selectId);
  sel.innerHTML = "";
  for (const role of ROLES) {
    if (role === "INTEGRATION_CLIENT") continue; // cakupan diberikan pada fase berikutnya
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = role;
    sel.appendChild(opt);
  }
}

const TREE_SVG = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 3v9M12 12c-2.8 0-4.8-2-4.8-5M12 12c2.8 0 4.8-2 4.8-5M12 20c-1.8 0-2.8-1.4-2.8-3.6M12 20c1.8 0 2.8-1.4 2.8-3.6"/></svg>`;

/**
 * Kartu dashboard workspace.
 * items: WorkspaceDto + role (elemen tombol; klik → openDetail).
 */
export function renderDashboard(items, openDetail) {
  const stats = {
    count: items.length,
    roles: [...new Set(items.map((i) => i.role).filter(Boolean))],
  };
  q("stat-ws").textContent = String(stats.count);
  q("stat-role").textContent = stats.roles.length ? stats.roles.join(", ") : "—";

  const grid = q("ws-list");
  grid.innerHTML = "";
  if (items.length === 0) {
    const empty = el(
      `<div class="empty">${TREE_SVG}<b>Belum ada workspace</b>Buat workspace pertama dengan form di atas — misal nama keluarga.</div>`,
    );
    grid.appendChild(empty);
    return;
  }
  items.forEach((item, idx) => {
    const card = el(
      `<article class="ws-card" style="animation-delay:${idx * 45}ms" tabindex="0" role="button">
         <h4></h4>
         <div class="sub"></div>
         <div class="chips" style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"></div>
       </article>`,
    );
    card.querySelector("h4").textContent = item.name;
    card.querySelector(".sub").textContent = `slug: ${item.slug ?? item.id}`;

    const chipRole = el(`<span class="badge badge-peran"></span>`);
    chipRole.textContent = item.role ?? "?";
    const chipStatus = el(
      `<span class="badge ${item.status === "ACTIVE" ? "badge-active" : "badge-invited"}"></span>`,
    );
    chipStatus.textContent = item.status ?? "";
    card.querySelector(".chips").append(chipRole, chipStatus);

    const open = () => openDetail(item.id).catch((e) => toast(e.message, "err"));
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
    grid.appendChild(card);
  });
}

function statusBadge(status) {
  const cls = status === "ACTIVE" ? "badge-active" : status === "INVITED" ? "badge-invited" : "badge-revoked";
  return `<span class="badge ${cls}"></span>`;
}

function memberRow(handle, member) {
  const uid = member.uid ?? member.userId ?? member.id;
  const utama = member.name ?? member.email ?? uid; // nama dulu, lalu email, lalu uid
  const tr = el(
    `<tr>
      <td><div class="mem-name" style="font-weight:600"></div><div class="muted mem-sub" style="font-size:0.75rem"></div></td>
      <td><div class="role-select"></div></td>
      <td>${statusBadge(member.status)}</td>
      <td class="row-actions"></td>
    </tr>`,
  );
  tr.querySelector(".mem-name").textContent = utama;
  tr.querySelector(".mem-sub").textContent = member.name && member.email ? member.email : "";

  const roleCell = tr.querySelector(".role-select");
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
    handle.setRole(uid, sel.value).catch((e) => {
      toast(e.message, "err");
      sel.disabled = false;
    });
  });
  roleCell.appendChild(sel);

  const actions = tr.querySelector(".row-actions");
  const badgeEl = tr.querySelector(".badge");
  if (badgeEl) badgeEl.textContent = member.status ?? "";

  if (member.status !== "REVOKED") {
    const btn = el(`<button class="btn btn-ghost btn-mini" type="button">Hapus akses</button>`);
    btn.addEventListener("click", () => {
      btn.disabled = true;
      handle.revoke(uid).catch((e) => {
        toast(e.message, "err");
        btn.disabled = false;
      });
    });
    actions.appendChild(btn);
  } else {
    actions.innerHTML = `<span class="muted" style="font-size:0.75rem">hak dicabut</span>`;
  }
  return tr;
}

const ACTION_LABEL = {
  "workspace.created": "Workspace dibuat",
  "workspace.updated": "Workspace diperbarui (nama)",
  "member.added": "Anggota ditambahkan",
  "member.updated": "Keanggotaan diubah",
  "member.removed": "Akses anggota dicabut",
};

const WAKTU_OPSI = { dateStyle: "medium", timeStyle: "short" };

/** Kartu statistik ringkas di halaman detail (disembunyikan bila null). */
export function renderStats(stats) {
  const wrap = q("ws-stats");
  wrap.innerHTML = "";
  if (!stats) {
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  const chips = [
    { value: stats.totalMembers, label: "total anggota" },
    { value: stats.activeMembers, label: "aktif" },
    { value: stats.revokedMembers, label: "dicabut" },
    { value: Object.keys(stats.byRole).length, label: "peran berbeda" },
  ];
  for (const c of chips) {
    const chip = el(`<div class="ws-stat glass-chip"><b></b><small></small></div>`);
    chip.querySelector("b").textContent = String(c.value);
    chip.querySelector("small").textContent = c.label;
    wrap.appendChild(chip);
  }
}

/**
 * Jejak aktivitas: peristiwa audit terbaru (maks 6). Bila pemanggil
 * tidak berhak (endpoint mengembalikan 403), events = null → panel
 * disembunyikan dengan rapi, tanpa galat.
 */
export function renderActivity(events, members) {
  const wrap = q("activity-wrap");
  const list = q("activity-list");
  list.innerHTML = "";
  if (!events) {
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  const nameByUid = new Map(
    members.map((m) => [m.userId, m.name || (m.email ? m.email.split("@")[0] : m.userId)]),
  );
  const terbaru = events.slice(0, 6);
  if (terbaru.length === 0) {
    list.appendChild(el(`<li class="act-empty muted">Belum ada aktivitas tercatat.</li>`));
    return;
  }
  for (const ev of terbaru) {
    const waktu = ev.timestamp
      ? new Date(ev.timestamp).toLocaleString("id-ID", WAKTU_OPSI)
      : "waktu tidak diketahui";
    const aktor = ev.actorUserId ? (nameByUid.get(ev.actorUserId) ?? ev.actorUserId) : "sistem";
    const li = el(
      `<li class="act-item"><span class="act-dot" aria-hidden="true"></span><div><b class="act-action"></b><div class="muted act-meta"></div></div></li>`,
    );
    li.querySelector(".act-action").textContent = ACTION_LABEL[ev.action] ?? ev.action;
    li.querySelector(".act-meta").textContent = `${aktor} · ${waktu}`;
    list.appendChild(li);
  }
}

/** Rincian workspace: kepala + tabel anggota + form undang. */
export function renderDetail({ workspace, members }, handle) {
  q("ws-detail").classList.remove("hidden");
  q("wsd-name").textContent = workspace.name;
  q("wsd-meta").textContent = `slug: ${workspace.slug} — peran Anda: ${workspace.role}`;
  fillRoles();

  const wrap = q("member-list");
  wrap.innerHTML = "";
  const aktif = members.filter((m) => m.status === "ACTIVE").length;
  const table = el(
    `<table>
      <thead><tr><th>Anggota</th><th>Peran</th><th>Status</th><th></th></tr></thead>
    </table>`,
  );
  const tbody = el(`<tbody></tbody>`);
  if (members.length === 0) {
    const tr = el(`<tr><td colspan="4" class="muted">Belum ada anggota lain di workspace ini.</td></tr>`);
    tbody.appendChild(tr);
  }
  for (const m of members) tbody.appendChild(memberRow(handle, m));
  table.appendChild(tbody);
  wrap.appendChild(table);
  toast(`${workspace.name}: ${aktif} anggota aktif dari ${members.length} tercatat.`);
}

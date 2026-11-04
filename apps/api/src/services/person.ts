import { ApiError } from "@nasabku/shared";
import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import type { AuditAction } from "@nasabku/shared";
import { buildAuditDoc } from "./audit";
import { toIso } from "./user";

/**
 * Individu (entitas nasab) milik satu workspace.
 *
 - Data historis: nama, jenis kelamin, kelahiran/wafat (teks bebas
   untuk memuat tahun tak standar), tempat, catatan peneliti.
 - Relasi: ayah, ibu, pasangan — semuanya ID dokumen person lain dalam
   workspace yang sama.
 - Hapus bersifat lunak (status DELETED) agar jejak silsilah dan audit
   tidak hilang; relasi yang merujuk dibersihkan otomatis.
 */
export interface PersonDto {
  id: string;
  name: string;
  gender: string;
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  deathPlace: string | null;
  fatherId: string | null;
  motherId: string | null;
  spouseId: string | null;
  notes: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type PersonInputPatch = {
  name?: string;
  gender?: "L" | "P" | "";
  birthDate?: string | null;
  birthPlace?: string | null;
  deathDate?: string | null;
  deathPlace?: string | null;
  fatherId?: string | null;
  motherId?: string | null;
  spouseId?: string | null;
  notes?: string | null;
};

function personDto(id: string, data: Record<string, unknown>): PersonDto {
  return {
    id,
    name: String(data.name ?? ""),
    gender: String(data.gender ?? ""),
    birthDate: typeof data.birthDate === "string" ? data.birthDate : null,
    birthPlace: typeof data.birthPlace === "string" ? data.birthPlace : null,
    deathDate: typeof data.deathDate === "string" ? data.deathDate : null,
    deathPlace: typeof data.deathPlace === "string" ? data.deathPlace : null,
    fatherId: typeof data.fatherId === "string" ? data.fatherId : null,
    motherId: typeof data.motherId === "string" ? data.motherId : null,
    spouseId: typeof data.spouseId === "string" ? data.spouseId : null,
    notes: typeof data.notes === "string" ? data.notes : null,
    status: String(data.status ?? ""),
    createdBy: typeof data.createdBy === "string" ? data.createdBy : null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

type PersonDocData = Record<string, unknown>;

/** Nilai tunggal string dari dokumen Firestore; selain string → null. */
function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Ambil seluruh individu aktif satu workspace (urut nama, di memori). */
function activePersonsFrom(
  docs: Array<{ id: string; data: () => PersonDocData }>,
): Map<string, PersonDocData> {
  const byId = new Map<string, PersonDocData>();
  for (const doc of docs) {
    const data = doc.data() as PersonDocData;
    if (String(data.status ?? "") !== "DELETED") byId.set(doc.id, data);
  }
  return byId;
}

/**
 * Jawab bila relasi merujuk pada person yang hilang/nonaktif/diri-sendiri,
 * dan bila rantai leluhur membentuk siklus yang kembali ke titik asal.
 */
function validateRelations(
  byId: Map<string, PersonDocData>,
  subjectId: string,
  fatherId: string | null,
  motherId: string | null,
  spouseId: string | null,
): void {
  const links: Array<[string | null, string]> = [
    [fatherId, "fatherId"],
    [motherId, "motherId"],
    [spouseId, "spouseId"],
  ];
  for (const [referenced, field] of links) {
    if (referenced === null) continue;
    if (referenced === subjectId) {
      throw ApiError.validation("Relasi tidak boleh merujuk diri sendiri.", [
        { field, reason: "SELF_REFERENCE" },
      ]);
    }
    const target = byId.get(referenced);
    if (!target) {
      throw ApiError.validation(
        "Relasi merujuk individu yang tidak ada atau sudah dihapus.",
        [{ field, reason: "PERSON_NOT_FOUND" }],
      );
    }
  }
  // DFS leluhur: dari subject telusuri ayah lalu ibu; bila kembali ke
  // subject berarti siklus — batal.
  const stack: Array<{ id: string; depth: number }> = [];
  stack.push({ id: subjectId, depth: 0 });
  const visited = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur.id)) continue;
    visited.add(cur.id);
    if (cur.depth > 64) break; // pengaman — tidak mungkin lebih dalam.
    const father = byId.get(cur.id);
    if (!father) continue;
    const fatherRef =
      typeof father.fatherId === "string" ? father.fatherId : null;
    const motherRef =
      typeof father.motherId === "string" ? father.motherId : null;
    if (fatherRef === subjectId || motherRef === subjectId) {
      throw ApiError.validation(
        "Relasi membentuk siklus silsilah yang batal.",
        [{ field: "fatherId", reason: "CYCLE" }],
      );
    }
    if (fatherRef) stack.push({ id: fatherRef, depth: cur.depth + 1 });
    if (motherRef) stack.push({ id: motherRef, depth: cur.depth + 1 });
  }
}

async function loadActivePersons(
  db: Firestore,
  workspaceId: string,
): Promise<Map<string, PersonDocData>> {
  // Dokumen penuh dari koleksi workspace — ukuran fase ini kecil dan
  // dibatasi agar aman.
  const snap = await db
    .collection(`workspaces/${workspaceId}/persons`)
    .limit(500)
    .get();
  return activePersonsFrom(snap.docs);
}

export async function listPersons(
  db: Firestore,
  workspaceId: string,
): Promise<PersonDto[]> {
  const byId = await loadActivePersons(db, workspaceId);
  const items = [...byId.entries()].map(([id, data]) => personDto(id, data));
  items.sort((a, b) => a.name.localeCompare(b.name, "id"));
  return items;
}

export interface CreatePersonInput {
  workspaceId: string;
  actorUid: string;
  requestId: string;
  data: {
    name: string;
    gender?: "L" | "P" | "";
    birthDate?: string | null;
    birthPlace?: string | null;
    deathDate?: string | null;
    deathPlace?: string | null;
    fatherId?: string | null;
    motherId?: string | null;
    spouseId?: string | null;
    notes?: string | null;
  };
}

export async function createPerson(
  db: Firestore,
  input: CreatePersonInput,
): Promise<PersonDto> {
  const col = db.collection(`workspaces/${input.workspaceId}/persons`);
  const ref = col.doc();
  const byId = await loadActivePersons(db, input.workspaceId);

  const fatherId = input.data.fatherId ?? null;
  const motherId = input.data.motherId ?? null;
  const spouseId = input.data.spouseId ?? null;
  validateRelations(byId, ref.id, fatherId, motherId, spouseId);

  const now = Timestamp.now();
  const doc: PersonDocData = {
    name: input.data.name,
    gender: input.data.gender ?? "",
    birthDate: input.data.birthDate ?? null,
    birthPlace: input.data.birthPlace ?? null,
    deathDate: input.data.deathDate ?? null,
    deathPlace: input.data.deathPlace ?? null,
    fatherId,
    motherId,
    spouseId,
    notes: input.data.notes ?? null,
    status: "ACTIVE",
    createdBy: input.actorUid,
    createdAt: now,
    updatedAt: now,
  };

  await db.runTransaction(async (tx) => {
    tx.set(ref, doc);
    tx.set(
      db.collection("auditEvents").doc(),
      buildAuditDoc({
        action: "person.created" as AuditAction,
        actorType: "user",
        actorUserId: input.actorUid,
        workspaceId: input.workspaceId,
        resourceType: "person",
        resourceId: ref.id,
        requestId: input.requestId,
        outcome: "success",
        metadata: { name: input.data.name },
      }),
    );
  });

  return personDto(ref.id, doc);
}

export interface UpdatePersonInput {
  workspaceId: string;
  personId: string;
  actorUid: string;
  requestId: string;
  patch: PersonInputPatch;
}

export async function updatePerson(
  db: Firestore,
  input: UpdatePersonInput,
): Promise<PersonDto> {
  const ref = db.doc(`workspaces/${input.workspaceId}/persons/${input.personId}`);
  const byId = await loadActivePersons(db, input.workspaceId);
  const current = byId.get(input.personId);
  if (!current) throw ApiError.notFound("Individu tidak ditemukan.");

  const next = {
    name: input.patch.name ?? String(current.name ?? ""),
    gender: input.patch.gender ?? (String(current.gender ?? "") as "L" | "P" | ""),
    birthDate: "birthDate" in input.patch ? input.patch.birthDate ?? null : s(current.birthDate),
    birthPlace: "birthPlace" in input.patch ? input.patch.birthPlace ?? null : s(current.birthPlace),
    deathDate: "deathDate" in input.patch ? input.patch.deathDate ?? null : s(current.deathDate),
    deathPlace: "deathPlace" in input.patch ? input.patch.deathPlace ?? null : s(current.deathPlace),
    fatherId: "fatherId" in input.patch ? input.patch.fatherId ?? null : s(current.fatherId),
    motherId: "motherId" in input.patch ? input.patch.motherId ?? null : s(current.motherId),
    spouseId: "spouseId" in input.patch ? input.patch.spouseId ?? null : s(current.spouseId),
    notes: "notes" in input.patch ? input.patch.notes ?? null : s(current.notes),
  };
  // DFS siklus harus menilai kondisi PASCA-patch: ganti entri subjek
  // dengan nilai yang diusulkan sebelum validasi.
  byId.set(input.personId, next as PersonDocData);
  validateRelations(
    byId,
    input.personId,
    next.fatherId,
    next.motherId,
    next.spouseId,
  );

  const now = Timestamp.now();
  await db.runTransaction(async (tx) => {
    tx.set(
      ref,
      {
        ...next,
        updatedAt: now,
      },
      { merge: true },
    );
    tx.set(
      db.collection("auditEvents").doc(),
      buildAuditDoc({
        action: "person.updated" as AuditAction,
        actorType: "user",
        actorUserId: input.actorUid,
        workspaceId: input.workspaceId,
        resourceType: "person",
        resourceId: input.personId,
        requestId: input.requestId,
        outcome: "success",
        metadata: { name: next.name },
      }),
    );
  });

  const snap = await ref.get();
  return personDto(snap.id, snap.data() as PersonDocData);
}

export interface DeletePersonInput {
  workspaceId: string;
  personId: string;
  actorUid: string;
  requestId: string;
}

/**
 * Hapus lunak: setel status DELETED dan kosongkan relasi yang
 * merujuk pada individu ini — silsilah tetap konsisten.
 */
export async function deletePerson(
  db: Firestore,
  input: DeletePersonInput,
): Promise<{ deleted: true }> {
  const col = db.collection(`workspaces/${input.workspaceId}/persons`);
  const ref = col.doc(input.personId);
  const snap = await ref.get();
  if (!snap.exists) throw ApiError.notFound("Individu tidak ditemukan.");
  if (String((snap.data() as PersonDocData).status ?? "") === "DELETED") {
    throw ApiError.notFound("Individu tidak ditemukan.");
  }

  const byId = await loadActivePersons(db, input.workspaceId);
  byId.delete(input.personId);
  const now = Timestamp.now();

  await db.runTransaction(async (tx) => {
    tx.set(ref, { status: "DELETED", updatedAt: now }, { merge: true });
    for (const [otherId, data] of byId.entries()) {
      const patch: Record<string, unknown> = {};
      if (data.fatherId === input.personId) patch.fatherId = null;
      if (data.motherId === input.personId) patch.motherId = null;
      if (data.spouseId === input.personId) patch.spouseId = null;
      if (Object.keys(patch).length === 0) continue;
      tx.set(col.doc(otherId), { ...patch, updatedAt: now }, { merge: true });
    }
    tx.set(
      db.collection("auditEvents").doc(),
      buildAuditDoc({
        action: "person.deleted" as AuditAction,
        actorType: "user",
        actorUserId: input.actorUid,
        workspaceId: input.workspaceId,
        resourceType: "person",
        resourceId: input.personId,        requestId: input.requestId,
        outcome: "success",
      }),
    );
  });

  return { deleted: true };
}

// ===== Garis leluhur & jalur hubungan =====

export interface AncestorNode {
  person: PersonDto;
  depth: number; // 1 = ayah/ibu
  via: "ayah" | "ibu";
}

/**
 * Susun daftar seluruh leluhur satu orang: telusuri ayah dan ibu
 * berulang (BFS per generasi) dari map individu aktif.
 */
export async function ancestorsOf(
  db: Firestore,
  workspaceId: string,
  personId: string,
): Promise<AncestorNode[]> {
  const byId = await loadActivePersons(db, workspaceId);
  if (!byId.has(personId)) {
    // Leluhur orang yang tak ada/hapus: 404.
    throw ApiError.notFound("Individu tidak ditemukan.");
  }
  const out: AncestorNode[] = [];
  const visited = new Set<string>([personId]);
  let frontier: Array<{ id: string; via: "ayah" | "ibu"; depth: number }> = [];
  const start = byId.get(personId)!;
  if (s(start.fatherId)) frontier.push({ id: String(start.fatherId), via: "ayah", depth: 1 });
  if (s(start.motherId)) frontier.push({ id: String(start.motherId), via: "ibu", depth: 1 });
  while (frontier.length > 0) {
    const nextFrontier: typeof frontier = [];
    for (const node of frontier) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      if (node.depth > 32) continue; // pengaman kedalaman
      const data = byId.get(node.id);
      if (!data) continue; // leluhur belum terekam: lewati
      out.push({ person: personDto(node.id, data), depth: node.depth, via: node.via });
      if (s(data.fatherId))
        nextFrontier.push({ id: String(data.fatherId), via: "ayah", depth: node.depth + 1 });
      if (s(data.motherId))
        nextFrontier.push({ id: String(data.motherId), via: "ibu", depth: node.depth + 1 });
    }
    frontier = nextFrontier;
  }
  out.sort((a, b) => a.depth - b.depth || a.via.localeCompare(b.via, "id"));
  return out;
}

export interface DescendantNode {
  person: PersonDto;
  depth: number; // 1 = anak langsung
  via: "ayah" | "ibu" | "keduanya";
}

/**
 * Telusuri turunan ke bawah satu induk: BFS per generasi dari map
 * individu aktif, lengkap dengan jalur kedekatannya.
 */
export async function descendantsOf(
  db: Firestore,
  workspaceId: string,
  personId: string,
): Promise<DescendantNode[]> {
  const byId = await loadActivePersons(db, workspaceId);
  if (!byId.has(personId)) {
    throw ApiError.notFound("Individu tidak ditemukan.");
  }
  const anakLangsung: string[] = [];
  for (const [childId, cd] of byId) {
    if (cd.fatherId === personId || cd.motherId === personId) anakLangsung.push(childId);
  }
  const out: DescendantNode[] = [];
  const visited = new Set<string>([personId]);
  let frontier: Array<{ id: string; via: DescendantNode["via"]; depth: number }> = [];
  for (const id of anakLangsung) frontier.push({ id, via: "keduanya", depth: 1 });
  while (frontier.length > 0) {
    const nextFrontier: typeof frontier = [];
    for (const node of frontier) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      if (node.depth > 20) continue; // pengaman kedalaman garis turunan
      const data = byId.get(node.id);
      if (!data) continue;
      out.push({ person: personDto(node.id, data), depth: node.depth, via: node.via });
      for (const [childId, cd] of byId) {
        const lewatAyah = cd.fatherId === node.id;
        const lewatIbu = cd.motherId === node.id;
        if (lewatAyah && lewatIbu) {
          nextFrontier.push({ id: childId, via: "keduanya", depth: node.depth + 1 });
        } else if (lewatAyah) {
          nextFrontier.push({ id: childId, via: "ayah", depth: node.depth + 1 });
        } else if (lewatIbu) {
          nextFrontier.push({ id: childId, via: "ibu", depth: node.depth + 1 });
        }
      }
    }
    frontier = nextFrontier;
  }
  out.sort((a, b) => a.depth - b.depth || a.person.name.localeCompare(b.person.name, "id"));
  return out;
}

export interface RelationEdge {
  fromId: string;
  toId: string;
  label: string; // "ayah", "ibu", "pasangan", "orang tua" (arah anak→ortu dibalik)
}

export interface RelationPath {
  connected: boolean;
  gapGenerations: number | null; // jarak edges
  path: Array<{ person: PersonDto; edge: RelationEdge | null }> | null;
}

/**
 * Cari jalur hubungan terdekat dua individu pada graf tak berarah:
 * sisi ayah/ibu (dua arah) dan pasangan. BFS, entri lenyap diabaikan.
 */
export async function relationBetween(
  db: Firestore,
  workspaceId: string,
  aId: string,
  bId: string,
): Promise<RelationPath> {
  const byId = await loadActivePersons(db, workspaceId);
  if (!byId.has(aId) || !byId.has(bId)) {
    throw ApiError.notFound("Salah satu individu tidak ditemukan.");
  }
  if (aId === bId) {
    const p = personDto(aId, byId.get(aId)!);
    return { connected: true, gapGenerations: 0, path: [{ person: p, edge: null }] };
  }

  // Sisi: [tetanggaId, labelArahAKeT]. Untuk orang p: p→ayah "ayah",
  // ayah→p "orang tua"; pasangan dua arah "pasangan".
  const neighbors = (id: string): Array<[string, string]> => {
    const p = byId.get(id);
    if (!p) return [];
    const out: Array<[string, string]> = [];
    if (s(p.fatherId)) out.push([String(p.fatherId), "ayah"]);
    if (s(p.motherId)) out.push([String(p.motherId), "ibu"]);
    if (s(p.spouseId)) out.push([String(p.spouseId), "pasangan"]);
    for (const [childId, cd] of byId) {
      if (cd.fatherId === id || cd.motherId === id) out.push([childId, "orang tua"]);
      // Relasi pasangan bisa tersimpan satu arah; perlakukan dua arah.
      if (cd.spouseId === id) out.push([childId, "pasangan"]);
    }
    return out;
  };

  const prev = new Map<string, { id: string; label: string }>();
  const queue: string[] = [aId];
  const seen = new Set<string>([aId]);
  let found = false;
  while (queue.length > 0 && !found) {
    const cur = queue.shift()!;
    for (const [nb, label] of neighbors(cur)) {
      if (seen.has(nb)) continue;
      seen.add(nb);
      prev.set(nb, { id: cur, label });
      if (nb === bId) {
        found = true;
        break;
      }
      queue.push(nb);
    }
  }

  if (!found) {
    return { connected: false, gapGenerations: null, path: null };
  }

  // Bangun jalur dari b mundur ke a; edge menyimpan arah tapi disusun
  // maju (a → … → b) dengan label arah maju.
  const trace: Array<{ id: string; label: string }> = [];
  let curId = bId;
  while (curId !== aId) {
    const p = prev.get(curId)!;
    trace.push({ id: curId, label: p.label });
    curId = p.id;
  }
  trace.reverse();
  const path: RelationPath["path"] = [{ person: personDto(aId, byId.get(aId)!), edge: null }];
  let from = aId;
  for (const step of trace) {
    path.push({ person: personDto(step.id, byId.get(step.id)!), edge: { fromId: from, toId: step.id, label: step.label } });
    from = step.id;
  }
  return { connected: true, gapGenerations: trace.length, path };
}

// ===== Sumber/bukti per individu =====

export const SOURCE_KINDS = [
  "AKTE_LAHIR",
  "AKTE_NIKAH",
  "KTP",
  "WASIAT",
  "KITAB_SILSILAH",
  "WAWANCARA",
  "DOKUMEN_LAIN",
] as const;

export interface SourceDto {
  id: string;
  kind: string;
  title: string;
  ref: string | null;
  notes: string | null;
  addedBy: string | null;
  createdAt: string | null;
}

function sourceDto(id: string, data: Record<string, unknown>): SourceDto {
  return {
    id,
    kind: String(data.kind ?? "DOKUMEN_LAIN"),
    title: String(data.title ?? ""),
    ref: typeof data.ref === "string" ? data.ref : null,
    notes: typeof data.notes === "string" ? data.notes : null,
    addedBy: typeof data.addedBy === "string" ? data.addedBy : null,
    createdAt: toIso(data.createdAt),
  };
}

export async function listSources(
  db: Firestore,
  workspaceId: string,
  personId: string,
): Promise<SourceDto[]> {
  const pSnap = await db.doc(`workspaces/${workspaceId}/persons/${personId}`).get();
  if (!pSnap.exists || String((pSnap.data() as PersonDocData).status) === "DELETED") {
    throw ApiError.notFound("Individu tidak ditemukan.");
  }
  const snap = await db
    .collection(`workspaces/${workspaceId}/persons/${personId}/sources`)
    .get();
  const items = snap.docs.map((d) => sourceDto(d.id, d.data() as Record<string, unknown>));
  items.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "", "id"));
  return items;
}

export interface CreateSourceInput {
  workspaceId: string;
  personId: string;
  actorUid: string;
  requestId: string;
  data: { kind: (typeof SOURCE_KINDS)[number]; title: string; ref?: string | null; notes?: string | null };
}

export async function createSource(
  db: Firestore,
  input: CreateSourceInput,
): Promise<SourceDto> {
  const pRef = db.doc(`workspaces/${input.workspaceId}/persons/${input.personId}`);
  const pSnap = await pRef.get();
  if (!pSnap.exists || String((pSnap.data() as PersonDocData).status) === "DELETED") {
    throw ApiError.notFound("Individu tidak ditemukan.");
  }
  const col = pRef.collection("sources");
  const ref = col.doc();
  const now = Timestamp.now();
  const doc = {
    kind: input.data.kind,
    title: input.data.title,
    ref: input.data.ref ?? null,
    notes: input.data.notes ?? null,
    addedBy: input.actorUid,
    createdAt: now,
  };
  await db.runTransaction(async (tx) => {
    tx.set(ref, doc);
    tx.set(
      db.collection("auditEvents").doc(),
      buildAuditDoc({
        action: "person.source_added" as AuditAction,
        actorType: "user",
        actorUserId: input.actorUid,
        workspaceId: input.workspaceId,
        resourceType: "person",
        resourceId: input.personId,
        requestId: input.requestId,
        outcome: "success",
        metadata: { sourceId: ref.id, kind: input.data.kind },
      }),
    );
  });
  return sourceDto(ref.id, doc);
}

export interface DeleteSourceInput {
  workspaceId: string;
  personId: string;
  sourceId: string;
  actorUid: string;
  requestId: string;
}

export async function deleteSource(
  db: Firestore,
  input: DeleteSourceInput,
): Promise<{ deleted: true }> {
  const ref = db.doc(`workspaces/${input.workspaceId}/persons/${input.personId}/sources/${input.sourceId}`);
  const snap = await ref.get();
  if (!snap.exists) throw ApiError.notFound("Sumber tidak ditemukan.");
  const data = snap.data() as Record<string, unknown>;
  await db.runTransaction(async (tx) => {
    tx.delete(ref);
    tx.set(
      db.collection("auditEvents").doc(),
      buildAuditDoc({
        action: "person.source_removed" as AuditAction,
        actorType: "user",
        actorUserId: input.actorUid,
        workspaceId: input.workspaceId,
        resourceType: "person",
        resourceId: input.personId,
        requestId: input.requestId,
        outcome: "success",
        metadata: { sourceId: input.sourceId, kind: typeof data.kind === "string" ? data.kind : null },
      }),
    );
  });
  return { deleted: true };
}

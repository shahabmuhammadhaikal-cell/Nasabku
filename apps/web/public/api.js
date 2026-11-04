/**
 * Pel API Nasabku — semua pemanggilan same-origin `/api/v1`, enak satu
 * bentuk: sukses dijawab `data` polos (envelope dibuka), gagal melemparkan
 * galat berkadar { status, code, message, details?, debug?, requestId }.
 */
export async function apiFetch(jalur, { method = "GET", body } = {}) {
  let payload;
  try {
    const res = await fetch(`/api/v1${jalur}`, {
      method,
      ...(body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
      credentials: "same-origin",
    });
    payload = await res.json().catch(() => ({}));
    if (res.ok) {
      return payload?.data;
    }
    const e = payload?.error ?? {};
    const galat = new Error(e.message || `Permintaan gagal (HTTP ${res.status}).`);
    galat.status = res.status;
    galat.code = e.code;
    galat.details = e.details;
    galat.debug = e.debug;
    galat.requestId = e.requestId;
    throw galat;
  } catch (err) {
    if (err.status !== undefined) throw err;
    // Jaringan putus / galat fetch mentah.
    const galat = new Error(
      "Tidak dapat menghubungi server. Periksa koneksi, lalu coba lagi.",
    );
    galat.status = 0;
    galat.code = "NETWORK";
    throw galat;
  }
}

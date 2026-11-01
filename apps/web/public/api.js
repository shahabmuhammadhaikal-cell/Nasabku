/** Pembungkus fetch: kirim/terima JSON dan menangani envelope API Nasabku. */
export async function apiFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* respons tanpa isi */
  }
  if (!res.ok) {
    const message = json?.error?.message || `Permintaan gagal (${res.status}).`;
    const err = new Error(message);
    err.status = res.status;
    err.code = json?.error?.code;
    throw err;
  }
  return json.data;
}

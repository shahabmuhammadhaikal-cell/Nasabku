/** Pola slug workspace: huruf kecil, angka, tanda hubung di tengah. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Buat slug dari nama workspace.
 * NFKD → buang diakritik → huruf kecil → non-[a-z0-9] jadi "-" → potong 64.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return slug;
}

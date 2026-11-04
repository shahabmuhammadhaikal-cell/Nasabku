import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@nasabku/shared";
import { denganTahap, kodeDatabase } from "../../src/lib/tahap";

const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as unknown as Parameters<
  typeof denganTahap
>[0];

describe("denganTahap", () => {
  it("operasi sukses → hasil diteruskan apa adanya", async () => {
    const hasil = await denganTahap(logger, "req_x", "tahap_ok", async () => 42);
    expect(hasil).toBe(42);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("galat Firestore → ApiError 500 generik + debug { stage, dbCode }", async () => {
    const errSkema = Object.assign(new Error("gagal"), { code: "permission-denied" });
    const p = denganTahap(logger, "req_y", "login_upsert_user", async () => {
      throw errSkema;
    });
    await expect(p).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
      debug: { stage: "login_upsert_user", dbCode: "permission-denied" },
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("galat tanpa kode → dbCode undefined tetap terisi di debug", async () => {
    const p = denganTahap(logger, "req_z", "me_list_memberships", async () => {
      throw new Error("koneksi terputus");
    });
    await expect(p).rejects.toMatchObject({
      debug: { stage: "me_list_memberships", dbCode: undefined },
    });
  });

  it("ApiError asli diteruskan tanpa pembungkus — status asli dipertahankan", async () => {
    const asal = ApiError.conflict("Email sudah terdaftar. Gunakan tombol Masuk.");
    const p = denganTahap(logger, "req_w", "register_create_auth", async () => {
      throw asal;
    });
    await expect(p).rejects.toSatisfy((e: unknown) => e === asal);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe("kodeDatabase", () => {
  it("membaca kode dari galat Firestore / Admin SDK", () => {
    expect(kodeDatabase({ code: "permission-denied" })).toBe("permission-denied");
    expect(kodeDatabase({ extraInfo: { code: 12 } })).toBeUndefined();
    expect(kodeDatabase("string mentah")).toBeUndefined();
    expect(kodeDatabase(null)).toBeUndefined();
  });
});

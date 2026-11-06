/** Galat yang memang ditujukan untuk klien; selain ini dianggap galat tak terduga. */
export class GalatApi extends Error {
  readonly status: number;
  readonly kode: string;
  readonly rincian?: unknown;

  constructor(status: number, kode: string, pesan: string, rincian?: unknown) {
    super(pesan);
    this.name = "GalatApi";
    this.status = status;
    this.kode = kode;
    this.rincian = rincian;
  }
}

export function galat(status: number, kode: string, pesan: string, rincian?: unknown): GalatApi {
  return new GalatApi(status, kode, pesan, rincian);
}

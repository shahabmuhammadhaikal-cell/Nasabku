import type { ErrorDetail } from "@nasabku/shared";
import { ZodError } from "zod";

/**
 * Pemetaan isu Zod → detail error kontrak API.
 * Contoh: format email → INVALID_EMAIL, uuid → INVALID_UUID.
 */
export function zodIssuesToDetails(err: ZodError): ErrorDetail[] {
  return err.issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)";
    switch (issue.code) {
      case "invalid_format":
        return { field, reason: `INVALID_${String(issue.format).toUpperCase()}` };
      case "unrecognized_keys":
        return { field: issue.keys[0] ?? field, reason: "UNKNOWN_FIELD" };
      case "too_small":
        return { field, reason: "TOO_SMALL" };
      case "too_big":
        return { field, reason: "TOO_BIG" };
      case "invalid_value":
        return { field, reason: "INVALID_VALUE" };
      case "invalid_union":
        return { field, reason: "INVALID_VALUE" };
      case "custom":
        return { field, reason: issue.message || "INVALID" };
      default:
        return { field, reason: "INVALID_TYPE" };
    }
  });
}

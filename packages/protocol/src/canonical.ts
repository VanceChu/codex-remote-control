import { canonicalize as rfc8785Canonicalize } from "json-canonicalize";
import type { JsonValue } from "./types.js";

export function canonicalize(value: JsonValue): string {
  validateJsonValue(value);
  return rfc8785Canonicalize(value);
}

function validateJsonValue(value: JsonValue): void {
  if (value === null) {
    return;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new TypeError("Unsupported JSON number");
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      validateJsonValue(item);
    }
    return;
  }
  if (typeof value === "object") {
    for (const key of Object.keys(value)) {
      const item = value[key];
      if (item === undefined) {
        throw new TypeError("Unsupported JSON value");
      }
      validateJsonValue(item);
    }
    return;
  }
  throw new TypeError("Unsupported JSON value");
}

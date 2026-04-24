import { describe, expect, it } from "vitest";
import { canonicalize } from "./canonical.js";

describe("canonicalize", () => {
  it("sorts object keys recursively and keeps array order", () => {
    expect(canonicalize({ b: 2, a: { d: true, c: ["z", "a"] } })).toBe(
      '{"a":{"c":["z","a"],"d":true},"b":2}'
    );
  });

  it("rejects unsupported JSON values", () => {
    expect(() => canonicalize({ value: undefined })).toThrow("Unsupported JSON value");
    expect(() => canonicalize(Number.NaN)).toThrow("Unsupported JSON number");
  });
});

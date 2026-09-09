import { describe, expect, it } from "vitest";
import { matchesMessengerPhone } from "../server/messenger-auth-phone";

describe("messenger-supplied phone", () => {
  it("allows a verified phone without prior manual entry", () => {
    expect(matchesMessengerPhone("+79990000000", null)).toBe(true);
  });

  it("still enforces the phone entered by an older client", () => {
    expect(matchesMessengerPhone("+79990000000", "+79990000000")).toBe(true);
    expect(matchesMessengerPhone("+79990000000", "+79990000001")).toBe(false);
  });

  it.each([null, "", "+12025550123", "+74950000000", "79990000000", "+7999"])(
    "rejects a missing or unsupported phone: %s",
    (phone) => {
      expect(matchesMessengerPhone(phone, null)).toBe(false);
    },
  );
});

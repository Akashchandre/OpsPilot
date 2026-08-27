import { describe, expect, it } from "vitest";
import {
  digestRequest,
  lineTotalSubunits,
  moneyToSubunits,
  presentMoney,
  subunitsToMoney,
  sumSubunits,
} from "./commerce.money.js";

describe("commerce money", () => {
  it("converts fixed-precision values without floating-point arithmetic", () => {
    expect(presentMoney("123.4")).toBe("123.40");
    expect(moneyToSubunits("123.40")).toBe(12_340);
    expect(subunitsToMoney(12_340)).toBe("123.40");
    expect(lineTotalSubunits("10.25", 3)).toBe(3_075);
    expect(sumSubunits([3_075, 925])).toBe(4_000);
  });

  it("rejects invalid or provider-unsafe totals", () => {
    expect(() => presentMoney("1.234")).toThrowError(
      expect.objectContaining({ code: "MONEY_STATE_INVALID" }),
    );
    expect(() => moneyToSubunits("20000000.01")).toThrowError(
      expect.objectContaining({ code: "ORDER_TOTAL_OUT_OF_RANGE" }),
    );
  });

  it("creates the same request digest regardless of object key order", () => {
    expect(digestRequest({ address: { city: "Pune", pin: "411001" }, quantity: 2 })).toBe(
      digestRequest({ quantity: 2, address: { pin: "411001", city: "Pune" } }),
    );
  });
});

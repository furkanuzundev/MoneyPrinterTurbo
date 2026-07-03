import { describe, expect, it } from "vitest";
import { estimateEtaSeconds } from "../status";

describe("estimateEtaSeconds", () => {
  it("empty queue means one render slot", () => {
    expect(estimateEtaSeconds(0, 2)).toBe(120);
  });
  it("distributes queue across workers", () => {
    expect(estimateEtaSeconds(4, 2)).toBe(360); // ceil(4/2)*120 + 120
    expect(estimateEtaSeconds(5, 2)).toBe(480);
  });
  it("defaults workers from env or 2", () => {
    expect(estimateEtaSeconds(2)).toBe(240);
  });
});

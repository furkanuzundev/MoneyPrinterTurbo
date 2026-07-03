import { describe, expect, it } from "vitest";
import { estimateEtaSeconds } from "../status";

describe("estimateEtaSeconds", () => {
  it("empty queue means one render slot", () => {
    expect(estimateEtaSeconds(0, 2)).toBe(270); // ceil(0/2)*270 + 270
  });
  it("distributes queue across workers", () => {
    expect(estimateEtaSeconds(4, 2)).toBe(810); // ceil(4/2)*270 + 270
    expect(estimateEtaSeconds(5, 2)).toBe(1080); // ceil(5/2)*270 + 270
  });
  it("defaults workers from env or 2", () => {
    expect(estimateEtaSeconds(2)).toBe(540); // ceil(2/2)*270 + 270
  });
});

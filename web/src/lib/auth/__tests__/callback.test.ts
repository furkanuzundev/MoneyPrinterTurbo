import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_SIGNIN, safeCallbackPath } from "../callback";

describe("safeCallbackPath", () => {
  it("defaults to the dashboard when nothing is given", () => {
    expect(safeCallbackPath(undefined)).toBe(DEFAULT_AFTER_SIGNIN);
    expect(safeCallbackPath("")).toBe(DEFAULT_AFTER_SIGNIN);
  });

  it("keeps a relative in-app path", () => {
    expect(safeCallbackPath("/dashboard/videos/abc")).toBe(
      "/dashboard/videos/abc",
    );
  });

  it("keeps the query string and hash of an in-app path", () => {
    expect(safeCallbackPath("/dashboard/library?page=2#top")).toBe(
      "/dashboard/library?page=2#top",
    );
  });

  it("rejects every absolute URL, including our own origin", () => {
    // Origin runtime'da bilinemediği için mutlak hedef hiç kabul edilmez;
    // middleware göreli yol yazar (src/middleware.ts).
    expect(safeCallbackPath("https://reelate.org/dashboard/videos/abc")).toBe(
      DEFAULT_AFTER_SIGNIN,
    );
    expect(safeCallbackPath("https://evil.example.com/steal")).toBe(
      DEFAULT_AFTER_SIGNIN,
    );
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeCallbackPath("//evil.example.com/steal")).toBe(
      DEFAULT_AFTER_SIGNIN,
    );
  });

  it("rejects non-http schemes", () => {
    expect(safeCallbackPath("javascript:alert(1)")).toBe(DEFAULT_AFTER_SIGNIN);
    expect(safeCallbackPath("data:text/html,x")).toBe(DEFAULT_AFTER_SIGNIN);
  });

  it("rejects backslash tricks and non-string input", () => {
    expect(safeCallbackPath("/\\evil.example.com")).toBe(DEFAULT_AFTER_SIGNIN);
    expect(safeCallbackPath(["/a", "/b"])).toBe(DEFAULT_AFTER_SIGNIN);
  });

  it("never sends the user back to the sign-in page", () => {
    expect(safeCallbackPath("/signin")).toBe(DEFAULT_AFTER_SIGNIN);
    expect(safeCallbackPath("/signin?mode=signup")).toBe(DEFAULT_AFTER_SIGNIN);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// config.ts ID'yi modül yüklenirken okur; her testte temiz modül + sahte tarayıcı.
async function loadGtag({
  hostname = "reelate.org",
  cookie = "",
  measurementId = "G-TEST123",
}: { hostname?: string; cookie?: string; measurementId?: string } = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", measurementId);
  const cookieWrites: string[] = [];
  // Tarayıcı jar'ı yazmada tüm string'i değiştirmez; yazmaları ayrıca kaydet.
  const jar = cookie;
  vi.stubGlobal("window", { location: { hostname, protocol: "https:" } });
  vi.stubGlobal("document", {
    get cookie() {
      return jar;
    },
    set cookie(value: string) {
      cookieWrites.push(value);
    },
  });
  const mod = await import("../gtag");
  const calls = () =>
    ((window as unknown as { dataLayer?: IArguments[] }).dataLayer ?? []).map((a) =>
      Array.from(a),
    );
  return { ...mod, calls, cookieWrites };
}

describe("gtag bootstrap", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("queues consent default (all denied) before anything else", async () => {
    const { initGtag, calls } = await loadGtag();
    expect(initGtag()).toBe(true);
    const [first, ...rest] = calls();
    expect(first).toEqual([
      "consent",
      "default",
      {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        wait_for_update: 500,
      },
    ]);
    expect(rest.map((c) => c[0])).toEqual(["js", "config"]);
  });

  it("restores a stored grant right after the default", async () => {
    const { initGtag, calls } = await loadGtag({ cookie: "reelate_consent=granted" });
    initGtag();
    expect(calls()[1]).toEqual(["consent", "update", { analytics_storage: "granted" }]);
  });

  it("is idempotent", async () => {
    const { initGtag, calls } = await loadGtag();
    initGtag();
    initGtag();
    expect(calls().filter((c) => c[0] === "config")).toHaveLength(1);
  });

  it("stays off on the admin host and without a measurement id", async () => {
    const admin = await loadGtag({ hostname: "admin.reelate.org" });
    expect(admin.initGtag()).toBe(false);
    admin.track("caption_rerender", {});
    expect(admin.calls()).toEqual([]);

    const noId = await loadGtag({ measurementId: "" });
    expect(noId.initGtag()).toBe(false);
  });

  it("track bootstraps on first use so events never precede consent default", async () => {
    const { track, calls } = await loadGtag();
    track("video_rate", { rating: 4, location: "library" });
    expect(calls()[0][0]).toBe("consent");
    expect(calls().at(-1)).toEqual(["event", "video_rate", { rating: 4, location: "library" }]);
  });

  it("setConsent stores the choice and updates gtag", async () => {
    const { setConsent, calls, cookieWrites } = await loadGtag();
    setConsent("granted");
    expect(cookieWrites[0]).toContain("reelate_consent=granted");
    expect(calls().at(-1)).toEqual(["consent", "update", { analytics_storage: "granted" }]);
  });

  it("withdrawing consent expires existing _ga cookies", async () => {
    const { setConsent, cookieWrites } = await loadGtag({
      hostname: "www.reelate.org",
      cookie: "_ga=GA1.1.1.2; _ga_TEST123=GS1; reelate_consent=granted",
    });
    setConsent("denied");
    expect(cookieWrites).toContain("_ga=; Max-Age=0; Path=/; Domain=.reelate.org");
    expect(cookieWrites).toContain("_ga_TEST123=; Max-Age=0; Path=/; Domain=.reelate.org");
  });

  it("holds user_id back until consent is granted", async () => {
    const { setUserId, setConsent, calls } = await loadGtag();
    setUserId("user-1");
    expect(calls().some((c) => c[0] === "set")).toBe(false);
    setConsent("granted");
    expect(calls()).toContainEqual(["set", { user_id: "user-1" }]);
    setConsent("denied");
    expect(calls().at(-1)).toEqual(["set", { user_id: null }]);
  });

  it("sends user_id right away when consent was stored, and clears it on demand", async () => {
    const { setUserId, clearUserId, calls } = await loadGtag({
      cookie: "reelate_consent=granted",
    });
    setUserId("user-1");
    expect(calls().at(-1)).toEqual(["set", { user_id: "user-1" }]);
    clearUserId();
    expect(calls().at(-1)).toEqual(["set", { user_id: null }]);
    // Sonradan onay verilse bile temizlenmiş id geri gelmez.
    const count = calls().length;
    clearUserId();
    expect(calls()).toHaveLength(count);
  });

  it("getGaIds returns nothing without consent", async () => {
    const { getGaIds } = await loadGtag();
    await expect(getGaIds()).resolves.toEqual({});
  });

  it("getGaIds resolves ids from gtag, or times out empty-handed", async () => {
    const { getGaIds, initGtag } = await loadGtag({ cookie: "reelate_consent=granted" });
    initGtag();
    // gtag.js yokken 'get' callback'i hiç çağrılmaz -> zaman aşımı.
    const pending = getGaIds(300);
    vi.advanceTimersByTime(300);
    await expect(pending).resolves.toEqual({});

    (window as unknown as { gtag: unknown }).gtag = (
      _cmd: string,
      _id: string,
      field: string,
      cb: (v: unknown) => void,
    ) => cb(field === "client_id" ? "123.456" : 1726480000);
    await expect(getGaIds(300)).resolves.toEqual({
      gaClientId: "123.456",
      gaSessionId: "1726480000",
    });

    (window as unknown as { gtag: unknown }).gtag = (
      _cmd: string,
      _id: string,
      field: string,
      cb: (v: unknown) => void,
    ) => cb(field === "client_id" ? undefined : 1726480000);
    await expect(getGaIds(300)).resolves.toEqual({});
  });
});

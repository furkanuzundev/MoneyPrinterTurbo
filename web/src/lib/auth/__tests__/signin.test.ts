import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "../signin";

describe("signInErrorMessage", () => {
  it("is silent when no error is present", () => {
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("")).toBeNull();
    expect(signInErrorMessage(["a", "b"])).toBeNull();
  });

  it("explains OAuthAccountNotLinked in terms of the open session", () => {
    // Prod'da görülen tek hata buydu: aktif oturum varken başka bir Google
    // hesabı seçilmesi. Kullanıcı hiçbir mesaj görmeden /signin'e düşüyordu.
    const msg = signInErrorMessage("OAuthAccountNotLinked");
    expect(msg).toBeTruthy();
    expect(msg!.toLowerCase()).toContain("sign out");
  });

  it("falls back to a generic message for any other Auth.js code", () => {
    for (const code of ["Configuration", "AccessDenied", "OAuthCallbackError", "wat"]) {
      expect(signInErrorMessage(code)).toBeTruthy();
    }
  });
});

describe("signin page guards an existing session", () => {
  // Kök neden: /signin her ziyaretçiyi anonim sayıyordu, bu yüzden girişli bir
  // kullanıcının "Start free" linki Google hesap seçiciye gidiyor ve farklı bir
  // hesap seçilince Auth.js OAuthAccountNotLinked fırlatıyordu.
  const source = readFileSync(
    join(process.cwd(), "src/app/signin/page.tsx"),
    "utf8",
  );

  it("resolves the session before rendering the Google form", () => {
    expect(source).toMatch(/await auth\(\)/);
  });

  it("redirects a signed-in visitor away instead of showing the form", () => {
    expect(source).toMatch(/redirect\(/);
  });

  it("surfaces the ?error= parameter", () => {
    expect(source).toContain("signInErrorMessage");
  });

  it("keeps the signed-in visitor on the page when there is an error to explain", () => {
    // Aksi halde hatanın tek kurbanı (girişli kullanıcı) mesajı görmeden
    // /dashboard'a savrulur ve neden hesap değiştiremediğini asla anlamaz.
    expect(source).toMatch(/if \(session\?\.user && !errorMessage\) redirect\(/);
  });

  it("offers a sign-out escape instead of the same failing Google form", () => {
    expect(source).toContain("signOut");
  });
});

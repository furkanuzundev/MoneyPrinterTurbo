# Sign-in Refactor — docs/sign-in.html mockup'ına göre

## Context

Landing refactor'ı (commit 041bf2d) tamamlandı; palet/fontlar global olarak yeni warm-black temaya geçti. Sırada sign-in ekranı var: mevcut `web/src/app/signin/page.tsx` (31 satır) ortalanmış basit bir kart. `docs/sign-in.html` içindeki mockup (landing ile aynı self-extracting bundle formatı; template çıkarma yöntemi aynı) iki panelli bir tasarım tanımlıyor:

- **Sol form paneli:** R logosu + "Reelate", "WELCOME BACK" eyebrow, "Sign in to Reelate" H1, subcopy, beyaz "Continue with Google" butonu (G işareti; gönderim sırasında spinner + "Connecting…"), "SECURE SIGN-IN" ayracı, bilgi kutusu (◆ "Your Google account signs you in — no password to remember. We never post without you."), Terms/Privacy cümlesi, alt bar ("New to Reelate? Start free →" + "© 2026 Reelate").
- **Sağ showcase paneli:** gradient arka plan + sarı glow, yüzen telefon (landing hero'dakiyle aynı görsel), altında Maya Chen testimonial'ı (landing'de tutulmuştu — burada da kalır).

## Kullanıcı kararı

- **/terms ve /privacy sayfaları da oluşturulacak** ve sign-in'den linklenecek (Google OAuth/Stripe go-live için zaten gerekli).

## Dosyalar

```
web/src/app/signin/page.tsx            → yeniden yazılır: iki panelli düzen (server component, mevcut signIn server action korunur)
web/src/components/landing/hero-phone.tsx → YENİDEN KULLANILIR (telefon + MADE WITH REELATE + progress overlay, hero-demo.mp4)
web/src/components/signin/google-button.tsx → YENİ, client: useFormStatus ile pending durumunda spinner + "Connecting…"
web/src/app/terms/page.tsx             → YENİ: statik Terms of Service sayfası
web/src/app/privacy/page.tsx           → YENİ: statik Privacy Policy sayfası
web/src/app/landing.css                → değişmez (heroFloat/heroGlow/heroRec zaten var; signin sayfası bu CSS'i import eder)
```

Not: `HeroPhone` mockup'ta 266×474/radius-32; landing'de 290×520/radius-34 — fark ihmal edilir, bileşen aynen kullanılır (id çakışması yok; sayfa başına tek instance). `HERO_VIDEO_ID` sabiti signin'de kullanılmaz (Watch demo yok).

## Uygulama detayları

**signin/page.tsx** (server component):
- Kök: `flex min-h-screen` — sol panel `flex-1 flex flex-col p-10 lg:px-14` (logo üstte, form ortada `max-w-[380px]`, alt bar en altta), sağ panel `hidden lg:flex flex-1 relative overflow-hidden border-l border-white/5 bg-gradient-to-br from-[#1A1710] to-ink` (glow div `heroGlow`, HeroPhone, testimonial).
- Mevcut `signIn("google", { redirectTo: "/dashboard" })` server action'lı `<form>` aynen korunur; içindeki buton yeni `GoogleButton` olur.
- Logo: 30px sarı yuvarlak köşeli kare içinde display-font "R" + "Reelate" (mockup'taki gibi) — `/`'a link.
- Kopyalar mockup'tan birebir (Welcome back, subcopy, secure sign-in, bilgi kutusu, Terms cümlesi, alt bar). Terms → `/terms`, Privacy Policy → `/privacy` `<Link>`.
- "Start free →" aynı Google akışını tetikler: ayrı bir form'a gerek yok — görsel olarak link stilinde, `form=`… yerine basitçe aynı sayfadaki forma `button type="submit" form="google-signin-form"` bağlanır (form'a id verilir).
- Eski `CaptionChip`/"2 free credits" kopyası kalkar (mockup'ta yok; landing hero'da "2 videos on us" mesajı zaten var).

**google-button.tsx** (`"use client"`):
- `useFormStatus()` → `pending` iken: spinner (`animate-spin` border tekniği, mockup'taki reSpin yerine Tailwind'in hazır animasyonu), etiket "Connecting…", `disabled`, `opacity-85`.
- Normal: beyaz zemin, `#4285F4` renkli display-font "G" işareti, "Continue with Google", `rounded-[13px] py-[15px] font-bold shadow`.

**terms/page.tsx & privacy/page.tsx:**
- Aynı sade şablon: dar sütun (`max-w-2xl`), display-font H1, `metadata` (title), kısa standart maddeler (hizmet tanımı, kredi/ödeme, kabul edilebilir kullanım, fesih, iletişim: info@falportal.com yerine `support@reelate.co` gibi nötr bir adres — İngilizce). Privacy: toplanan veriler (Google profil, videolar, ödeme Stripe'ta), çerezler, silme talebi. Landing footer'ına `/privacy` linki de eklenir (mockup'ta vardı, sayfa olmadığı için atlanmıştı).
- İçerik "last updated: 2026-07-03" notuyla; hukuki metin iddiası taşımayan standart başlangıç şablonu.

## Doğrulama

1. `npm run build` (web/) — yeni statik sayfalar dahil derleme.
2. Dev server + headless Chrome/CDP: `/signin` masaüstü (iki panel, video oynuyor, glow/float animasyonları) ve 390px mobil (sağ panel gizli, form tek sütun, taşma yok — `scrollWidth` kontrolü).
3. Google butonu pending durumu: form submit'i intercept etmeden `useFormStatus` davranışını CDP ile tetiklemek OAuth'a gideceği için, pending görseli butona `disabled` simülasyonuyla değil gerçek tıklamayla doğrulanır (redirect'e gitmesi normal; spinner'ın göründüğü frame yakalanır) — yeterli olmazsa görsel doğrulama normal durumla sınırlı tutulup pending stili kod incelemesiyle onaylanır.
4. `/terms` ve `/privacy` 200 + görsel kontrol; sign-in'deki linklerin çalıştığı.
5. Spec dosyası `docs/superpowers/specs/2026-07-03-signin-refactor-design.md` olarak commit edilir.

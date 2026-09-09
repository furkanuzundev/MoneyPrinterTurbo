"use client";

/**
 * Root layout'un kendisi patlarsa devreye girer; kendi <html>/<body>'sini
 * render etmek zorunda, bu yüzden tema class'ları ve stil burada satır içi.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "18px",
          padding: "40px 24px",
          background: "#0D0C0A",
          color: "#F2EDE3",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          textAlign: "center",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            height: 34,
            width: 34,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            background: "#F4C63A",
            color: "#141208",
            fontSize: 20,
            fontWeight: 800,
          }}
          aria-hidden
        >
          R
        </span>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>
          Reelate couldn&apos;t load
        </h1>
        <p style={{ margin: 0, maxWidth: 420, color: "#9C958A", lineHeight: 1.6 }}>
          Something went wrong before the page could start.
          {error.digest ? ` Reference: ${error.digest}.` : ""}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 8,
            border: 0,
            borderRadius: 12,
            background: "#F4C63A",
            color: "#141208",
            padding: "13px 26px",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
        {/* next/link kullanılmıyor: global-error root layout çöktüğünde
            render edilir, router kabuğuna güvenmemek için tam sayfa
            navigasyon tercih edildi. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" style={{ color: "#9C958A", fontSize: 14 }}>
          Back to home
        </a>
      </body>
    </html>
  );
}

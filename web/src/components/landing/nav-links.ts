// Masaüstü nav ve mobil sheet aynı listeyi kullanır; ikisi ayrışmasın diye
// tek kaynak. Hedef bölümlere `scroll-mt` verilmesi gerekir çünkü header artık
// sticky (bkz. header.tsx).
export const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#editor", label: "The editor" },
  { href: "#showcase", label: "Showcase" },
  { href: "#pricing", label: "Pricing" },
] as const;

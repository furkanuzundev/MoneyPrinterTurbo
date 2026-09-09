import { notFound } from "next/navigation";

/**
 * middleware, ana domaindeki /admin* isteklerini ve admin host'undaki iç
 * route'ları buraya rewrite ediyor (src/lib/admin/routing.ts). Rota gerçekten
 * var olmadığı için Next'in varsayılan 404'üne düşüyordu; burada notFound()
 * çağırarak hem markalı sayfayı hem gerçek 404 statüsünü veriyoruz.
 */
export default function RewrittenNotFound(): never {
  notFound();
}

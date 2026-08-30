import type { MetadataRoute } from "next";

/**
 * Nichts an dieser App gehoert in einen Suchindex.
 *
 * Alles ausser /login, /register und /welcome liegt hinter dem Proxy-Gate und
 * waere fuer einen Crawler ohnehin nur eine Weiterleitung; die drei
 * oeffentlichen Seiten wiederum nuetzen niemandem, der die Instanz nicht
 * kennt. Der `robots`-Eintrag im Root-Layout sagt dasselbe noch einmal als
 * Meta-Tag -- robots.txt haelt Crawler fern, das Meta-Tag haelt bereits
 * indexierte Adressen aus den Ergebnissen.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}

// Jedini spisak komandi LaTeX-a koje se ne crtaju i ne čuvaju (odluka 5a). Bez uvoza: koriste ga i statički prikaz
// (`formula-markup`, sa `mathlive/ssr`) i editor (dijalog i pravila formule, F16), a editor ne sme da uvuče `mathlive/ssr`.

/** Komande koje prave atribute ili stil iz LaTeX-a: formula sa njima se crta kao izvor, a dijalog je ne čuva. */
export const ZABRANJENE_KOMANDE = /\\(?:htmlStyle|style|cssId|htmlId|class|htmlData|href|url|csname)(?![A-Za-z])/;

import { Route, UrlMatcher, UrlSegment } from '@angular/router';

/** Id u putanji: pozitivan ceo broj bez vodećih nula (najviše 15 cifara, da ostane tačan u JS broju). */
export const JE_ID = /^[1-9]\d{0,14}$/;

/**
 * Matcher za šablon sa id parametrima, npr. `'predavanja/:id/projektor'`: svaki `:param` mora biti `JE_ID`, inače ruta
 * ne odgovara (pa `/predavanja/abc` ide na 404, a ne na ekran koji bi zvao `api/predavanja/abc`).
 * Ruta bez dece mora da potroši celu putanju; ruta sa decom troši samo šablon, a ostatak ide deci.
 */
export function putanjaSaId(sablon: string): UrlMatcher {
  const delovi = sablon.split('/');
  return (segmenti: UrlSegment[], _grupa, route: Route) => {
    const imaDecu = !!(route.children || route.loadChildren);
    if (segmenti.length < delovi.length || (!imaDecu && segmenti.length !== delovi.length)) {
      return null;
    }
    const posParams: Record<string, UrlSegment> = {};
    for (let i = 0; i < delovi.length; i++) {
      const deo = delovi[i];
      const segment = segmenti[i];
      if (deo.startsWith(':')) {
        if (!JE_ID.test(segment.path)) {
          return null;
        }
        posParams[deo.slice(1)] = segment;
      } else if (deo !== segment.path) {
        return null;
      }
    }
    return { consumed: segmenti.slice(0, delovi.length), posParams };
  };
}

/** Tačno jedan neprazan segment kao parametar `ime` (`/upis/` ima prazan segment, a ne token). */
export function neprazanParametar(ime: string): UrlMatcher {
  return segmenti =>
    segmenti.length === 1 && segmenti[0].path !== '' ? { consumed: segmenti, posParams: { [ime]: segmenti[0] } } : null;
}

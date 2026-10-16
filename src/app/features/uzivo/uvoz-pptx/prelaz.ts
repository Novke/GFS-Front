// Prelaz slajda iz PowerPointa (plan faze 5, odluka 13). Čiste funkcije bez Angular-a (lokalna provera ih pokreće u Node-u).
import type { Prelaz, SmerPrelaza } from '../data-access/uzivo.models';
import { deca, dete, NS } from './xml';

export interface IshodPrelaza { prelaz: Prelaz | null; upozorenja: string[]; }
const BRZINA: Readonly<Record<string, number>> = { fast: 500, med: 750, slow: 1000 };
/** `dir` je smer kretanja (`ST_TransitionSideDirectionType`); `smer` aplikacije je strana sa koje novi slajd dolazi. */
const SMER: Readonly<Record<string, SmerPrelaza>> = { l: 'DESNO', r: 'LEVO', u: 'DOLE', d: 'GORE' };
const NISU_EFEKAT: ReadonlySet<string> = new Set(['sndAc', 'extLst']);
/** Ime nepoznatog efekta dolazi iz fajla: u poruci najviše ovoliko znakova. */
const IME_EFEKTA = 40;

function poznatiZahtevi(choice: Element): boolean {
  const prefiksi = (choice.getAttribute('Requires') ?? '').trim().split(/\s+/).filter((p) => p !== '');
  return prefiksi.length > 0 && prefiksi.every((p) => choice.lookupNamespaceURI(p) === NS.p14);
}

/** `p:transition`: neposredno dete slajda, ili iz `mc:AlternateContent` (`mc:Choice` sa p14, inače `mc:Fallback`). */
export function elementPrelaza(koren: Element): Element | null {
  const direktan = dete(koren, NS.p, 'transition');
  if (direktan) return direktan;
  for (const ac of deca(koren, NS.mc, 'AlternateContent')) {
    for (const ch of deca(ac, NS.mc, 'Choice')) {
      const t = dete(ch, NS.p, 'transition');
      if (t && poznatiZahtevi(ch)) return t;
    }
    const fb = dete(ac, NS.mc, 'Fallback');
    const t = fb ? dete(fb, NS.p, 'transition') : null;
    if (t) return t;
  }
  return null;
}

/** `p14:dur` u ms (prazan ili nebrojčan -> `null`, pa važi `spd`). */
function trajanjeP14(t: Element): number | null {
  const v = (t.getAttributeNS(NS.p14, 'dur') ?? '').trim();
  const n = v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

const kratko = (ime: string) => (ime.length > IME_EFEKTA ? `${ime.slice(0, IME_EFEKTA - 1)}…` : ime);

export function prelazSlajda(koren: Element): IshodPrelaza {
  const t = elementPrelaza(koren);
  if (!t) return { prelaz: null, upozorenja: [] };
  const upozorenja: string[] = [];
  if (t.hasAttribute('advTm') || ['0', 'false'].includes(t.getAttribute('advClick') ?? '')) {
    upozorenja.push('Automatsko prelaženje posle vremena se ne prenosi (slajd ide na klik).');
  }
  if (dete(t, NS.p, 'sndAc')) upozorenja.push('Zvuk prelaza se ne prenosi.');
  const osnova = trajanjeP14(t) ?? BRZINA[t.getAttribute('spd') ?? 'fast'] ?? 500;
  const trajanjeMs = Math.round(Math.min(5000, Math.max(100, osnova)));
  const efekat = Array.from(t.children).find((c) => !NISU_EFEKAT.has(c.localName));
  const ime = efekat?.namespaceURI === NS.p ? efekat.localName : null;
  if (!efekat || ime === 'cut') return { prelaz: null, upozorenja };
  const smer = SMER[efekat.getAttribute('dir') ?? 'l'] ?? 'DESNO';
  switch (ime) {
    case 'fade': return { prelaz: { efekat: 'FADE', smer: null, trajanjeMs }, upozorenja };
    case 'push': return { prelaz: { efekat: 'GURANJE', smer, trajanjeMs }, upozorenja };
    case 'wipe': return { prelaz: { efekat: 'BRISANJE', smer, trajanjeMs }, upozorenja };
    default:
      return {
        prelaz: { efekat: 'FADE', smer: null, trajanjeMs },
        upozorenja: [...upozorenja, `Prelaz '${kratko(efekat.localName)}' je zamenjen postepenim.`],
      };
  }
}

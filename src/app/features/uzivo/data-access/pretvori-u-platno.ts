// "Pretvori u platno" (spec 3, faza 5; plan faze 5 odluke 20-21): INFO slajd (naslov, Markdown, slika, postepeno) ->
// dokument PLATNO slajda. Čista funkcija nad `marked` lekserom i fabrikama faze 4; stranica je učitava dinamički.
// Markdown se čita kao u prikazu INFO-a (`renderMarkdown`): `$` se ne tumači (INFO nema formule, odluka 2), sirov HTML
// se izbacuje, a stavke liste najvišeg nivoa (ne one u citatu) su koraci, pa je broj koraka isti kao kod INFO slajda.
import { Marked, type Token, type Tokens } from 'marked';
import { TEME } from '../ui/teme';
import type { Animacija, Deo, Lista, Pasus, Platno, SlikaSloj, Sloj, Tema } from './platno.models';
import { deoTeme, noviTekst, pasusSa, ZNAK_LISTE } from './platno-novo';
import { zaokruziKaoServer as z } from './platno-provera';

export type Gubitak = 'VEZE' | 'SLIKE_U_TEKSTU' | 'TABELE' | 'LINIJE' | 'CITATI' | 'DUGACAK_TEKST';
export const OPISI_GUBITAKA: Record<Gubitak, string> = {
  VEZE: 'Veze postaju običan tekst (adresa se ne prenosi).',
  SLIKE_U_TEKSTU: 'Slike unutar teksta se ne prenose (slika slajda ostaje).',
  TABELE: 'Tabele postaju redovi teksta odvojeni tabulatorom.',
  LINIJE: 'Horizontalne linije se ne prenose.',
  CITATI: 'Citati postaju uvučen kurziv.',
  DUGACAK_TEKST: 'Tekst je dugačak: slova su smanjena da stane na slajd; proveri izgled.',
};
export interface SlikaZaPretvaranje { id: string; naziv: string; sirina: number; visina: number; }
export interface UlazPretvaranja { naslov: string | null; sadrzaj: string | null; slika: SlikaZaPretvaranje | null; postepeno: boolean; }
export interface RezultatPretvaranja { platno: Platno; gubici: Gubitak[]; }

const TELO = 28;
const PODNASLOVI = [36, 32, 30, 28, 28, 28];            // # .. ###### u tekstu (naslov slajda je 40)
const KOD = { font: 'Cousine', udeo: 22 / 28 };          // kod je relativan okolnom tekstu (telo 28 -> 22), kao `code` u INFO-u
const LEVO = 48;
const SIRINA = 864;
const DNO = 500;                                         // isto kao "Naslov i tekst" faze 4: telo 140..500
const KOLONA_SLIKE = { x: 592, sirina: 320 };
const SIRINA_UZ_SLIKU = 520;
/** Najveće uvlačenje koje pretvaranje upisuje (lista nivoa 8 = 306, plus citati; server prima do 1000). */
const MAX_UVLACENJA = 450;
const NASLOV = { sirina: 864, visina: 92, velicina: 40 };
const lekser = new Marked({ gfm: true, breaks: true });

interface Stil { podebljano: boolean; kurziv: boolean; precrtano: boolean; kod: boolean; }
const OBICAN: Stil = { podebljano: false, kurziv: false, precrtano: false, kod: false };
/** `citat` = dubina citata u kojoj je blok (lista u citatu nije korak: INFO otkriva samo `:scope > ul > li`). */
interface Stanje { tema: Tema; pasusi: Pasus[]; stavke: number[][]; gubici: Set<Gubitak>; citat: number; }

/**
 * Tekst kao u prikazu INFO-a. Lekser `marked`-a sam dekodira brojčane entitete (`&#169;` -> ©, `&#0;` -> U+FFFD), a
 * imenovane ostavlja, pa ih pregledač dekodira (`&amp;` -> `&`); ovde se dekodiraju osnovni imenovani (ostali, npr.
 * `&eacute;`, ostaju doslovno) i, za tekst bez tokena, brojčani. Prikaz INFO-a skuplja bele znake (`white-space: normal`),
 * pa tab, novi red, CR i FF u tekstu (samo iz entiteta: prelom reda je `br` token) postaju razmak, a ne tab ili prelom
 * platna. Samo u običnom tekstu: kod u redu (`` `&amp;` ``) i `\&` prikaz ostavlja doslovno.
 */
const ENTITETI: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0' };
const znakEntiteta = (k: number) =>
  (k === 0 || k > 0x10ffff || (k >= 0xd800 && k <= 0xdfff) ? '\uFFFD' : String.fromCodePoint(k));
const tekstKaoInfo = (s: string) => s
  .replace(/&(?:#(\d+)|#[xX]([0-9A-Fa-f]+)|(amp|lt|gt|quot|apos|nbsp));/g,
    (_e, dec?: string, hex?: string, ime?: string) => (ime ? ENTITETI[ime] : znakEntiteta(dec ? Number(dec) : parseInt(hex!, 16))))
  .replace(/[\t\n\r\f]/g, ' ');

function deo(st: Stanje, tekst: string, stil: Stil, velicina: number, naslov: boolean): Deo {
  const d = deoTeme(st.tema, naslov ? 'naslov' : 'telo', stil.kod ? z(velicina * KOD.udeo) : velicina, tekst);
  return { ...d, font: stil.kod ? KOD.font : d.font, podebljano: stil.podebljano || naslov, kurziv: stil.kurziv, precrtano: stil.precrtano };
}

/** Susedni delovi istog izgleda se spajaju (isti prikaz, manje delova). */
function spoji(delovi: Deo[]): Deo[] {
  const r: Deo[] = [];
  for (const d of delovi) {
    const p = r[r.length - 1];
    const isto = p && p.font === d.font && p.velicina === d.velicina && p.boja === d.boja && p.podebljano === d.podebljano
      && p.kurziv === d.kurziv && p.precrtano === d.precrtano && p.podvuceno === d.podvuceno && p.polozaj === d.polozaj;
    if (isto) r[r.length - 1] = { ...p, tekst: p.tekst + d.tekst };
    else r.push(d);
  }
  return r;
}

function uRedu(tokeni: Token[] | undefined, stil: Stil, st: Stanje, velicina: number, naslov: boolean): Deo[] {
  const r: Deo[] = [];
  for (const t of tokeni ?? []) {
    switch (t.type) {
      case 'strong': r.push(...uRedu(t.tokens, { ...stil, podebljano: true }, st, velicina, naslov)); break;
      case 'em': r.push(...uRedu(t.tokens, { ...stil, kurziv: true }, st, velicina, naslov)); break;
      case 'del': r.push(...uRedu(t.tokens, { ...stil, precrtano: true }, st, velicina, naslov)); break;
      case 'codespan': r.push(deo(st, t.text, { ...stil, kod: true }, velicina, naslov)); break;
      case 'link': st.gubici.add('VEZE'); r.push(...uRedu(t.tokens, stil, st, velicina, naslov)); break;
      case 'image': st.gubici.add('SLIKE_U_TEKSTU'); break;
      case 'br': r.push(deo(st, '\n', stil, velicina, naslov)); break;
      case 'html': break; // kao `renderMarkdown`: sirov HTML se izbacuje
      case 'escape': r.push(deo(st, t.text, stil, velicina, naslov)); break;
      default:
        if ('tokens' in t && t.tokens?.length) r.push(...uRedu(t.tokens, stil, st, velicina, naslov));
        else if ('text' in t) r.push(deo(st, tekstKaoInfo(String(t.text)), stil, velicina, naslov));
    }
  }
  return r;
}

function pasus(st: Stanje, delovi: Deo[], izmene: Partial<Omit<Pasus, 'delovi'>>): Pasus {
  const spojeni = spoji(delovi);
  const prazan = deo(st, '', OBICAN, TELO, false);
  return { ...pasusSa(spojeni[0] ?? prazan, izmene), delovi: spojeni.length ? spojeni : [prazan] };
}

function dodaj(st: Stanje, p: Pasus, koraci: number[] | null): void {
  st.pasusi.push(p);
  koraci?.push(st.pasusi.length - 1);
}

/** Blok; `nivo` > 0 je nastavak stavke liste (bez oznake, poravnat sa tekstom stavke, nivo dublje). */
function blok(t: Token, st: Stanje, nivo: number, koraci: number[] | null): void {
  const uvuceno = nivo > 0 ? { nivo: Math.min(8, nivo), uvlacenje: { levo: 18 + 36 * Math.min(8, nivo - 1), prviRed: 0 } } : {};
  switch (t.type) {
    case 'heading': {
      const v = PODNASLOVI[(t as Tokens.Heading).depth - 1] ?? TELO;
      dodaj(st, pasus(st, uRedu(t.tokens, OBICAN, st, v, true), { razmakPre: 12, razmakPosle: 6, ...uvuceno }), koraci);
      break;
    }
    case 'paragraph':
    case 'text':
      dodaj(st, pasus(st, 'tokens' in t && t.tokens ? uRedu(t.tokens, OBICAN, st, TELO, false)
        : [deo(st, tekstKaoInfo(t.text), OBICAN, TELO, false)], { razmakPosle: 6, ...uvuceno }), koraci);
      break;
    case 'list':
      lista(t as Tokens.List, st, nivo, koraci);
      break;
    case 'code':
      dodaj(st, pasus(st, [deo(st, t.text, { ...OBICAN, kod: true }, TELO, false)], { razmakPosle: 6, ...uvuceno }), koraci);
      break;
    case 'blockquote': {
      st.gubici.add('CITATI');
      const od = st.pasusi.length;
      st.citat++;
      for (const c of t.tokens ?? []) blok(c, st, nivo, koraci);
      st.citat--;
      for (let i = od; i < st.pasusi.length; i++) {
        const p = st.pasusi[i];
        st.pasusi[i] = { ...p, uvlacenje: { ...p.uvlacenje, levo: Math.min(MAX_UVLACENJA, p.uvlacenje.levo + 36) }, delovi: p.delovi.map((d) => ({ ...d, kurziv: true })) };
      }
      break;
    }
    case 'table': {
      st.gubici.add('TABELE');
      const tb = t as Tokens.Table;
      // tabulator u stilu reda, pa se zaglavlje spaja u jedan podebljan deo
      const red = (celije: Tokens.TableCell[], zaglavlje: boolean) => celije.flatMap((c, i) => [
        ...(i > 0 ? [deo(st, '\t', { ...OBICAN, podebljano: zaglavlje }, TELO, false)] : []),
        ...uRedu(c.tokens, { ...OBICAN, podebljano: zaglavlje }, st, TELO, false),
      ]);
      dodaj(st, pasus(st, red(tb.header, true), { ...uvuceno }), koraci);
      for (const r of tb.rows) dodaj(st, pasus(st, red(r, false), { ...uvuceno }), koraci);
      break;
    }
    case 'hr':
      st.gubici.add('LINIJE');
      break;
    default:
      break; // space, html, def, checkbox
  }
}

/**
 * Lista: prvi pasus stavke nosi oznaku (ZNAK `•` ili BROJ; sve stavke iste liste imaju isti `pocetak` = `start`, pa ih
 * `oznakeListe` broji redom), uvlačenje `18 + 36 * nivo`, prvi red -18 (odluka 18 faze 4). Nastavak stavke je nivo
 * dublje bez oznake, pa ne prekida numeraciju; kad stavka počinje drugim blokom (podnaslov, kod), oznaku nosi njegov
 * prvi pasus. Stavka liste najvišeg nivoa van citata je jedan korak (`postepeno`, odluka 20); prazna stavka dobija prazan
 * pasus, da broj koraka ostane isti kao kod INFO slajda.
 */
function lista(t: Tokens.List, st: Stanje, nivo: number, roditelj: number[] | null): void {
  const oznaka: Lista = t.ordered
    ? { vrsta: 'BROJ', znak: null, boja: null, format: 'ARAPSKI_TACKA', pocetak: typeof t.start === 'number' ? t.start : 1 }
    : { vrsta: 'ZNAK', znak: ZNAK_LISTE, boja: null, format: null, pocetak: null };
  const n = Math.min(8, nivo);
  const izmeneStavke = { nivo: n, lista: oznaka, uvlacenje: { levo: 18 + 36 * n, prviRed: -18 }, razmakPre: 10 };
  const koren = nivo === 0 && st.citat === 0;
  for (const stavka of t.items) {
    const koraci = koren ? [] as number[] : roditelj;
    const od = st.pasusi.length;
    let prvi = true;
    for (const c of stavka.tokens) {
      if (prvi && (c.type === 'text' || c.type === 'paragraph')) {
        dodaj(st, pasus(st, uRedu('tokens' in c ? c.tokens : undefined, OBICAN, st, TELO, false), izmeneStavke), koraci);
        prvi = false;
      } else if (c.type === 'list') {
        lista(c as Tokens.List, st, nivo + 1, koraci);
      } else {
        // prvi blok stavke koji nije tekst (podnaslov, kod, citat, tabela) nosi oznaku stavke, kao u INFO-u
        const pre = st.pasusi.length;
        blok(c, st, nivo + 1, koraci);
        if (prvi && st.pasusi.length > pre) {
          st.pasusi[pre] = { ...st.pasusi[pre], ...izmeneStavke };
          prvi = false;
        }
      }
    }
    if (st.pasusi.length === od) dodaj(st, pasus(st, [], izmeneStavke), koraci);
    if (koren && koraci && koraci.length > 0) st.stavke.push(koraci);
  }
}

/** Prosečna širina znaka (em): Cousine (kod) je jednako širok i širi od proporcionalnih fontova. */
const sirinaZnaka = (font: string) => (font === KOD.font ? 0.6 : 0.5);
/** Tab: podrazumevani tab-stop platna (36 pt, `platno-tabovi`); ne zavisi od veličine slova. */
const TAB = 36;

/** Pasus izmeren pri skali 1: redovi (između `\n`) kao širina slova (pt) i broj tabova, razmaci se ne skaliraju. */
interface MeraPasusa { razmak: number; velicina: number; dostupno: number; redovi: { slova: number; tabova: number }[]; }

function meraPasusa(p: Pasus, sirina: number): MeraPasusa {
  const redovi = [{ slova: 0, tabova: 0 }];
  for (const d of p.delovi) {
    const znak = sirinaZnaka(d.font) * d.velicina;
    for (const c of d.tekst) {
      const red = redovi[redovi.length - 1];
      if (c === '\n') redovi.push({ slova: 0, tabova: 0 });
      else if (c === '\t') red.tabova++;
      else red.slova += znak;
    }
  }
  return {
    razmak: p.razmakPre + p.razmakPosle, velicina: Math.max(1, ...p.delovi.map((d) => d.velicina)),
    dostupno: Math.max(1, sirina - p.uvlacenje.levo), redovi,
  };
}

/**
 * Visina pri skali `s` onako kako je prikaz primenjuje (`stilDela`: množi se samo veličina slova; širina okvira,
 * uvlačenje, razmaci i tab ostaju), pa pri manjim slovima u red staje više znakova: visina pada približno sa s².
 */
function visinaPri(mere: readonly MeraPasusa[], s: number): number {
  let h = 0;
  for (const m of mere) {
    const redova = m.redovi.reduce((n, r) => n + Math.max(1, Math.ceil((r.slova * s + r.tabova * TAB) / m.dostupno)), 0);
    h += m.razmak + redova * m.velicina * s * 1.2;
  }
  return h;
}

/** Gruba procena visine (pt): prosečna širina znaka 0,5 em (Cousine 0,6), tab 36 pt, prored 1,2, plus razmaci pasusa. */
export function procenaVisine(pasusi: readonly Pasus[], sirina: number): number {
  return visinaPri(pasusi.map((p) => meraPasusa(p, sirina)), 1);
}

/** `okvir.skala`: najveća iz 1, 0,95, ..., 0,25 pri kojoj procenjen tekst (`visinaPri`) staje u okvir; inače 0,25. */
export function skalaTeksta(pasusi: readonly Pasus[], sirina: number, visina: number): number {
  const mere = pasusi.map((p) => meraPasusa(p, sirina));
  for (let k = 20; k > 5; k--) if (visinaPri(mere, k / 20) <= visina) return k / 20;
  return 0.25;
}

function slikaUKutiji(id: string, sl: SlikaZaPretvaranje, k: { x: number; y: number; sirina: number; visina: number }): SlikaSloj {
  const f = Math.min(k.sirina / Math.max(1, sl.sirina), k.visina / Math.max(1, sl.visina));
  const sirina = z(Math.max(1, sl.sirina * f));
  const visina = z(Math.max(1, sl.visina * f));
  return {
    id, tip: 'SLIKA', naziv: [...sl.naziv].slice(0, 60).join('') || null,
    x: z(k.x + (k.sirina - sirina) / 2), y: z(k.y + (k.visina - visina) / 2), sirina, visina,
    rotacija: 0, providnost: 1, zakljucan: false, senka: null, medijId: sl.id, isecak: { levo: 0, gore: 0, desno: 0, dole: 0 },
  };
}

function animacijeStavki(slojId: string, stavke: readonly number[][]): Animacija[] {
  const a: Animacija[] = [];
  for (const koraci of stavke) {
    koraci.forEach((pasusIndeks, i) => a.push({
      id: `a${a.length + 1}`, slojId, pasus: pasusIndeks, vrsta: 'ULAZ', efekat: 'FADE', smer: null,
      okidac: i === 0 ? 'KLIK' : 'SA_PRETHODNIM', trajanjeMs: 500, kasnjenjeMs: 0,
    }));
  }
  return a;
}

/**
 * INFO -> PLATNO (odluka 20): naslov `s1` (48, 28, 864 x 92, 40 pt, font i boja naslova teme), telo `s2` (od y 140, ili
 * 28 bez naslova, do 500; širina 864, ili 520 uz sliku), oba sa `okvir.skala` po `skalaTeksta`; slika `s3` (desna kolona
 * 592..912 uz tekst, inače ceo prostor tela; contain), pozadina teme, `postepeno` -> KLIK FADE po stavci liste najvišeg
 * nivoa.
 */
export function infoUPlatno(u: UlazPretvaranja, tema: Tema): RezultatPretvaranja {
  const st: Stanje = { tema, pasusi: [], stavke: [], gubici: new Set(), citat: 0 };
  for (const t of lekser.lexer(u.sadrzaj ?? '')) blok(t, st, 0, null);
  const naslov = u.naslov?.trim() ?? '';
  const gore = naslov ? 140 : 28;
  const visina = DNO - gore;
  const slojevi: Sloj[] = [];
  if (naslov) {
    // naslov (server: do 300 znakova) po istom pravilu skale kao telo, da se ne preliva u telo
    const s1 = noviTekst('s1', tema, { x: LEVO, y: 28, sirina: NASLOV.sirina, visina: NASLOV.visina }, 'naslov', NASLOV.velicina);
    const pasusi = [pasusSa(deoTeme(tema, 'naslov', NASLOV.velicina, naslov))];
    const o = s1.okvir;
    const skala = skalaTeksta(pasusi, NASLOV.sirina - o.unutraLevo - o.unutraDesno, NASLOV.visina - o.unutraGore - o.unutraDole);
    if (skala < 0.5) st.gubici.add('DUGACAK_TEKST');
    slojevi.push({ ...s1, pasusi, okvir: { ...o, skala } });
  }
  const imaTelo = st.pasusi.length > 0;
  if (imaTelo) {
    const sirina = u.slika ? SIRINA_UZ_SLIKU : SIRINA;
    const telo = noviTekst('s2', tema, { x: LEVO, y: gore, sirina, visina }, 'telo', TELO);
    const o = telo.okvir;
    const skala = skalaTeksta(st.pasusi, sirina - o.unutraLevo - o.unutraDesno, visina - o.unutraGore - o.unutraDole);
    if (skala < 0.5) st.gubici.add('DUGACAK_TEKST');
    slojevi.push({ ...telo, pasusi: st.pasusi, okvir: { ...o, skala } });
  }
  if (u.slika) {
    const k = imaTelo ? { x: KOLONA_SLIKE.x, y: gore, sirina: KOLONA_SLIKE.sirina, visina } : { x: LEVO, y: gore, sirina: SIRINA, visina };
    slojevi.push(slikaUKutiji('s3', u.slika, k));
  }
  const animacije = u.postepeno && imaTelo ? animacijeStavki('s2', st.stavke) : [];
  return {
    platno: { verzija: 1, pozadina: { boja: TEME[tema].pozadina, medijId: null }, slojevi, animacije },
    gubici: [...st.gubici],
  };
}

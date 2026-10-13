// Tabele PPTX-a (p:graphicFrame sa a:tbl) u TABELA slojeve platna: mreža, spajanje ćelija, stil tabele (tableStyles.xml
// ili ugrađeni Office stil), popuna, ivice i tekst ćelija. Čiste funkcije bez Angular-a (lokalna provera ih pokreće u Node-u).
import type { Celija, Ivica, IviceCelije, Sidro, TabelaSloj } from '../data-access/platno.models';
import { kutijaIzLanca, stiloviNivoa } from './nasledjivanje';
import { bojaPopune, elementPopune, ivicaIz, nazivOblika, rotacijaSloja, senkaIz, upozoriJednom } from './oblik';
import { ugradjeniStil } from './tabela-stilovi';
import { pretvoriTekst, type OpcijeTeksta } from './tekst';
import { bojaIz, pomesaj, type KontekstBoja } from './tema';
import { EMU_PO_PT, uSloj, zaokruzi, type KontekstSlajda, type Kutija } from './tipovi';
import { brojAtr, deca, dete, NS } from './xml';

export { UGRADJENI_STILOVI } from './tabela-stilovi';

export interface CelijaSaSlikom { red: number; kolona: number; kutija: Kutija; tcPr: Element; }
export interface RezultatTabele { tabela: TabelaSloj; celijeSaSlikom: CelijaSaSlikom[]; }

/** Granice iz `PlatnoPP` (server odbija dokument van njih). */
const MAX_TABELA = 30;
const MAX_VELICINA = 2880;
/** Najmanja kolona/red posle zaokruživanja na 2 decimale (server traži > 0). */
const MIN_VELICINA = 0.01;

const SIDRA: Readonly<Record<string, Sidro>> = { t: 'VRH', ctr: 'SREDINA', b: 'DNO' };
/** Podrazumevane unutrašnje margine ćelije (EMU), iste kao padding ćelije u prikazu platna. */
const MARGINE: Readonly<Record<string, number>> = { marL: 91440, marR: 91440, marT: 45720, marB: 45720 };
const LINIJE_CELIJE: readonly [keyof IviceCelije, string][] = [['levo', 'lnL'], ['desno', 'lnR'], ['gore', 'lnT'], ['dole', 'lnB']];

const daLi = (v: string | null | undefined) => v === '1' || v === 'true' || v === 'on';
const ogranici = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
const bezIvica = (): IviceCelije => ({ gore: null, dole: null, levo: null, desno: null });

/** Zastavice uslovnog formatiranja iz `a:tblPr`. */
interface Zastavice { firstRow: boolean; lastRow: boolean; firstCol: boolean; lastCol: boolean; bandRow: boolean; bandCol: boolean; }

/** Oblast dela stila (redovi `r0..r1`, kolone `k0..k1`): spoljne ivice oblasti su `left/right/top/bottom`, ostale `inside*`. */
interface Oblast { r0: number; r1: number; k0: number; k1: number; }

/** Izgled ćelije sastavljen iz delova stila (slabiji prvi), pre `a:tcPr`. */
interface Izgled { popuna: string | null; ivice: IviceCelije; boja?: string; font?: string; podebljano?: boolean; }

const kb = (ctx: KontekstSlajda): KontekstBoja => ({ tema: ctx.tema, mapaBoja: ctx.mapaBoja });

/**
 * Stil tabele: `a:tblPr/a:tableStyle` (ugrađen u tabelu), pa `a:tableStyleId` (bez njega `def` iz `tableStyles.xml`) ->
 * definicija iz `tableStyles.xml`, pa `UGRADJENI_STILOVI`. Navedeni stil koji se ne nalazi -> `null` + `STIL_TABELE`.
 */
function stilTabele(tblPr: Element | null, ctx: KontekstSlajda): Element | null {
  const ugradjen = tblPr && dete(tblPr, NS.a, 'tableStyle');
  if (ugradjen) return ugradjen;
  const lista = ctx.tabelaStilova?.documentElement ?? null;
  const naveden = (tblPr && dete(tblPr, NS.a, 'tableStyleId'))?.textContent?.trim() ?? '';
  const id = naveden !== '' ? naveden : lista?.getAttribute('def')?.trim() ?? '';
  if (id === '') return null;
  const kljuc = id.toUpperCase();
  const izFajla = lista && lista.namespaceURI === NS.a
    ? deca(lista, NS.a, 'tblStyle').find((s) => s.getAttribute('styleId')?.trim().toUpperCase() === kljuc)
    : undefined;
  const stil = izFajla ?? ugradjeniStil(id);
  if (!stil && naveden !== '') {
    upozoriJednom(ctx, 'STIL_TABELE', `Stil tabele ${id} nije pronađen; tabela je uvezena bez popune i ivica iz stila.`);
  }
  return stil;
}

/** Boja popune elementa koji sadrži popunu (`a:fill`, `a:tcPr`, `a:tblPr`) ili `a:fillRef`; `undefined` = ne kaže ništa. */
function popunaDela(roditelj: Element, ctx: KontekstSlajda, gde: string): string | null | undefined {
  const f = elementPopune(roditelj);
  if (f) {
    if (f.localName === 'noFill') return null;
    if (f.localName === 'grpFill') return undefined;
    const b = bojaPopune(f, ctx, gde);
    return b ? pomesaj(b, ctx.pozadina) : null;
  }
  return undefined;
}

/** Popuna `a:tcStyle`/`a:tblBg` stila: `a:fill` ili `a:fillRef` (`idx="0"` = bez popune). */
function popunaStila(el: Element, ctx: KontekstSlajda): string | null | undefined {
  const fill = dete(el, NS.a, 'fill');
  if (fill) return popunaDela(fill, ctx, 'u stilu tabele');
  const ref = dete(el, NS.a, 'fillRef');
  if (!ref) return undefined;
  const b = brojAtr(ref, 'idx', 0) > 0 ? bojaIz(ref, kb(ctx)) : null;
  return b ? pomesaj(b, ctx.pozadina) : null;
}

/** Jedan deo stila (`wholeTbl`, `band1H`, `firstRow`, ...) preko izgleda ćelije `c` (redovi `r..r2`, kolone `k..k2`). */
function primeniDeo(deo: Element | null, iz: Izgled, o: Oblast, c: { r: number; r2: number; k: number; k2: number }, ctx: KontekstSlajda): void {
  if (!deo) return;
  const tx = dete(deo, NS.a, 'tcTxStyle');
  if (tx) {
    const b = tx.getAttribute('b');
    if (b === 'on' || b === 'off') iz.podebljano = b === 'on';
    const fontRef = dete(tx, NS.a, 'fontRef');
    const boja = bojaIz(tx, kb(ctx)) ?? bojaIz(fontRef, kb(ctx));
    if (boja) iz.boja = pomesaj(boja, ctx.pozadina);
    const idx = fontRef?.getAttribute('idx');
    if (idx === 'minor' || idx === 'major') iz.font = idx === 'minor' ? '+mn-lt' : '+mj-lt';
    const fontEl = dete(tx, NS.a, 'font');
    const latin = (fontEl && dete(fontEl, NS.a, 'latin'))?.getAttribute('typeface')?.trim();
    if (latin) iz.font = latin;
  }
  const st = dete(deo, NS.a, 'tcStyle');
  if (!st) return;
  const bdr = dete(st, NS.a, 'tcBdr');
  if (bdr) {
    const strane: [keyof IviceCelije, string][] = [
      ['gore', c.r <= o.r0 ? 'top' : 'insideH'],
      ['dole', c.r2 >= o.r1 ? 'bottom' : 'insideH'],
      ['levo', c.k <= o.k0 ? 'left' : 'insideV'],
      ['desno', c.k2 >= o.k1 ? 'right' : 'insideV'],
    ];
    for (const [strana, ime] of strane) {
      const el = dete(bdr, NS.a, ime);
      if (el) iz.ivice[strana] = ivicaIz(dete(el, NS.a, 'ln'), ctx, el);
    }
  }
  const p = popunaStila(st, ctx);
  if (p !== undefined) iz.popuna = p;
}

/**
 * Delovi stila za ćeliju, slabiji prvi: `wholeTbl`; trake kolona (`k' = k - firstCol`, ne poslednja kolona uz
 * `lastCol`) i redova (isto); `firstCol`/`lastCol`; `firstRow`/`lastRow`; uglovi (`nwCell`, ...) kad su uključene obe
 * zastavice. Spojena ćelija se računa po svom prvom redu/koloni, a "poslednja" po poslednjem koji pokriva.
 */
function deloviStila(z: Zastavice, R: number, C: number, c: { r: number; r2: number; k: number; k2: number }): [string, Oblast][] {
  const cela: Oblast = { r0: 0, r1: R - 1, k0: 0, k1: C - 1 };
  const kolona = (k: number): Oblast => ({ r0: 0, r1: R - 1, k0: k, k1: k });
  const red = (r: number): Oblast => ({ r0: r, r1: r, k0: 0, k1: C - 1 });
  const prviRed = z.firstRow && c.r === 0;
  const poslednjiRed = z.lastRow && c.r2 === R - 1;
  const prvaKol = z.firstCol && c.k === 0;
  const poslednjaKol = z.lastCol && c.k2 === C - 1;
  const d: [string, Oblast][] = [['wholeTbl', cela]];
  const kp = c.k - (z.firstCol ? 1 : 0);
  if (z.bandCol && kp >= 0 && !poslednjaKol) d.push([kp % 2 === 0 ? 'band1V' : 'band2V', kolona(c.k)]);
  const rp = c.r - (z.firstRow ? 1 : 0);
  if (z.bandRow && rp >= 0 && !poslednjiRed) d.push([rp % 2 === 0 ? 'band1H' : 'band2H', red(c.r)]);
  if (prvaKol) d.push(['firstCol', kolona(0)]);
  if (poslednjaKol) d.push(['lastCol', kolona(C - 1)]);
  if (prviRed) d.push(['firstRow', red(0)]);
  if (poslednjiRed) d.push(['lastRow', red(R - 1)]);
  const ugao = (ime: string, r: number, k: number): [string, Oblast] => [ime, { r0: r, r1: r, k0: k, k1: k }];
  if (prviRed && prvaKol) d.push(ugao('nwCell', 0, 0));
  if (prviRed && poslednjaKol) d.push(ugao('neCell', 0, C - 1));
  if (poslednjiRed && prvaKol) d.push(ugao('swCell', R - 1, 0));
  if (poslednjiRed && poslednjaKol) d.push(ugao('seCell', R - 1, C - 1));
  return d;
}

/** Ivica iz `a:lnL`/`lnR`/`lnT`/`lnB` ćelije: prepisuje ivicu stila; linija bez popune ne menja ivicu stila. */
function ivicaCelije(ln: Element, izStila: Ivica | null, ctx: KontekstSlajda): Ivica | null {
  return elementPopune(ln) ? ivicaIz(ln, ctx) : izStila;
}

const pokrivena = (): Celija => ({
  pasusi: [], popuna: null, ivice: bezIvica(), spojDesno: 0, spojDole: 0, pokrivena: true, sidro: 'VRH',
});

const zbir = (niz: readonly number[], od: number, doUkljucivo: number) => {
  let s = 0;
  for (let i = od; i <= doUkljucivo; i++) s += niz[i];
  return s;
};

/**
 * `p:graphicFrame` sa `a:tbl` -> TABELA sloj `id` u kutiji `k` (EMU, posle transformacije grupe; razmera grupe se dobija
 * iz odnosa `k` i sopstvenog `p:xfrm`). Kolone/redovi = `gridCol@w`/`tr@h`, širina i visina sloja su njihovi zbirovi.
 * Spajanje: `gridSpan`/`rowSpan` daju `spojDesno`/`spojDole` (sečeni na ivici tabele i na već pokrivenim ćelijama, pa
 * su oblasti uvek pravougaone i bez preklapanja), ćelije u oblasti su `pokrivena`; `hMerge`/`vMerge` van oblasti nekog
 * spajanja ostaju vidljive. Ćelije sa `tcPr/blipFill` (formula u ćeliji, F9) idu u `celijeSaSlikom`. Bez `a:tbl` ili
 * bez kolona/redova -> `null`; više od 30 redova ili kolona -> `null` + `GRANICA`.
 */
export function pretvoriTabelu(gf: Element, k: Kutija, ctx: KontekstSlajda, id: string): RezultatTabele | null {
  const graphic = dete(gf, NS.a, 'graphic');
  const data = graphic && dete(graphic, NS.a, 'graphicData');
  const tbl = data && dete(data, NS.a, 'tbl');
  if (!tbl) return null;
  const grid = dete(tbl, NS.a, 'tblGrid');
  const sirineEmu = grid ? deca(grid, NS.a, 'gridCol').map((g) => Math.max(0, brojAtr(g, 'w', 0))) : [];
  const trs = deca(tbl, NS.a, 'tr');
  const C = sirineEmu.length;
  const R = trs.length;
  if (C === 0 || R === 0) {
    ctx.upozori('OBJEKAT_PRESKOCEN', 'Tabela bez redova ili kolona nije uvezena.');
    return null;
  }
  if (C > MAX_TABELA || R > MAX_TABELA) {
    ctx.upozori('GRANICA', 'Tabela veća od 30 x 30 nije uvezena.');
    return null;
  }

  // Razmera grupe: kutija posle grupe prema sopstvenom p:xfrm okvira (van grupe 1).
  const sopstvena = kutijaIzLanca([gf]);
  const fx = sopstvena && sopstvena.w > 0 ? k.w / sopstvena.w : 1;
  const fy = sopstvena && sopstvena.h > 0 ? k.h / sopstvena.h : 1;
  const kolEmu = sirineEmu.map((w) => w * fx);
  const redEmu = trs.map((tr) => Math.max(0, brojAtr(tr, 'h', 0)) * fy);
  const s = ctx.t.s;
  const uJed = (emu: number) => ogranici(zaokruzi(emu / EMU_PO_PT * s), MIN_VELICINA, MAX_VELICINA);
  const kolone = kolEmu.map(uJed);
  const redovi = redEmu.map(uJed);

  const tblPr = dete(tbl, NS.a, 'tblPr');
  const z: Zastavice = {
    firstRow: daLi(tblPr?.getAttribute('firstRow')), lastRow: daLi(tblPr?.getAttribute('lastRow')),
    firstCol: daLi(tblPr?.getAttribute('firstCol')), lastCol: daLi(tblPr?.getAttribute('lastCol')),
    bandRow: daLi(tblPr?.getAttribute('bandRow')), bandCol: daLi(tblPr?.getAttribute('bandCol')),
  };
  const stil = stilTabele(tblPr, ctx);
  const tblBg = stil && dete(stil, NS.a, 'tblBg');
  const pozadinaTabele = (tblPr ? popunaDela(tblPr, ctx, 'u popuni tabele') : undefined)
    ?? (tblBg ? popunaStila(tblBg, ctx) : undefined) ?? null;

  const zauzeto = Array.from({ length: R }, () => new Array<boolean>(C).fill(false));
  const celije: Celija[][] = [];
  const celijeSaSlikom: CelijaSaSlikom[] = [];
  let margineRazlicite = false;

  for (let r = 0; r < R; r++) {
    const tcs = deca(trs[r], NS.a, 'tc');
    const red: Celija[] = [];
    for (let kol = 0; kol < C; kol++) {
      if (zauzeto[r][kol]) {
        red.push(pokrivena());
        continue;
      }
      const tc = tcs[kol] ?? null;
      const spojena = daLi(tc?.getAttribute('hMerge')) || daLi(tc?.getAttribute('vMerge'));
      const raspon = (ime: string) => (tc && !spojena ? Math.max(1, Math.trunc(brojAtr(tc, ime, 1))) : 1);
      let w = 1;
      while (w < raspon('gridSpan') && kol + w < C && !zauzeto[r][kol + w]) w++;
      let h = 1;
      while (h < raspon('rowSpan') && r + h < R && !zauzeto[r + h].slice(kol, kol + w).some(Boolean)) h++;
      for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) zauzeto[r + i][kol + j] = true;
      const c = { r, r2: r + h - 1, k: kol, k2: kol + w - 1 };

      const iz: Izgled = { popuna: null, ivice: bezIvica() };
      if (stil) {
        for (const [ime, oblast] of deloviStila(z, R, C, c)) primeniDeo(dete(stil, NS.a, ime), iz, oblast, c, ctx);
      }

      const tcPr = tc && dete(tc, NS.a, 'tcPr');
      const blip = tcPr && dete(tcPr, NS.a, 'blipFill');
      let popuna = iz.popuna;
      if (tcPr) {
        for (const [strana, ime] of LINIJE_CELIJE) {
          const ln = dete(tcPr, NS.a, ime);
          if (ln) iz.ivice[strana] = ivicaCelije(ln, iz.ivice[strana], ctx);
        }
        if (!blip) {
          const p = popunaDela(tcPr, ctx, 'u popuni ćelije tabele');
          if (p !== undefined) popuna = p;
        }
        if (Object.keys(MARGINE).some((m) => tcPr.hasAttribute(m) && brojAtr(tcPr, m, MARGINE[m]) !== MARGINE[m])) {
          margineRazlicite = true;
        }
        const vert = tcPr.getAttribute('vert');
        if (vert && vert !== 'horz') upozoriJednom(ctx, 'TEKST_PRIBLIZAN', 'Uspravan tekst u ćeliji tabele je prikazan vodoravno.');
        if (['lnTlToBr', 'lnBlToTr'].some((ime) => { const ln = dete(tcPr, NS.a, ime); return !!ln && !!ivicaIz(ln, ctx); })) {
          upozoriJednom(ctx, 'OBLIK_PRIBLIZAN', 'Dijagonalne linije u ćelijama tabele nisu prenesene.');
        }
      }
      popuna ??= pozadinaTabele;

      if (blip && tcPr) {
        celijeSaSlikom.push({ red: r, kolona: kol, kutija: kutijaCelije(k, kolEmu, redEmu, c), tcPr });
      }
      const txBody = !blip && tc ? dete(tc, NS.a, 'txBody') : null;
      let pasusi: Celija['pasusi'] = [];
      if (txBody) {
        const o: OpcijeTeksta = {};
        if (iz.boja !== undefined) o.podrazumevanaBoja = iz.boja;
        if (iz.font !== undefined) o.fontIzStila = iz.font;
        if (iz.podebljano !== undefined) o.podebljanoIzStila = iz.podebljano;
        const rez = pretvoriTekst(txBody, (n) => stiloviNivoa([txBody], 'ostalo', ctx, n), [], ctx, zbir(kolone, c.k, c.k2), o);
        if (rez.senka !== null) upozoriJednom(ctx, 'SENKA', 'Senka teksta u ćelijama tabele nije prenesena.');
        pasusi = rez.pasusi;
      }
      red.push({
        pasusi, popuna: blip ? null : popuna, ivice: iz.ivice, spojDesno: w - 1, spojDole: h - 1, pokrivena: false,
        sidro: SIDRA[tcPr?.getAttribute('anchor') ?? 't'] ?? 'VRH',
      });
    }
    celije.push(red);
  }
  if (margineRazlicite) {
    upozoriJednom(ctx, 'TEKST_PRIBLIZAN', 'Unutrašnje margine ćelija tabele su prikazane podrazumevanim marginama.');
  }

  const polozaj = uSloj(k, ctx.t);
  return {
    tabela: {
      id, tip: 'TABELA', naziv: nazivOblika(gf), x: polozaj.x, y: polozaj.y,
      sirina: zaokruzi(zbir(kolone, 0, C - 1)), visina: zaokruzi(zbir(redovi, 0, R - 1)),
      rotacija: rotacijaSloja(polozaj.rotacija), providnost: 1, zakljucan: false, senka: senkaIz(tblPr, ctx),
      kolone, redovi, celije,
    },
    celijeSaSlikom,
  };
}

/**
 * Kutija ćelije (EMU): zbir kolona/redova pre nje i raspon spajanja, od ugla tabele. Rotirana tabela (rotacija grupe):
 * centar ćelije se okreće oko centra tabele, a kutija dobija rotaciju tabele.
 */
function kutijaCelije(k: Kutija, kolEmu: number[], redEmu: number[], c: { r: number; r2: number; k: number; k2: number }): Kutija {
  const w = zbir(kolEmu, c.k, c.k2);
  const h = zbir(redEmu, c.r, c.r2);
  let x = k.x + zbir(kolEmu, 0, c.k - 1);
  let y = k.y + zbir(redEmu, 0, c.r - 1);
  if (k.rot !== 0) {
    const sx = k.x + zbir(kolEmu, 0, kolEmu.length - 1) / 2;
    const sy = k.y + zbir(redEmu, 0, redEmu.length - 1) / 2;
    const ugao = k.rot * Math.PI / 180;
    const dx = x + w / 2 - sx;
    const dy = y + h / 2 - sy;
    x = sx + dx * Math.cos(ugao) - dy * Math.sin(ugao) - w / 2;
    y = sy + dx * Math.sin(ugao) + dy * Math.cos(ugao) - h / 2;
  }
  return { x, y, w, h, rot: k.rot };
}

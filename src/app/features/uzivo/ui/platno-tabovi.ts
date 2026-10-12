import type { Pasus, Sloj } from '../data-access/platno.models';

/**
 * Mereni tab-stopovi (kao u PowerPointu). CSS `tab-size` meri od ivice sadržaja `<p>` (posle `padding-left` =
 * `uvlacenje.levo`) i zna samo jednak interval, a PowerPoint meri od leve unutrašnje margine okvira (= leva ivica `<p>`)
 * i ima viseću stanicu i sopstvene stopove. Zato u pasusu sa uvlačenjem ili sopstvenim stopovima svaki `\t` postaje
 * `<span class="uz-pl-tab">` (inline-block, `tab-size: 0`, pa sam znak nema širinu), a ovde mu se posle crtanja izmeri
 * položaj i postavi širina do sledećeg stopa. Širina je u jedinicama (`var(--u)`), pa ostaje približno tačna i posle
 * promene veličine platna; komponenta ipak meri ponovo kad se veličina smiri, jer se širina teksta na malim veličinama
 * (hinting) ne skalira linearno (Chromium: isti pasus u pregledu editora od 480 px i na 1920 px, razlika do 6 jedinica).
 * Ostali pasusi zadržavaju `\t` sa `tab-size` od 36 pt (`platno.css`), što je isto merenje bez uvlačenja.
 * Ne-LEVO stopovi (CENTAR, DESNO, DECIMALNO) se prikazuju kao LEVO (uvoz ih prijavljuje kao `TABULATORI`).
 */

/** PowerPointov podrazumevani tab-stop (`defTabSz` 457200 EMU = 36 pt); za drugi interval uvoz upisuje stopove. */
export const PODRAZUMEVANI_TAB = 36;

/** Najviše prolaza merenja; prolaz se ponavlja samo dok se neka širina menja za više od `TOLERANCIJA`. */
const NAJVISE_PROLAZA = 3;
const TOLERANCIJA = 0.05;

function imaTab(p: Pasus): boolean {
  return p.delovi.some((d) => d.tekst.includes('\t'));
}

/** Pasus se meri kad ima tab, a tab ne pada tamo gde bi ga stavio `tab-size` (uvlačenje ili sopstveni stopovi). */
export function trebaMerenjeTabova(p: Pasus): boolean {
  return imaTab(p) && (p.uvlacenje.levo !== 0 || p.uvlacenje.prviRed !== 0 || p.tabulatori.length > 0);
}

/**
 * Širina taba koji počinje na `pozicija` (jedinice od leve ivice pasusa). Viseća stanica (uvlacenje.levo kad je
 * prviRed < 0) i sledeći sopstveni stop se takmiče; podrazumevani interval važi tek kad nijednog nema (kao
 * Word/PowerPoint: podrazumevani stopovi levo od sopstvenih ne postoje).
 */
export function sirinaTaba(pozicija: number, p: Pasus): number {
  const e = 0.01;
  const kandidati: number[] = [];
  if (p.uvlacenje.prviRed < 0 && pozicija + e < p.uvlacenje.levo) kandidati.push(p.uvlacenje.levo);
  const sopstveni = p.tabulatori.map((t) => t.poz).filter((x) => x > pozicija + e);
  if (sopstveni.length) kandidati.push(Math.min(...sopstveni));
  if (kandidati.length === 0) {
    kandidati.push(Math.floor((pozicija + e) / PODRAZUMEVANI_TAB) * PODRAZUMEVANI_TAB + PODRAZUMEVANI_TAB);
  }
  return Math.min(...kandidati) - pozicija;
}

function jedinice(n: number): string {
  return `calc(var(--u) * ${Math.round(n * 10000) / 10000})`;
}

/**
 * Da li između pasusa i platna (`.uz-pl-platno`, isključivo) nema transformacije: rotacija sloja ili ULET/ZUM koji
 * upravo traje (izračunat stil uključuje animaciju). Tada `getBoundingClientRect` daje tačan položaj (podpikselno), a
 * uniformno skaliranje iznad platna (npr. dijalog koji se otvara) se skraćuje jer je i px po jedinici prikazan.
 */
function bezTransformacije(pasusEl: HTMLElement): boolean {
  for (let e: Element | null = pasusEl; e && !e.classList.contains('uz-pl-platno'); e = e.parentElement) {
    const t = getComputedStyle(e).transform;
    if (t && t !== 'none') return false;
  }
  return true;
}

/**
 * Rezervno merenje (sloj sa transformacijom): levo od elementa do leve ivice pasusa u px iz rasporeda (`offsetLeft`),
 * koji transformacije ne vide, ali je zaokružen na ceo px. Mereni pasus je `position: relative` (`platno.css`), pa mu
 * je tab `offsetParent`; inače se oduzima lanac samog pasusa.
 */
function levoIzRasporeda(el: HTMLElement, pasusEl: HTMLElement): number {
  let x = 0;
  let e: Element | null = el;
  while (e instanceof HTMLElement && e !== pasusEl) {
    x += e.offsetLeft;
    e = e.offsetParent;
  }
  if (e === pasusEl) return x;
  for (let p: Element | null = pasusEl; p instanceof HTMLElement; p = p.offsetParent) x -= p.offsetLeft;
  return x;
}

function gore(el: HTMLElement, pasusEl: HTMLElement): number {
  let y = 0;
  for (let e: Element | null = el; e instanceof HTMLElement && e !== pasusEl; e = e.offsetParent) y += e.offsetTop;
  return y;
}

interface Stavka { tabovi: HTMLElement[]; sirine: number[]; pasusEl: HTMLElement; pasus: Pasus; precizno: boolean; }

/** Širina platna u jedinicama (`--u` = 1/960 širine `.uz-pl-platno`). */
const SIRINA_PLATNA = 960;

/**
 * px po jedinici u prikazanim (transformisanim) pikselima, za merenje kroz `getBoundingClientRect`: iz prikazane širine
 * platna (podpikselno; `offsetWidth` je zaokružen na ceo px, što na 300 jedinica daje grešku i do 0,3), a bez platna
 * (izdvojen pasus) iz odnosa prikazane i rasporedne širine pasusa.
 */
function prikazaniPx(pasusEl: HTMLElement, pxPoJedinici: number): number {
  const platno = pasusEl.closest<HTMLElement>('.uz-pl-platno');
  const sirina = platno?.getBoundingClientRect().width ?? 0;
  if (sirina > 0) return sirina / SIRINA_PLATNA;
  const okvir = pasusEl.getBoundingClientRect();
  return pasusEl.offsetWidth > 0 && okvir.width > 0 ? (pxPoJedinici * okvir.width) / pasusEl.offsetWidth : pxPoJedinici;
}

/** Položaji tabova u jedinicama od leve ivice pasusa (samo čitanja). */
function pozicije(s: Stavka, pxPoJedinici: number): number[] {
  if (!s.precizno) return s.tabovi.map((t) => levoIzRasporeda(t, s.pasusEl) / pxPoJedinici);
  const levo = s.pasusEl.getBoundingClientRect().left;
  const px = prikazaniPx(s.pasusEl, pxPoJedinici);
  return s.tabovi.map((t) => (t.getBoundingClientRect().left - levo) / px);
}

/**
 * Jedan prolaz za jedan pasus: čita položaje (bez pisanja između čitanja) i računa nove širine redom. Tab u istom redu
 * iza već promenjenog taba se pomera za razliku širina (pomak), pa jedan prolaz daje ceo red; novi red (tab čiji se
 * vertikalni opseg ne preklapa sa prethodnim) počinje bez pomaka. Prelom zbog nove širine ispravlja sledeći prolaz.
 */
function noveSirine(s: Stavka, pxPoJedinici: number): number[] {
  const nove: number[] = [];
  const x = pozicije(s, pxPoJedinici);
  let pomak = 0;
  let red: { gore: number; dole: number } | null = null;
  s.tabovi.forEach((t, k) => {
    const g = gore(t, s.pasusEl);
    const d = g + t.offsetHeight;
    if (!red || !(g < red.dole && d > red.gore)) pomak = 0;
    red = { gore: g, dole: d };
    const w = sirinaTaba(x[k] + pomak, s.pasus);
    pomak += w - s.sirine[k];
    nove.push(w);
  });
  return nove;
}

/**
 * Poravnava tabove više pasusa zajedno: sve širine na 0, pa prolazi (svaki: sva čitanja za sve pasuse, pa sva pisanja,
 * tj. jedan proračun rasporeda po prolazu) dok se nijedna širina ne promeni za više od 0,05 jedinice, najviše 3 puta.
 * Zove se samo iz faze crtanja koja sme da čita i piše (`afterRenderEffect` `mixedReadWrite`), nikad po kadru.
 */
export function poravnajSveTabove(pasusi: readonly { el: HTMLElement; pasus: Pasus }[], pxPoJedinici: number): void {
  if (!(pxPoJedinici > 0)) return;
  const stavke: Stavka[] = pasusi.map(({ el, pasus }) => {
    const tabovi = Array.from(el.querySelectorAll<HTMLElement>('.uz-pl-tab'));
    return { tabovi, sirine: tabovi.map(() => 0), pasusEl: el, pasus, precizno: tabovi.length > 0 && bezTransformacije(el) };
  });
  for (const s of stavke) for (const t of s.tabovi) t.style.width = '0px';
  for (let prolaz = 0; prolaz < NAJVISE_PROLAZA; prolaz++) {
    const nove = stavke.map((s) => noveSirine(s, pxPoJedinici));
    let promena = false;
    stavke.forEach((s, i) => s.tabovi.forEach((t, k) => {
      if (Math.abs(nove[i][k] - s.sirine[k]) > TOLERANCIJA) {
        promena = true;
        s.sirine[k] = nove[i][k];
        t.style.width = jedinice(nove[i][k]);
      }
    }));
    if (!promena) break;
  }
}

/** Poravnava tabove jednog pasusa (`<p>` sa `.uz-pl-tab`); `pxPoJedinici` = širina platna u px / 960. */
export function poravnajTabove(pasusEl: HTMLElement, p: Pasus, pxPoJedinici: number): void {
  poravnajSveTabove([{ el: pasusEl, pasus: p }], pxPoJedinici);
}

/** Ključ merenog pasusa (`data-meri-tabove`): prefiks okvira (`prefiksSloja`/`prefiksCelije`) i indeks pasusa. */
export function kljucMerenja(prefiks: string, indeks: number): string {
  return `${prefiks}-${indeks}`;
}

/** Prefiks okvira po indeksu sloja (ne po id-ju: id je podatak iz dokumenta), pa ključevi ne mogu da se sudare. */
export function prefiksSloja(sloj: number): string {
  return String(sloj);
}

export function prefiksCelije(sloj: number, red: number, kolona: number): string {
  return `${sloj}-${red}-${kolona}`;
}

/**
 * Mereni pasusi platna po ključu i potpis sadržaja koji utiče na njihov raspored (ceo sloj sa bar jednim takvim
 * pasusom, sa indeksom). Isti potpis = isti DOM i iste širine, pa novo merenje nije potrebno.
 */
export function pasusiZaMerenje(slojevi: readonly Sloj[]): { pasusi: Map<string, Pasus>; potpis: string } {
  const pasusi = new Map<string, Pasus>();
  const delovi: string[] = [];
  slojevi.forEach((s, i) => {
    const pre = pasusi.size;
    const dodaj = (prefiks: string, niz: readonly Pasus[]) => niz.forEach((p, j) => {
      if (trebaMerenjeTabova(p)) pasusi.set(kljucMerenja(prefiks, j), p);
    });
    if (s.tip === 'TEKST') {
      dodaj(prefiksSloja(i), s.pasusi);
    } else if (s.tip === 'TABELA') {
      s.celije.forEach((red, r) => red.forEach((c, k) => {
        if (!c.pokrivena) dodaj(prefiksCelije(i, r, k), c.pasusi);
      }));
    }
    if (pasusi.size > pre) delovi.push(`${i}:${JSON.stringify(s)}`);
  });
  return { pasusi, potpis: delovi.join('\n') };
}

import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, input, signal, untracked,
} from '@angular/core';
import { KljucVidljivosti, grupaZaKorak, stanjeSlojeva } from '../data-access/platno-koraci';
import {
  Animacija, Celija, CrtezSloj, FormulaSloj, Ivica, IviceCelije, OblikSloj, Pasus, Platno, SlikaSloj, Sloj, TabelaSloj, Tacka,
  TekstSloj,
} from '../data-access/platno.models';
import { medijUrl } from '../data-access/uzivo.models';
import { CRTEZ_KAO_VEKTOR, duzinaPoteza, kadroviPoteza, planIscrtavanja, putanjaPoteza } from './crtez-potezi';
import { FormulaPrikazComponent } from './formula-prikaz.component';
import { cssFonta } from './platno-fontovi';
import { METRIKA } from './platno-metrika';
import { pasusiZaMerenje, poravnajSveTabove, prefiksCelije, prefiksSloja } from './platno-tabovi';
import {
  CSS_CRTICE, PrikazPasusa, SIDRA_CELIJE, Stil, jedinice, prikazPasusa, stilOkvira, zaokruzi,
} from './platno-tekst';

interface PrikazTeksta { prelom: boolean; okvir: Stil; pasusi: PrikazPasusa[]; }
interface PrikazSlike { src: string; alt: string; stil: Stil; }
interface PrikazOblika {
  viewBox: string;
  vrsta: 'pravougaonik' | 'elipsa' | 'trougao' | 'linija';
  sirina: number; visina: number; rx: number; tacke: string;
  x1: number; y1: number; x2: number; y2: number;
  popuna: string; potez: string; debljina: number; crtica: string | null; zavrsetak: string | null;
  /** Vrhovi strelica (`points` trouglova, popunjeni bojom poteza). */
  vrhovi: string[];
}
/** `polje` = "r-k" (`data-celija`, kuka editora za izbor ćelije, F14). */
interface PrikazCelije { polje: string; colspan: number; rowspan: number; stil: Stil; pasusi: PrikazPasusa[]; }
interface PrikazTabele { stil: Stil; kolone: Stil[]; redovi: { stil: Stil; celije: PrikazCelije[] }[]; }
interface PrikazFormule { slika: string | null; latex: string; stil: Stil; }
/** Crtež: vektor (`potezi`, SVG u jedinicama sloja) kad ga ima, inače slika iz uvoza (`src`). */
interface PrikazCrteza {
  src: string; alt: string; viewBox: string;
  potezi: { d: string; boja: string; debljina: number }[] | null;
}

/** Pripremljen sloj: tačno jedno od polja vrste nije null (šablon ga suzi kroz `@if (...; as x)`). */
interface PrikazSloja {
  id: string;
  stil: Stil;
  tekst: PrikazTeksta | null;
  slika: PrikazSlike | null;
  oblik: PrikazOblika | null;
  tabela: PrikazTabele | null;
  formula: PrikazFormule | null;
  crtez: PrikazCrteza | null;
}

/** Položaj, veličina, rotacija, providnost i senka sloja (inline stil `.uz-pl-sloj`; editor iz njega crta okvir izbora). */
export function stilSloja(s: Sloj): Stil {
  const stil: Stil = {
    left: jedinice(s.x),
    top: jedinice(s.y),
    width: jedinice(s.sirina),
    height: jedinice(s.visina),
  };
  if (s.rotacija !== 0) {
    stil['transform'] = `rotate(${zaokruzi(s.rotacija)}deg)`;
  }
  if (s.providnost !== 1) {
    stil['opacity'] = String(s.providnost);
  }
  if (s.senka) {
    // Zamućenje se prenosi kao radijus drop-shadow-a; kalibracija prema PowerPointovom blurRad: faza 2.
    const { pomerajX, pomerajY, zamucenje, boja } = s.senka;
    stil['filter'] = `drop-shadow(${jedinice(pomerajX)} ${jedinice(pomerajY)} ${jedinice(zamucenje)} ${boja})`;
  }
  return stil;
}

function procenat(n: number): string {
  return `${zaokruzi(n * 100)}%`;
}

/** Isečak (udeo po strani, PowerPointov srcRect): slika se uveća i pomeri tako da vidljivi deo popuni sloj. */
function stilIsecka(isecak: SlikaSloj['isecak']): Stil {
  const vodoravno = 1 - isecak.levo - isecak.desno;
  const uspravno = 1 - isecak.gore - isecak.dole;
  const sirina = vodoravno > 0.001 ? vodoravno : 1;
  const visina = uspravno > 0.001 ? uspravno : 1;
  return {
    width: procenat(1 / sirina),
    height: procenat(1 / visina),
    left: procenat(-isecak.levo / sirina),
    top: procenat(-isecak.gore / visina),
  };
}

const LINIJSKI = new Set(['LINIJA', 'STRELICA', 'DVOSTRUKA_STRELICA']);

/**
 * Vrh strelice (`triangle`, `med` x `med`): dužina i širina = 3 x osnova, osnova = max(debljina, 0,7 mm). Izvor je
 * LibreOffice oox (`lineproperties.cxx`: sm/med/lg = 2/3/5, `max(nLineWidth, 70)` u 1/100 mm), nije mereno prema
 * PowerPointu (uzorak nema strelica). Model nema veličinu vrha, pa je uvek srednja.
 */
const VRH_STRELICE = 3;
/** 0,7 mm u jedinicama platna (pt). */
const NAJMANJA_OSNOVA_VRHA = 0.7 / 25.4 * 72;

/**
 * Vrh strelice u `vrh` (pravac `od` -> `vrh`) kao trougao dužine `duzina`, i tačka osnove do koje ide linija. Linija sa
 * markerom bi išla do samog šiljka, pa bi njen tupi kraj (širine debljine) virio iz uskog dela trougla.
 */
function vrhStrelice(od: Tacka, vrh: Tacka, duzina: number, sirina: number): { tacke: string; osnova: Tacka } {
  const dx = vrh.x - od.x;
  const dy = vrh.y - od.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const osnova = { x: vrh.x - ux * duzina, y: vrh.y - uy * duzina };
  const pola = sirina / 2;
  const t = (x: number, y: number) => `${zaokruzi(x)},${zaokruzi(y)}`;
  return {
    tacke: `${t(vrh.x, vrh.y)} ${t(osnova.x - uy * pola, osnova.y + ux * pola)} ${t(osnova.x + uy * pola, osnova.y - ux * pola)}`,
    osnova,
  };
}

function prikazOblika(s: OblikSloj): PrikazOblika {
  const { sirina, visina, ivica } = s;
  const linijski = LINIJSKI.has(s.oblik);
  let od = s.od ?? { x: 0, y: visina / 2 };
  let doTacke = s.do ?? { x: sirina, y: visina / 2 };
  const d = ivica?.debljina ?? 0;
  const vrhovi: string[] = [];
  const kraj = s.oblik === 'STRELICA' || s.oblik === 'DVOSTRUKA_STRELICA';
  const pocetak = s.oblik === 'DVOSTRUKA_STRELICA';
  if (kraj && ivica && d > 0) {
    // Vrh nije duži od linije (dvostruka: od polovine), širina ostaje puna.
    const osnovaVrha = VRH_STRELICE * Math.max(d, NAJMANJA_OSNOVA_VRHA);
    const duzina = Math.min(osnovaVrha, Math.hypot(doTacke.x - od.x, doTacke.y - od.y) / (pocetak ? 2 : 1));
    const [a, b] = [od, doTacke];
    const k = vrhStrelice(a, b, duzina, osnovaVrha);
    vrhovi.push(k.tacke);
    doTacke = k.osnova;
    if (pocetak) {
      const p = vrhStrelice(b, a, duzina, osnovaVrha);
      vrhovi.push(p.tacke);
      od = p.osnova;
    }
  }
  const crtica = ivica?.crtica === 'ISPREKIDANA' ? `${zaokruzi(4 * d)} ${zaokruzi(3 * d)}`
    : ivica?.crtica === 'TACKASTA' ? `${zaokruzi(d)} ${zaokruzi(2 * d)}` : null;
  const vrsta = linijski ? 'linija'
    : s.oblik === 'ELIPSA' ? 'elipsa' : s.oblik === 'TROUGAO' ? 'trougao' : 'pravougaonik';
  return {
    viewBox: `0 0 ${sirina} ${visina}`,
    vrsta,
    sirina, visina,
    // PowerPointov roundRect: poluprečnik = adj (podrazumevano 16 667 / 100 000) * kraća strana.
    rx: s.oblik === 'ZAOBLJENI_PRAVOUGAONIK' ? zaokruzi(Math.min(sirina, visina) * 0.16667) : 0,
    tacke: `${zaokruzi(sirina / 2)},0 ${sirina},${visina} 0,${visina}`,
    x1: zaokruzi(od.x), y1: zaokruzi(od.y), x2: zaokruzi(doTacke.x), y2: zaokruzi(doTacke.y),
    popuna: linijski ? 'none' : (s.popuna ?? 'none'),
    potez: ivica?.boja ?? 'none',
    debljina: d,
    crtica,
    zavrsetak: ivica?.crtica === 'TACKASTA' ? 'round' : null,
    vrhovi,
  };
}

function ivicaCss(ivica: Ivica | null): string | null {
  return ivica ? `${jedinice(ivica.debljina)} ${CSS_CRTICE[ivica.crtica]} ${ivica.boja}` : null;
}

const IVICE_CELIJE = { gore: 'border-top', dole: 'border-bottom', levo: 'border-left', desno: 'border-right' } as const;

/** Debljine ivica ćelije posle `border-collapse` (šira od dve susedne ivice), po strani. */
type DebljineIvica = Record<keyof IviceCelije, number>;

function prikazCelije(c: Celija, polje: string, prefiksMerenja: string, debljine: DebljineIvica): PrikazCelije {
  const m = METRIKA.marginaCelije;
  // PowerPoint crta ivicu ćelije na liniji mreže, a margine meri od nje: ivica ne povećava red. U `border-collapse` pola
  // razrešene ivice ulazi u ćeliju, pa se oduzima od margine (red sa tekstom višim od `tr@h` je tada 1,2 * veličina + margine).
  const unutra = (n: number, debljina: number) => jedinice(Math.max(0, n - debljina / 2));
  const stil: Stil = {
    'vertical-align': SIDRA_CELIJE[c.sidro],
    'padding-top': unutra(m.gore, debljine.gore),
    'padding-right': unutra(m.desno, debljine.desno),
    'padding-bottom': unutra(m.dole, debljine.dole),
    'padding-left': unutra(m.levo, debljine.levo),
  };
  if (c.popuna) {
    stil['background-color'] = c.popuna;
  }
  for (const [strana, svojstvo] of Object.entries(IVICE_CELIJE) as [keyof typeof IVICE_CELIJE, string][]) {
    const css = ivicaCss(c.ivice[strana]);
    if (css) {
      stil[svojstvo] = css;
    }
  }
  return { polje, colspan: 1 + c.spojDesno, rowspan: 1 + c.spojDole, stil, pasusi: prikazPasusa(c.pasusi, { prefiksMerenja }) };
}

/** Ćelija koja crta polje (r, k): ona sama, ili sidro spajanja koje ga pokriva; van tabele -> null. */
function vlasnikPolja(s: TabelaSloj, r: number, k: number): Celija | null {
  for (let i = r; i >= 0; i--) {
    for (let j = k; j >= 0; j--) {
      const c = s.celije[i]?.[j];
      if (c && !c.pokrivena && i + c.spojDole >= r && j + c.spojDesno >= k) return c;
    }
  }
  return null;
}

/** Razrešene debljine ivica ćelije (i, k): šira od sopstvene i ivice susednog polja na toj strani (kao `border-collapse`). */
function debljineIvica(s: TabelaSloj, c: Celija, i: number, k: number): DebljineIvica {
  const d = (iv: Ivica | null | undefined) => iv?.debljina ?? 0;
  return {
    gore: Math.max(d(c.ivice.gore), d(vlasnikPolja(s, i - 1, k)?.ivice.dole)),
    dole: Math.max(d(c.ivice.dole), d(vlasnikPolja(s, i + 1 + c.spojDole, k)?.ivice.gore)),
    levo: Math.max(d(c.ivice.levo), d(vlasnikPolja(s, i, k - 1)?.ivice.desno)),
    desno: Math.max(d(c.ivice.desno), d(vlasnikPolja(s, i, k + 1 + c.spojDesno)?.ivice.levo)),
  };
}

function prikazTabele(s: TabelaSloj, indeks: number): PrikazTabele {
  return {
    stil: { width: jedinice(s.kolone.reduce((a, b) => a + b, 0)) },
    kolone: s.kolone.map((w) => ({ width: jedinice(w) })),
    redovi: s.redovi.map((h, i) => ({
      stil: { height: jedinice(h) },
      celije: (s.celije[i] ?? []).flatMap((c, k) => (c.pokrivena ? []
        : [prikazCelije(c, `${i}-${k}`, prefiksCelije(indeks, i, k), debljineIvica(s, c, i, k))])),
    })),
  };
}

function prikazTeksta(s: TekstSloj, indeks: number): PrikazTeksta {
  return {
    prelom: s.okvir.prelom,
    okvir: stilOkvira(s.okvir, s.popuna, s.ivica),
    pasusi: prikazPasusa(s.pasusi, {
      skala: s.okvir.skala, skalaProreda: s.okvir.skalaProreda, slojId: s.id, prefiksMerenja: prefiksSloja(indeks),
    }),
  };
}

function prikazFormule(s: FormulaSloj): PrikazFormule {
  const poravnanje = { LEVO: 'left', CENTAR: 'center', DESNO: 'right', OBOSTRANO: 'justify' }[s.poravnanje];
  return {
    slika: s.slikaIzvora ? medijUrl(s.slikaIzvora) : null,
    latex: s.latex,
    stil: { color: s.boja, 'font-size': jedinice(s.velicina), 'text-align': poravnanje, 'font-family': cssFonta('Cousine') },
  };
}

/**
 * CRTEZ sa potezima se crta vektorski (odluka 7 faze 5), i bez animacije: oštar na svakoj veličini, isti kao PowerPointov
 * PDF. Slika ostaje kad poteza nema (`null`, prazno, još nisu stigli na projektor) ili kad je kapija W1 isključena.
 */
function prikazCrteza(s: CrtezSloj): PrikazCrteza {
  return {
    src: medijUrl(s.medijId),
    alt: s.naziv ?? 'Crtež',
    viewBox: `0 0 ${s.sirina} ${s.visina}`,
    potezi: CRTEZ_KAO_VEKTOR && s.potezi?.length
      ? s.potezi.map((pz) => ({ d: putanjaPoteza(pz.tacke), boja: pz.boja, debljina: pz.debljina }))
      : null,
  };
}

/** `indeks` = položaj sloja u dokumentu (prefiks ključeva merenih tabova, `platno-tabovi.ts`). */
function prikazSloja(s: Sloj, indeks: number): PrikazSloja {
  const prikaz: PrikazSloja = {
    id: s.id, stil: stilSloja(s), tekst: null, slika: null, oblik: null, tabela: null, formula: null, crtez: null,
  };
  switch (s.tip) {
    case 'TEKST': prikaz.tekst = prikazTeksta(s, indeks); break;
    case 'SLIKA': prikaz.slika = { src: medijUrl(s.medijId), alt: s.naziv ?? '', stil: stilIsecka(s.isecak) }; break;
    case 'OBLIK': prikaz.oblik = prikazOblika(s); break;
    case 'TABELA': prikaz.tabela = prikazTabele(s, indeks); break;
    case 'FORMULA': prikaz.formula = prikazFormule(s); break;
    case 'CRTEZ': prikaz.crtez = prikazCrteza(s); break;
  }
  return prikaz;
}

/** Širina i visina platna u jedinicama (1 jedinica = 1 pt PowerPointovog 16:9 slajda). */
const SIRINA_PLATNA = 960;
const VISINA_PLATNA = 540;

const BRISANJE_OD: Record<string, string> = {
  LEVO: 'inset(-50% 100% -50% 0)', DESNO: 'inset(-50% 0 -50% 100%)', GORE: 'inset(0 -50% 100% -50%)', DOLE: 'inset(100% -50% 0 -50%)',
};

/** Potpuno otkriveno stanje: negativni razmaci puštaju i poteze i vrhove strelica koji izlaze iz okvira sloja (fill traje do kraja grupe). */
const CLIP_OTKRIVENO = 'inset(-50%)';

/** Pomeraj ULET-a u px: sa ivice platna u smeru `smer`, izražen u koordinatama sloja (sadržaj je unutar rotiranog sloja). */
function pomerajUleta(smer: Animacija['smer'], s: Sloj, pxPoJedinici: number): string {
  const dx = smer === 'LEVO' ? -(s.x + s.sirina) : smer === 'DESNO' ? SIRINA_PLATNA - s.x : 0;
  const dy = smer === 'GORE' ? -(s.y + s.visina) : smer === 'LEVO' || smer === 'DESNO' ? 0 : VISINA_PLATNA - s.y;
  const ugao = (-s.rotacija * Math.PI) / 180;
  const x = (dx * Math.cos(ugao) - dy * Math.sin(ugao)) * pxPoJedinici;
  const y = (dx * Math.sin(ugao) + dy * Math.cos(ugao)) * pxPoJedinici;
  return `translate(${zaokruzi(x)}px, ${zaokruzi(y)}px)`;
}

/**
 * Ključni kadrovi jedne animacije (Web Animations API) za `.uz-pl-sadrzaj` sloja ili `<p>` pasusa. Kadrovi su za ULAZ
 * (od skrivenog ka krajnjem izgledu); IZLAZ ih obrće. Kadrovi ne nose `visibility`: dok grupa traje, cilj dobija inline
 * `visibility: visible` (`PlatnoPrikazComponent.pusti`), jer krajnje stanje koraka (`stanjeSlojeva`) element već sakriva
 * ili prikazuje, a animacija mora da se vidi dok traje.
 * `pxPoJedinici` = širina platna u px / 960 (ULET ide u px, ne kroz `var(--u)` u kadru).
 */
export function kadroviAnimacije(a: Animacija, s: Sloj, pxPoJedinici: number): Keyframe[] {
  let od: Keyframe;
  let ka: Keyframe;
  switch (a.efekat) {
    case 'ULET':
      od = { transform: pomerajUleta(a.smer, s, pxPoJedinici), opacity: 0 };
      ka = { transform: 'translate(0px, 0px)', opacity: 1 };
      break;
    case 'PODELI':
      od = { clipPath: a.smer === 'HORIZONTALNO' ? 'inset(50% -50% 50% -50%)' : 'inset(-50% 50% -50% 50%)' };
      ka = { clipPath: CLIP_OTKRIVENO };
      break;
    case 'BRISANJE':
    case 'ISCRTAJ':
      // ISCRTAJ bez vektorskih poteza (slika) se crta kao BRISANJE; sa potezima ga pušta `pusti` potez po potez (faza 5).
      od = { clipPath: BRISANJE_OD[a.smer ?? 'LEVO'] ?? BRISANJE_OD['LEVO'] };
      ka = { clipPath: CLIP_OTKRIVENO };
      break;
    case 'ZUM':
      od = { transform: 'scale(0.3)', opacity: 0 };
      ka = { transform: 'scale(1)', opacity: 1 };
      break;
    default: // POJAVI (trajanje 0) i FADE
      od = { opacity: 0 };
      ka = { opacity: 1 };
  }
  const kadrovi = [od, ka];
  return a.vrsta === 'IZLAZ' ? kadrovi.reverse() : kadrovi;
}

/** `prefers-reduced-motion: reduce`: animacije traju 0 ms (spec 4.4); bez `matchMedia` (stari pregledač) puno kretanje. */
function smanjenoKretanje(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Platno sa slojevima (slajd tipa PLATNO), 960 x 540 jedinica, u DOM-u. Domaćin popunjava `uz-platno` okvir 16:9
 * (`container-type: inline-size` je na `uz-okvir`), a `--u` = `100cqw / 960` je jedna jedinica (1 pt PowerPointa).
 * Svaki sloj je `.uz-pl-sloj` (pozicija, veličina, rotacija, providnost, senka, vidljivost za ključ sloja) sa
 * unutrašnjim `.uz-pl-sadrzaj` (sadržaj; njega animira korak napred). Redosled u DOM-u = z-osa. Vidljivost slojeva i
 * pasusa posle koraka daje `stanjeSlojeva`; sakriven sloj zadržava mesto (`visibility: hidden`).
 * Ista komponenta služi projektoru, konzoli i pregledu u editoru; javne (studentske) strane je ne uvoze.
 *
 * Animacije: nov `animacija.kljuc` (sa `grupa` = `korak`) pušta `grupaZaKorak` preko `Element.animate`, posle crtanja
 * krajnjeg stanja koraka. Animacije prethodne grupe se pre toga prekidaju (`cancel`: odmah krajnje stanje), a kad se
 * završe sve animacije grupe, i one se prekidaju, pa opet važi samo krajnje stanje iz `stanjeSlojeva`. Promena koraka
 * bez novog ključa (skok, nazad, ponovno povezivanje) samo prekida animaciju koja traje.
 *
 * Vidljivost cilja animacije: dok grupa traje, cilj ima inline `visibility: visible` (ne nasleđuje je od sloja), a
 * posle prekida mu se inline vidljivost izričito vraća na krajnje stanje (`.uz-pl-sadrzaj` opet nasleđuje od sloja,
 * pasus dobija vrednost iz `stanjeSlojeva`). Chromium inače ume da posle `cancel()` zadrži zastareo nasleđeni
 * `visibility` cilja (sloj `hidden`, sadržaj vidljiv, ili obrnuto) kad se vidljivost sloja menja dok cilj ima
 * animacije (brzi koraci napred); izmena inline stila cilja posle prekida primorava pun ponovni proračun stila.
 */
@Component({
  selector: 'app-platno-prikaz',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, FormulaPrikazComponent],
  host: {
    class: 'uz-pl-platno',
    '[style.background-color]': 'platno().pozadina.boja',
    '[style.font-kerning]': 'kerning',
    '[style.font-variant-ligatures]': 'ligature',
  },
  template: `
    @if (platno().pozadina.medijId; as pozadina) { <img class="uz-pl-pozadina" [src]="url(pozadina)" alt=""> }
    @for (s of slojevi(); track s.id) {
      <div class="uz-pl-sloj" [attr.data-sloj]="s.id" [style]="s.stil" [style.visibility]="skriven(s.id) ? 'hidden' : null">
        @if (s.tekst; as t) {
          <div class="uz-pl-sadrzaj uz-pl-tekst" [class.uz-pl-tekst--bez-preloma]="!t.prelom" [style]="t.okvir">
            <ng-container [ngTemplateOutlet]="pasusiT" [ngTemplateOutletContext]="{ $implicit: t.pasusi }" />
          </div>
        } @else if (s.slika; as sl) {
          <div class="uz-pl-sadrzaj uz-pl-slika"><img [src]="sl.src" [alt]="sl.alt" [style]="sl.stil"></div>
        } @else if (s.oblik; as o) {
          <div class="uz-pl-sadrzaj uz-pl-oblik">
            <svg [attr.viewBox]="o.viewBox" preserveAspectRatio="none" aria-hidden="true">
              @switch (o.vrsta) {
                @case ('linija') {
                  <svg:line [attr.x1]="o.x1" [attr.y1]="o.y1" [attr.x2]="o.x2" [attr.y2]="o.y2" fill="none"
                            [attr.stroke]="o.potez" [attr.stroke-width]="o.debljina" [attr.stroke-dasharray]="o.crtica"
                            [attr.stroke-linecap]="o.zavrsetak" />
                  @for (v of o.vrhovi; track $index) { <svg:polygon [attr.points]="v" [attr.fill]="o.potez" /> }
                }
                @case ('elipsa') {
                  <svg:ellipse [attr.cx]="o.sirina / 2" [attr.cy]="o.visina / 2" [attr.rx]="o.sirina / 2" [attr.ry]="o.visina / 2"
                               [attr.fill]="o.popuna" [attr.stroke]="o.potez" [attr.stroke-width]="o.debljina"
                               [attr.stroke-dasharray]="o.crtica" [attr.stroke-linecap]="o.zavrsetak" />
                }
                @case ('trougao') {
                  <svg:polygon [attr.points]="o.tacke" [attr.fill]="o.popuna" [attr.stroke]="o.potez" [attr.stroke-width]="o.debljina"
                               [attr.stroke-dasharray]="o.crtica" [attr.stroke-linecap]="o.zavrsetak" />
                }
                @default {
                  <svg:rect x="0" y="0" [attr.width]="o.sirina" [attr.height]="o.visina" [attr.rx]="o.rx || null"
                            [attr.fill]="o.popuna" [attr.stroke]="o.potez" [attr.stroke-width]="o.debljina"
                            [attr.stroke-dasharray]="o.crtica" [attr.stroke-linecap]="o.zavrsetak" />
                }
              }
            </svg>
          </div>
        } @else if (s.tabela; as tb) {
          <div class="uz-pl-sadrzaj uz-pl-tabela">
            <table [style]="tb.stil">
              <colgroup>@for (k of tb.kolone; track $index) { <col [style]="k"> }</colgroup>
              <tbody>
                @for (red of tb.redovi; track $index) {
                  <tr [style]="red.stil">
                    @for (c of red.celije; track $index) {
                      <td [attr.data-celija]="c.polje" [attr.colspan]="c.colspan" [attr.rowspan]="c.rowspan" [style]="c.stil">
                        <div class="uz-pl-celija">
                          <ng-container [ngTemplateOutlet]="pasusiT" [ngTemplateOutletContext]="{ $implicit: c.pasusi }" />
                        </div>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (s.formula; as f) {
          <div class="uz-pl-sadrzaj uz-pl-formula">
            @if (f.slika) {
              <img [src]="f.slika" [alt]="f.latex">
            } @else {
              <app-formula-prikaz [latex]="f.latex" [stil]="f.stil" />
            }
          </div>
        } @else if (s.crtez; as c) {
          <!-- Sadržaj ostaje isti element kad potezi stignu usred grupe (slika -> vektor): animacija koja traje nastavlja. -->
          <div class="uz-pl-sadrzaj uz-pl-crtez" [attr.data-crtez]="c.potezi ? 'vektor' : 'slika'">
            @if (c.potezi; as potezi) {
              <svg class="uz-pl-crtez-vektor" [attr.viewBox]="c.viewBox" preserveAspectRatio="none" role="img" [attr.aria-label]="c.alt">
                @for (p of potezi; track $index) {
                  <svg:path data-potez [attr.d]="p.d" [attr.stroke]="p.boja" [attr.stroke-width]="p.debljina" pathLength="1"
                            fill="none" stroke-linecap="round" stroke-linejoin="round" />
                }
              </svg>
            } @else {
              <img [src]="c.src" [alt]="c.alt">
            }
          </div>
        }
      </div>
    }

    <ng-template #pasusiT let-pasusi>
      @for (p of asPasusi(pasusi); track p.indeks) {
        <p class="uz-pl-pasus" [attr.data-pasus]="p.kljuc === null ? null : p.indeks" [attr.data-meri-tabove]="p.meriTabove"
           [style]="p.stil" [style.visibility]="p.kljuc !== null && skriven(p.kljuc) ? 'hidden' : null">@if (p.oznaka; as o) {<span class="uz-pl-oznaka" [style]="o.stil">{{ o.tekst }}</span>}@if (p.meriTabove) {@for (d of p.delovi; track $index) {<span class="uz-pl-deo" [style]="d.stil">@for (t of d.segmenti ?? [d.tekst]; track $index) {@if (!$first) {<span class="uz-pl-tab">{{ tab }}</span>}{{ t }}}</span>}} @else {@for (d of p.delovi; track $index) {<span class="uz-pl-deo" [style]="d.stil">{{ d.tekst }}</span>}}</p>
      }
    </ng-template>
  `,
})
export class PlatnoPrikazComponent {
  readonly platno = input.required<Platno>();
  /** Korak izvođenja: odigrane su grupa 0 i grupe 1..korak (`stanjeSlojeva`). */
  readonly korak = input(0);
  /**
   * Animacija prelaza na `korak`: nov `kljuc` pušta grupu `grupa` (mora biti jednaka `korak`, inače se crta samo krajnje
   * stanje). Isti ključ se nikad ne pušta dvaput, pa ponovno crtanje zbog drugog ulaza ne ponavlja animaciju.
   */
  readonly animacija = input<{ kljuc: number; grupa: number } | null>(null);

  protected readonly url = medijUrl;
  /**
   * Pripremljen prikaz po paru (objekat sloja, indeks) (odluka 33): pomeren sloj u editoru ponovo pravi samo svoj prikaz.
   * Indeks je deo ključa jer ključevi merenja tabova zavise od položaja sloja na z-osi.
   */
  private readonly kesPrikaza = new WeakMap<Sloj, { indeks: number; prikaz: PrikazSloja }>();
  protected readonly slojevi = computed(() => this.platno().slojevi.map((s, i) => {
    const k = this.kesPrikaza.get(s);
    if (k && k.indeks === i) return k.prikaz;
    const prikaz = prikazSloja(s, i);
    this.kesPrikaza.set(s, { indeks: i, prikaz });
    return prikaz;
  }));
  private readonly vidljivost = computed(() => stanjeSlojeva(this.platno(), this.korak()));
  /** Mereni pasusi (ključevi zavise od z-ose, pa se čitaju sveži) i potpis njihovog rasporeda (okidač merenja). */
  private readonly merenje = computed(() => pasusiZaMerenje(this.platno().slojevi));
  /** Isti potpis (nov snimak istog slajda posle koraka, pomeren sloj) ne pokreće novo merenje. */
  private readonly potpisMerenja = computed(() => this.merenje().potpis);
  /** Okidači novog merenja tabova: veličina platna se bitno promenila, učitani su fontovi, kraj grupe animacija. */
  private readonly velicina = signal(0);
  private readonly fontovi = signal(0);
  private readonly posleGrupe = signal(0);
  /** Poslednje merenje je bilo rezervno (`offsetLeft`) dok je grupa animacija trajala: ponoviti ga na kraju grupe. */
  private meriPosleGrupe = false;
  /** px po jedinici pri poslednjem merenju tabova (0 = još nije izmereno sa vidljivom veličinom). */
  private pxMeren = 0;
  private pracenje = false;
  private tajmerVelicine: ReturnType<typeof setTimeout> | undefined;

  /** Tab u merenom pasusu (`.uz-pl-tab`): znak ostaje u tekstu, `tab-size: 0` ga ne crta, širinu daje merenje. */
  protected readonly tab = '\t';
  /** `'normal'` = ponašanje pregledača: svojstvo se ne postavlja (izgled faze 1). */
  protected readonly kerning = METRIKA.kerning === 'none' ? 'none' : null;
  protected readonly ligature = METRIKA.ligature === 'none' ? 'none' : null;
  private readonly destroyRef = inject(DestroyRef);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** Animacije grupe koja se trenutno pušta (prazno kad se crta samo krajnje stanje). */
  private tekuce: Animation[] = [];
  /** Ciljevi tekuće grupe sa inline `visibility: visible`: ključ pasusa ili null za `.uz-pl-sadrzaj` sloja. */
  private ciljevi = new Map<HTMLElement, KljucVidljivosti | null>();
  private poslednjiKljuc: number | null = null;
  private poslednjiKorak: number | null = null;

  constructor() {
    afterRenderEffect({
      write: () => {
        const animacija = this.animacija();
        const korak = this.korak();
        const korakPromenjen = this.poslednjiKorak !== null && korak !== this.poslednjiKorak;
        this.poslednjiKorak = korak;
        if (animacija && animacija.kljuc !== this.poslednjiKljuc) {
          this.poslednjiKljuc = animacija.kljuc;
          this.prekini();
          if (animacija.grupa === korak) {
            this.pusti(untracked(this.platno), korak);
          }
        } else if (korakPromenjen) {
          // Novi snimak sa istim korakom (npr. prijava učesnika) ne prekida animaciju koja traje.
          this.prekini();
        }
      },
    });
    // Mereni tab-stopovi (`platno-tabovi.ts`): čitanje i pisanje rasporeda u istoj fazi, posle crtanja, samo kad se
    // promeni sadržaj merenih pasusa, veličina platna (posle smirivanja) ili fontovi; nikad po kadru animacije.
    afterRenderEffect({
      mixedReadWrite: () => {
        this.potpisMerenja();
        this.velicina();
        this.fontovi();
        this.posleGrupe();
        const { pasusi } = untracked(this.merenje);
        if (pasusi.size === 0) {
          return;
        }
        this.pratiPromene();
        const px = this.host.offsetWidth / SIRINA_PLATNA;
        this.pxMeren = px;
        const stavke: { el: HTMLElement; pasus: Pasus }[] = [];
        this.host.querySelectorAll<HTMLElement>('p[data-meri-tabove]').forEach((el) => {
          const pasus = pasusi.get(el.dataset['meriTabove'] ?? '');
          if (pasus) {
            stavke.push({ el, pasus });
          }
        });
        const { rezervno } = poravnajSveTabove(stavke, px);
        // ULET/ZUM koji traje daje transformaciju, pa merenje ide iz rasporeda na ceo px; posle grupe se meri tačno.
        this.meriPosleGrupe = rezervno && this.tekuce.length > 0;
      },
    });
    this.destroyRef.onDestroy(() => {
      this.prekini();
      clearTimeout(this.tajmerVelicine);
    });
  }

  /**
   * Prvi put kad platno ima merene pasuse: novo merenje posle učitavanja fontova (`document.fonts`) i posle promene
   * veličine platna za više od 1% (`ResizeObserver`, smireno 150 ms; odmah ako do sada nije bilo vidljive veličine).
   * Širine su u jedinicama, pa su do novog merenja približno tačne; novo merenje ispravlja nelinearnu širinu teksta
   * (hinting) na drugoj veličini.
   */
  private pratiPromene(): void {
    if (this.pracenje) {
      return;
    }
    this.pracenje = true;
    const fontovi = typeof document === 'undefined' ? undefined : document.fonts;
    if (fontovi) {
      let unisten = false;
      const ucitani = () => {
        if (!unisten) {
          this.fontovi.update((n) => n + 1);
        }
      };
      fontovi.ready.then(ucitani, () => undefined);
      fontovi.addEventListener('loadingdone', ucitani);
      this.destroyRef.onDestroy(() => {
        unisten = true;
        fontovi.removeEventListener('loadingdone', ucitani);
      });
    }
    if (typeof ResizeObserver !== 'undefined') {
      const posmatrac = new ResizeObserver(([e]) => this.promenaVelicine(e.contentRect.width / SIRINA_PLATNA));
      posmatrac.observe(this.host);
      this.destroyRef.onDestroy(() => posmatrac.disconnect());
    }
  }

  private promenaVelicine(px: number): void {
    if (!(px > 0)) {
      return;
    }
    clearTimeout(this.tajmerVelicine);
    if (this.pxMeren > 0 && Math.abs(px - this.pxMeren) / this.pxMeren <= 0.01) {
      return;
    }
    if (this.pxMeren > 0) {
      this.tajmerVelicine = setTimeout(() => this.velicina.update((n) => n + 1), 150);
    } else {
      this.velicina.update((n) => n + 1);
    }
  }

  /** Prekida animacije koje traju: cilj odmah dobija krajnje stanje koraka (`vratiVidljivost`). */
  private prekini(): void {
    const tekuce = this.tekuce;
    const ciljevi = this.ciljevi;
    this.tekuce = [];
    this.ciljevi = new Map();
    for (const a of tekuce) {
      a.cancel();
    }
    this.vratiVidljivost(ciljevi);
    if (this.meriPosleGrupe) {
      this.meriPosleGrupe = false;
      this.posleGrupe.update((n) => n + 1);
    }
  }

  /**
   * Posle `cancel()`: `.uz-pl-sadrzaj` gubi inline `visibility` (opet nasleđuje od sloja), a pasus dobija vrednost
   * krajnjeg stanja (isto što piše vezivanje u šablonu). Izmena inline stila je i ono što Chromium-u ne dozvoljava da
   * zadrži zastareo stil iz otkazane animacije.
   */
  private vratiVidljivost(ciljevi: ReadonlyMap<HTMLElement, KljucVidljivosti | null>): void {
    for (const [cilj, kljuc] of ciljevi) {
      if (kljuc !== null && untracked(() => this.skriven(kljuc))) {
        cilj.style.setProperty('visibility', 'hidden');
      } else {
        cilj.style.removeProperty('visibility');
      }
    }
  }

  private pusti(p: Platno, grupa: number): void {
    const zakazane = grupaZaKorak(p, grupa, smanjenoKretanje());
    if (zakazane.length === 0) {
      return;
    }
    const pxPoJedinici = this.host.offsetWidth / SIRINA_PLATNA;
    const slojevi = new Map(p.slojevi.map((s) => [s.id, s]));
    // Id sloja ide kroz `dataset`, ne kroz selektor (id je podatak iz dokumenta).
    const elementi = new Map<string, HTMLElement>();
    this.host.querySelectorAll<HTMLElement>(':scope > .uz-pl-sloj').forEach((el) => elementi.set(el.dataset['sloj'] ?? '', el));
    const zapoceti = new Set<string>();
    const lista: Animation[] = [];
    const ciljevi = new Map<HTMLElement, KljucVidljivosti | null>();
    for (const z of zakazane) {
      const { slojId, pasus } = z.animacija;
      const sloj = slojevi.get(slojId);
      const elSloja = elementi.get(slojId);
      const cilj = pasus === null
        ? elSloja?.querySelector<HTMLElement>(':scope > .uz-pl-sadrzaj')
        : elSloja?.querySelector<HTMLElement>(`:scope > .uz-pl-tekst > p[data-pasus="${pasus}"]`);
      if (!sloj || !cilj) {
        continue;
      }
      // Vidljiv dok grupa traje (i IZLAZ, čiji je sloj ili pasus u krajnjem stanju već skriven); kadrovi daju izgled.
      if (!ciljevi.has(cilj)) {
        ciljevi.set(cilj, pasus === null ? null : z.kljuc);
        cilj.style.setProperty('visibility', 'visible');
      }
      // ISCRTAJ nad vektorskim crtežom: svaka putanja je svoja animacija u delu trajanja (`planIscrtavanja`), sadržaj
      // sloja se ne animira. Putanje su nacrtane iz istog objekta sloja (`platno` je isti signal), pa se indeksi poklapaju.
      if (z.animacija.efekat === 'ISCRTAJ' && sloj.tip === 'CRTEZ') {
        const putanje = Array.from(cilj.querySelectorAll<SVGPathElement>('path[data-potez]'));
        if (putanje.length > 0) {
          const duzine = (sloj.potezi ?? []).map((pz) => duzinaPoteza(pz.tacke));
          for (const d of planIscrtavanja(duzine, z.trajanjeMs, z.animacija.vrsta)) {
            const el = putanje[d.indeks];
            if (!el) continue;
            lista.push(el.animate(kadroviPoteza(z.animacija.vrsta), {
              delay: z.pocetakMs + d.pocetakMs, duration: d.trajanjeMs, fill: 'both', easing: 'linear',
            }));
          }
          zapoceti.add(z.kljuc);
          continue;
        }
      }
      // Prva animacija ključa drži početni kadar i tokom kašnjenja (`both`); sledeće istog ključa nastavljaju od nje.
      const fill: FillMode = zapoceti.has(z.kljuc) ? 'forwards' : 'both';
      zapoceti.add(z.kljuc);
      lista.push(cilj.animate(kadroviAnimacije(z.animacija, sloj, pxPoJedinici), {
        delay: z.pocetakMs, duration: z.trajanjeMs, fill, easing: 'ease-out',
      }));
    }
    this.tekuce = lista;
    this.ciljevi = ciljevi;
    // Kraj grupe: prekid svih vraća krajnje stanje. Prekinuta animacija odbija `finished` (AbortError), to nije greška.
    Promise.all(lista.map((a) => a.finished)).then(
      () => {
        if (this.tekuce === lista) {
          this.prekini();
        } else {
          lista.forEach((a) => a.cancel());
        }
      },
      () => undefined,
    );
  }

  protected skriven(kljuc: string): boolean {
    return this.vidljivost().get(kljuc) === false;
  }

  /** Tipizacija konteksta `ng-template`-a (šablon ga inače vidi kao `any`). */
  protected asPasusi(pasusi: PrikazPasusa[]): PrikazPasusa[] {
    return pasusi;
  }
}


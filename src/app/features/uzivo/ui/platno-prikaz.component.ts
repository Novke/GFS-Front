import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { stanjeSlojeva } from '../data-access/platno-koraci';
import {
  Celija, FormulaSloj, Ivica, OblikSloj, Platno, SlikaSloj, Sloj, TabelaSloj, TekstSloj,
} from '../data-access/platno.models';
import { medijUrl } from '../data-access/uzivo.models';
import { cssFonta } from './platno-fontovi';
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
  markerPocetak: string | null; markerKraj: string | null;
}
interface PrikazCelije { colspan: number; rowspan: number; stil: Stil; pasusi: PrikazPasusa[]; }
interface PrikazTabele { stil: Stil; kolone: Stil[]; redovi: { stil: Stil; celije: PrikazCelije[] }[]; }
interface PrikazFormule { slika: string | null; latex: string; stil: Stil; }

/** Pripremljen sloj: tačno jedno od polja vrste nije null (šablon ga suzi kroz `@if (...; as x)`). */
interface PrikazSloja {
  id: string;
  stil: Stil;
  tekst: PrikazTeksta | null;
  slika: PrikazSlike | null;
  oblik: PrikazOblika | null;
  tabela: PrikazTabele | null;
  formula: PrikazFormule | null;
  crtez: PrikazSlike | null;
}

let brojacInstanci = 0;

function stilSloja(s: Sloj): Stil {
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

function prikazOblika(s: OblikSloj, prefiks: string): PrikazOblika {
  const { sirina, visina, ivica } = s;
  const linijski = LINIJSKI.has(s.oblik);
  const od = s.od ?? { x: 0, y: visina / 2 };
  const doTacke = s.do ?? { x: sirina, y: visina / 2 };
  const d = ivica?.debljina ?? 0;
  const crtica = ivica?.crtica === 'ISPREKIDANA' ? `${zaokruzi(4 * d)} ${zaokruzi(3 * d)}`
    : ivica?.crtica === 'TACKASTA' ? `${zaokruzi(d)} ${zaokruzi(2 * d)}` : null;
  const vrsta = linijski ? 'linija'
    : s.oblik === 'ELIPSA' ? 'elipsa' : s.oblik === 'TROUGAO' ? 'trougao' : 'pravougaonik';
  return {
    viewBox: `0 0 ${sirina} ${visina}`,
    vrsta,
    sirina, visina,
    rx: s.oblik === 'ZAOBLJENI_PRAVOUGAONIK' ? zaokruzi(Math.min(sirina, visina) * 0.1) : 0,
    tacke: `${zaokruzi(sirina / 2)},0 ${sirina},${visina} 0,${visina}`,
    x1: od.x, y1: od.y, x2: doTacke.x, y2: doTacke.y,
    popuna: linijski ? 'none' : (s.popuna ?? 'none'),
    potez: ivica?.boja ?? 'none',
    debljina: d,
    crtica,
    zavrsetak: ivica?.crtica === 'TACKASTA' ? 'round' : null,
    markerPocetak: s.oblik === 'DVOSTRUKA_STRELICA' ? `${prefiks}-${s.id}-p` : null,
    markerKraj: s.oblik === 'STRELICA' || s.oblik === 'DVOSTRUKA_STRELICA' ? `${prefiks}-${s.id}-k` : null,
  };
}

function ivicaCss(ivica: Ivica | null): string | null {
  return ivica ? `${jedinice(ivica.debljina)} ${CSS_CRTICE[ivica.crtica]} ${ivica.boja}` : null;
}

const IVICE_CELIJE = { gore: 'border-top', dole: 'border-bottom', levo: 'border-left', desno: 'border-right' } as const;

function prikazCelije(c: Celija): PrikazCelije {
  const stil: Stil = { 'vertical-align': SIDRA_CELIJE[c.sidro] };
  if (c.popuna) {
    stil['background-color'] = c.popuna;
  }
  for (const [strana, svojstvo] of Object.entries(IVICE_CELIJE) as [keyof typeof IVICE_CELIJE, string][]) {
    const css = ivicaCss(c.ivice[strana]);
    if (css) {
      stil[svojstvo] = css;
    }
  }
  return { colspan: 1 + c.spojDesno, rowspan: 1 + c.spojDole, stil, pasusi: prikazPasusa(c.pasusi) };
}

function prikazTabele(s: TabelaSloj): PrikazTabele {
  return {
    stil: { width: jedinice(s.kolone.reduce((a, b) => a + b, 0)) },
    kolone: s.kolone.map((w) => ({ width: jedinice(w) })),
    redovi: s.redovi.map((h, i) => ({
      stil: { height: jedinice(h) },
      celije: (s.celije[i] ?? []).filter((c) => !c.pokrivena).map(prikazCelije),
    })),
  };
}

function prikazTeksta(s: TekstSloj): PrikazTeksta {
  return {
    prelom: s.okvir.prelom,
    okvir: stilOkvira(s.okvir, s.popuna, s.ivica),
    pasusi: prikazPasusa(s.pasusi, s.okvir.skala, s.okvir.skalaProreda, s.id),
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

function prikazSloja(s: Sloj, prefiks: string): PrikazSloja {
  const prikaz: PrikazSloja = {
    id: s.id, stil: stilSloja(s), tekst: null, slika: null, oblik: null, tabela: null, formula: null, crtez: null,
  };
  switch (s.tip) {
    case 'TEKST': prikaz.tekst = prikazTeksta(s); break;
    case 'SLIKA': prikaz.slika = { src: medijUrl(s.medijId), alt: s.naziv ?? '', stil: stilIsecka(s.isecak) }; break;
    case 'OBLIK': prikaz.oblik = prikazOblika(s, prefiks); break;
    case 'TABELA': prikaz.tabela = prikazTabele(s); break;
    case 'FORMULA': prikaz.formula = prikazFormule(s); break;
    case 'CRTEZ': prikaz.crtez = { src: medijUrl(s.medijId), alt: s.naziv ?? 'Crtež', stil: {} }; break;
  }
  return prikaz;
}

/**
 * Platno sa slojevima (slajd tipa PLATNO), 960 x 540 jedinica, u DOM-u. Domaćin popunjava `uz-platno` okvir 16:9
 * (`container-type: inline-size` je na `uz-okvir`), a `--u` = `100cqw / 960` je jedna jedinica (1 pt PowerPointa).
 * Svaki sloj je `.uz-pl-sloj` (pozicija, veličina, rotacija, providnost, senka, vidljivost za ključ sloja) sa
 * unutrašnjim `.uz-pl-sadrzaj` (sadržaj; njega animira korak napred). Redosled u DOM-u = z-osa. Vidljivost slojeva i
 * pasusa posle koraka daje `stanjeSlojeva`; sakriven sloj zadržava mesto (`visibility: hidden`).
 * Ista komponenta služi projektoru, konzoli i pregledu u editoru; javne (studentske) strane je ne uvoze.
 */
@Component({
  selector: 'app-platno-prikaz',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: { class: 'uz-pl-platno', '[style.background-color]': 'platno().pozadina.boja' },
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
              @if (o.markerKraj || o.markerPocetak) {
                <svg:defs>
                  @if (o.markerKraj; as id) {
                    <svg:marker [attr.id]="id" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="3" markerHeight="3"
                                markerUnits="strokeWidth" orient="auto">
                      <svg:path d="M0,0 L10,5 L0,10 z" [attr.fill]="o.potez" />
                    </svg:marker>
                  }
                  @if (o.markerPocetak; as id) {
                    <svg:marker [attr.id]="id" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="3" markerHeight="3"
                                markerUnits="strokeWidth" orient="auto">
                      <svg:path d="M10,0 L0,5 L10,10 z" [attr.fill]="o.potez" />
                    </svg:marker>
                  }
                </svg:defs>
              }
              @switch (o.vrsta) {
                @case ('linija') {
                  <svg:line [attr.x1]="o.x1" [attr.y1]="o.y1" [attr.x2]="o.x2" [attr.y2]="o.y2" fill="none"
                            [attr.stroke]="o.potez" [attr.stroke-width]="o.debljina" [attr.stroke-dasharray]="o.crtica"
                            [attr.stroke-linecap]="o.zavrsetak"
                            [attr.marker-start]="o.markerPocetak ? 'url(#' + o.markerPocetak + ')' : null"
                            [attr.marker-end]="o.markerKraj ? 'url(#' + o.markerKraj + ')' : null" />
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
                      <td [attr.colspan]="c.colspan" [attr.rowspan]="c.rowspan" [style]="c.stil">
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
              <span class="uz-pl-formula-izvor" [style]="f.stil">{{ f.latex }}</span>
            }
          </div>
        } @else if (s.crtez; as c) {
          <div class="uz-pl-sadrzaj uz-pl-crtez"><img [src]="c.src" [alt]="c.alt"></div>
        }
      </div>
    }

    <ng-template #pasusiT let-pasusi>
      @for (p of asPasusi(pasusi); track p.indeks) {
        <p class="uz-pl-pasus" [attr.data-pasus]="p.kljuc === null ? null : p.indeks" [style]="p.stil"
           [style.visibility]="p.kljuc !== null && skriven(p.kljuc) ? 'hidden' : null">@if (p.oznaka; as o) {<span class="uz-pl-oznaka" [style]="o.stil">{{ o.tekst }}</span>}@for (d of p.delovi; track $index) {<span class="uz-pl-deo" [style]="d.stil">{{ d.tekst }}</span>}</p>
      }
    </ng-template>
  `,
})
export class PlatnoPrikazComponent {
  readonly platno = input.required<Platno>();
  /** Korak izvođenja: odigrane su grupa 0 i grupe 1..korak (`stanjeSlojeva`). */
  readonly korak = input(0);
  /** Animacija prelaza na `korak` (nov `kljuc` = pusti grupu `grupa`); logiku dodaje F4, do tada se crta krajnje stanje. */
  readonly animacija = input<{ kljuc: number; grupa: number } | null>(null);

  /** Id-jevi SVG markera moraju biti jedinstveni u dokumentu (konzola crta trenutni i sledeći slajd). */
  private readonly prefiks = `uz-pl-${++brojacInstanci}`;

  protected readonly url = medijUrl;
  protected readonly slojevi = computed(() => this.platno().slojevi.map((s) => prikazSloja(s, this.prefiks)));
  private readonly vidljivost = computed(() => stanjeSlojeva(this.platno(), this.korak()));

  protected skriven(kljuc: string): boolean {
    return this.vidljivost().get(kljuc) === false;
  }

  /** Tipizacija konteksta `ng-template`-a (šablon ga inače vidi kao `any`). */
  protected asPasusi(pasusi: PrikazPasusa[]): PrikazPasusa[] {
    return pasusi;
  }
}

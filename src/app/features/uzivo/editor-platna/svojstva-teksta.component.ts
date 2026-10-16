// Svojstva teksta (F13): font, veličina (polje 1-400 i meni), boja, B/I/U/S, indeks i eksponent, poravnanje, lista i
// nivo, prored i razmaci pasusa, i raspored u okviru (sidro, margine, prelom reda, smanjenje fonta). Dva načina rada:
// - tokom uređivanja teksta vrednosti su stanje izbora aktivnog uređivača, a komande idu NJEMU (izmena izbora u tekstu,
//   ProseMirror-ova istorija); `mousedown` na dugmadima je `preventDefault`, pa fokus i izbor ostaju u tekstu, a sa
//   tastature komanda ide na sačuvan izbor uređivača i fokus ostaje na kontroli;
// - bez uređivanja (izabran jedan ili više TEKST slojeva) vrednosti su stanje celih slojeva (`stanjeDelova`), a komande
//   menjaju sve njihove pasuse kroz `primeni` (ključ po polju i izboru: isto polje u roku od 1 s je jedan korak).
// Okvir (sidro, margine, prelom, skala) je svojstvo sloja: menja se kroz `primeni` i dok se kuca (tekst se prvo upiše).
// Izabrana tabela (F14): isto, nad pasusima vlasnika u opsegu ćelija (bez izbora ćelija: cela tabela), bez odeljka okvira.
// Panel je van okvira platna, pa prečice platna u njegovim poljima ne rade (odluka 24).
import { InputModalityDetector } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, type MenuCloseReason } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { Celija, Okvir, Pasus, Poravnanje, Sidro, Tema, TekstSloj } from '../data-access/platno.models';
import { zaokruziKaoServer as z } from '../data-access/platno-provera';
import { BrojcanoPoljeComponent } from './brojcano-polje';
import { IzborBojeComponent } from './izbor-boje.component';
import { IzborFontaComponent } from './izbor-fonta.component';
import { izmeniSlojeve } from './komande';
import { PlatnoEditorStore } from './platno-editor.store';
import { izmeniCelije } from './tabela';
import type { PoljeStila } from './tekst/pm-komande';
import type { AtributiDela } from './tekst/pm-sema';
import {
  type StanjeSelekcije, VELICINE_SLOVA, jedna, listaSvima, nivoSvima, pasusSvima, stanjeDelova, stilSvima,
} from './tekst/stil-teksta';

const UKRASI: readonly { polje: PoljeStila; naziv: string; naslov: string; ikona: string }[] = [
  { polje: 'podebljano', naziv: 'Podebljano', naslov: 'Podebljano (Ctrl+B)', ikona: 'format_bold' },
  { polje: 'kurziv', naziv: 'Kurziv', naslov: 'Kurziv (Ctrl+I)', ikona: 'format_italic' },
  { polje: 'podvuceno', naziv: 'Podvučeno', naslov: 'Podvučeno (Ctrl+U)', ikona: 'format_underlined' },
  { polje: 'precrtano', naziv: 'Precrtano', naslov: 'Precrtano', ikona: 'format_strikethrough' },
];
const PORAVNANJA: readonly { v: Poravnanje; naziv: string; ikona: string }[] = [
  { v: 'LEVO', naziv: 'Levo', ikona: 'format_align_left' },
  { v: 'CENTAR', naziv: 'Centar', ikona: 'format_align_center' },
  { v: 'DESNO', naziv: 'Desno', ikona: 'format_align_right' },
  { v: 'OBOSTRANO', naziv: 'Obostrano', ikona: 'format_align_justify' },
];
const SIDRA: readonly { v: Sidro; naziv: string; ikona: string }[] = [
  { v: 'VRH', naziv: 'Vrh', ikona: 'vertical_align_top' },
  { v: 'SREDINA', naziv: 'Sredina', ikona: 'vertical_align_center' },
  { v: 'DNO', naziv: 'Dno', ikona: 'vertical_align_bottom' },
];
type Margina = 'unutraLevo' | 'unutraGore' | 'unutraDesno' | 'unutraDole';
const MARGINE: readonly { polje: Margina; naziv: string }[] = [
  { polje: 'unutraLevo', naziv: 'Margina levo' }, { polje: 'unutraGore', naziv: 'Margina gore' },
  { polje: 'unutraDesno', naziv: 'Margina desno' }, { polje: 'unutraDole', naziv: 'Margina dole' },
];

/** Nove pasuse samo jedinicama (slojevima ili ćelijama) koje `f` menja; `f` bez promene vraća isti niz. */
function poJedinicama<T extends { pasusi: Pasus[] }>(jedinice: readonly T[], f: (pasusi: readonly Pasus[]) => Pasus[]): Map<T, Pasus[]> {
  const m = new Map<T, Pasus[]>();
  for (const j of jedinice) {
    const novi = f(j.pasusi);
    if (novi !== j.pasusi) m.set(j, novi);
  }
  return m;
}
const procenat = (v: number) => `${z(v * 100)}%`.replace('.', ',');

@Component({
  selector: 'app-svojstva-teksta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BrojcanoPoljeComponent, IzborBojeComponent, IzborFontaComponent, MatButtonModule, MatButtonToggleModule, MatIconModule,
    MatMenuModule, MatSlideToggleModule,
  ],
  host: { '(mousedown)': 'pritisak($event)' },
  template: `
    @let st = stanje();
    @let z = zakljucano();
    <h3 class="uz-ep-odeljak">Tekst</h3>
    <app-izbor-fonta [vrednost]="st.font" [onemoguceno]="z" (izbor)="postaviStil({ font: $event }, 'font'); posleIzbora()" />
    <div class="uz-ep-velicina">
      <app-brojcano-polje oznaka="Veličina" jedinica="pt" [vrednost]="st.velicina" [min]="1" [max]="400" [stegni]="false"
                          [onemoguceno]="z" (promena)="postaviStil({ velicina: $event }, 'velicina')" />
      <button #okidacVelicina mat-icon-button type="button" aria-label="Veličine slova" title="Veličine slova" [disabled]="z"
              [matMenuTriggerFor]="meniVelicina" [matMenuTriggerRestoreFocus]="false"><mat-icon svgIcon="expand_more" /></button>
      <mat-menu #meniVelicina="matMenu" (closed)="posleMenija($event)">
        @for (v of velicine; track v) {
          <button mat-menu-item type="button" (click)="postaviStil({ velicina: v }, 'velicina')">{{ v }}</button>
        }
      </mat-menu>
    </div>
    <app-izbor-boje oznaka="Boja teksta" [tema]="tema()" [vrednost]="st.boja" [mesano]="st.boja === null" [onemoguceno]="z"
                    [fokusPosleIzbora]="fokusUTekstMisem" (izbor)="postaviBoju($event)" />
    <div class="uz-ep-dugmad" role="group" aria-label="Stil slova">
      @for (u of ukrasi; track u.polje) {
        <button mat-icon-button type="button" [attr.aria-label]="u.naziv" [title]="uredjuje() ? u.naslov : u.naziv" [disabled]="z"
                [attr.aria-pressed]="pritisnuto(st[u.polje])" (click)="prebaci(u.polje)"><mat-icon [svgIcon]="u.ikona" /></button>
      }
      <button mat-icon-button type="button" aria-label="Indeks" title="Indeks" [disabled]="z"
              [attr.aria-pressed]="prisutno(st.polozaj, st.polozaji, 'INDEKS')"
              (click)="prebaciPolozaj('INDEKS')"><mat-icon svgIcon="subscript" /></button>
      <button mat-icon-button type="button" aria-label="Eksponent" title="Eksponent" [disabled]="z"
              [attr.aria-pressed]="prisutno(st.polozaj, st.polozaji, 'EKSPONENT')"
              (click)="prebaciPolozaj('EKSPONENT')"><mat-icon svgIcon="superscript" /></button>
    </div>

    <h3 class="uz-ep-odeljak">Pasus</h3>
    <mat-button-toggle-group aria-label="Poravnanje" hideSingleSelectionIndicator [value]="st.poravnanje" [disabled]="z"
                             (change)="postaviPasus({ poravnanje: $event.value }, 'poravnanje')">
      @for (p of poravnanja; track p.v) {
        <mat-button-toggle [value]="p.v" [aria-label]="p.naziv" [title]="p.naziv"><mat-icon [svgIcon]="p.ikona" /></mat-button-toggle>
      }
    </mat-button-toggle-group>
    <div class="uz-ep-dugmad" role="group" aria-label="Lista i nivo">
      <button mat-icon-button type="button" aria-label="Lista sa znakovima" title="Lista sa znakovima" [disabled]="z"
              [attr.aria-pressed]="prisutno(st.lista, st.liste, 'ZNAK')"
              (click)="prebaciListu('ZNAK')"><mat-icon svgIcon="format_list_bulleted" /></button>
      <button mat-icon-button type="button" aria-label="Numerisana lista" title="Numerisana lista" [disabled]="z"
              [attr.aria-pressed]="prisutno(st.lista, st.liste, 'BROJ')"
              (click)="prebaciListu('BROJ')"><mat-icon svgIcon="format_list_numbered" /></button>
      <button mat-icon-button type="button" aria-label="Smanji nivo"
              [title]="uredjuje() ? 'Smanji nivo (Shift+Tab na početku stavke)' : 'Smanji nivo'"
              [disabled]="z" (click)="promeniNivo(-1)"><mat-icon svgIcon="format_indent_decrease" /></button>
      <button mat-icon-button type="button" aria-label="Povećaj nivo"
              [title]="uredjuje() ? 'Povećaj nivo (Tab na početku stavke)' : 'Povećaj nivo'"
              [disabled]="z" (click)="promeniNivo(1)"><mat-icon svgIcon="format_indent_increase" /></button>
    </div>
    <div class="uz-ep-polja">
      <app-brojcano-polje oznaka="Prored" jedinica="%" [vrednost]="st.proredProcenat" [min]="50" [max]="300"
                          [onemoguceno]="z" (promena)="postaviPasus({ proredProcenat: $event }, 'prored')" />
      <app-brojcano-polje oznaka="Razmak pre" jedinica="pt" [vrednost]="st.razmakPre" [min]="0" [max]="200"
                          [onemoguceno]="z" (promena)="postaviPasus({ razmakPre: $event }, 'razmak-pre')" />
      <app-brojcano-polje oznaka="Razmak posle" jedinica="pt" [vrednost]="st.razmakPosle" [min]="0" [max]="200"
                          [onemoguceno]="z" (promena)="postaviPasus({ razmakPosle: $event }, 'razmak-posle')" />
    </div>

    @if (okvir(); as o) {
      <h3 class="uz-ep-odeljak">Raspored u okviru</h3>
      <mat-button-toggle-group aria-label="Sidro teksta" hideSingleSelectionIndicator [value]="o.sidro" [disabled]="z"
                               (change)="postaviOkvir({ sidro: $event.value }, 'sidro')">
        @for (s of sidra; track s.v) {
          <mat-button-toggle [value]="s.v" [aria-label]="s.naziv" [title]="s.naziv"><mat-icon [svgIcon]="s.ikona" /></mat-button-toggle>
        }
      </mat-button-toggle-group>
      <div class="uz-ep-polja">
        @for (m of margine; track m.polje) {
          <app-brojcano-polje [oznaka]="m.naziv" [vrednost]="o[m.polje]" [min]="0" [max]="200" [onemoguceno]="z"
                              (promena)="postaviMarginu(m.polje, $event)" />
        }
      </div>
      <mat-slide-toggle [checked]="o.prelom" [disabled]="z" (change)="postaviOkvir({ prelom: $event.checked })">
        Prelom reda
      </mat-slide-toggle>
      @if (o.smanjenje; as smanjenje) {
        <div class="uz-ep-smanjenje">
          <span>Smanjenje fonta: {{ smanjenje }}</span>
          <button mat-stroked-button type="button" [disabled]="z" (click)="vrati100()">Vrati 100%</button>
        </div>
      }
    }
  `,
  styles: `
    :host { display: grid; gap: 8px; }
    .uz-ep-odeljak { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .uz-ep-polja { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
    .uz-ep-velicina { display: flex; align-items: center; gap: 4px; }
    .uz-ep-velicina app-brojcano-polje { flex: 1; }
    .uz-ep-dugmad { display: flex; flex-wrap: wrap; gap: 2px; }
    .uz-ep-dugmad [aria-pressed='true'] { background: var(--primary-soft); color: var(--primary-soft-ink); }
    mat-button-toggle-group { justify-self: start; }
    .uz-ep-smanjenje { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; color: var(--ink-2); }
  `,
})
export class SvojstvaTekstaComponent {
  /** Tema prezentacije (boje palete). */
  readonly tema = input.required<Tema>();

  private readonly store = inject(PlatnoEditorStore);
  private readonly modalitet = inject(InputModalityDetector);
  private readonly okidacVelicina = viewChild.required('okidacVelicina', { read: ElementRef });

  protected readonly velicine = VELICINE_SLOVA;
  protected readonly ukrasi = UKRASI;
  protected readonly poravnanja = PORAVNANJA;
  protected readonly sidra = SIDRA;
  protected readonly margine = MARGINE;

  protected readonly uredjuje = computed(() => this.store.uredjivanje() !== null);
  /** Aktivni uređivač teksta (samo dok traje sesija); null bez uređivanja. */
  private readonly uredjivac = computed(() => (this.store.uredjivanje() ? this.store.aktivniUredjivac() : null));
  private readonly tekstSlojevi = computed(() => this.store.izabraniSlojevi().filter((s): s is TekstSloj => s.tip === 'TEKST'));
  /** Izabrana tabela bez uređivanja (F14): opseg ćelija (ili cela tabela) i vlasnici u njemu, redom. */
  private readonly celije = computed(() => {
    const s = this.store.jedan();
    if (this.store.uredjivanje() || s?.tip !== 'TABELA') return null;
    const o = this.store.opsegCelijaIzbora() ?? { r1: 0, k1: 0, r2: s.redovi.length - 1, k2: s.kolone.length - 1 };
    const vlasnici = s.celije.slice(o.r1, o.r2 + 1).flatMap((red) => red.slice(o.k1, o.k2 + 1)).filter((c) => !c.pokrivena);
    return { id: s.id, o, vlasnici };
  });
  protected readonly stanje = computed<StanjeSelekcije>(
    () => this.uredjivac()?.stanje()
      ?? stanjeDelova((this.celije()?.vlasnici ?? this.tekstSlojevi()).flatMap((s) => s.pasusi)),
  );
  /** Zaključan sloj se ne uređuje (ni tekst ni okvir); uređivanje zaključanog sloja ni ne počinje. */
  protected readonly zakljucano = computed(() => !this.store.uredjivanje() && this.store.izabraniSlojevi().some((s) => s.zakljucan));
  /** Okvir izabranih TEKST slojeva (null = mešano); bez TEKST sloja (npr. ćelija tabele, F14) nema odeljka okvira. */
  protected readonly okvir = computed(() => {
    const slojevi = this.tekstSlojevi();
    if (!slojevi.length) return null;
    const j = <K extends keyof Okvir>(k: K) => jedna(slojevi.map((s) => s.okvir[k]));
    const skala = j('skala');
    const skalaProreda = j('skalaProreda');
    const smanjen = slojevi.some((s) => s.okvir.skala < 1 || s.okvir.skalaProreda < 1);
    return {
      sidro: j('sidro'), unutraLevo: j('unutraLevo'), unutraGore: j('unutraGore'), unutraDesno: j('unutraDesno'),
      unutraDole: j('unutraDole'), prelom: slojevi.every((s) => s.okvir.prelom),
      smanjenje: !smanjen ? null : skala === null || skalaProreda === null ? 'različito'
        : procenat(skala) + (skalaProreda < 1 ? `, prored ${procenat(skalaProreda)}` : ''),
    };
  });

  /** `aria-pressed`: true, false ili "mixed" (deo izbora ima, deo nema). */
  protected pritisnuto(v: boolean | null): 'true' | 'false' | 'mixed' {
    return v === null ? 'mixed' : v ? 'true' : 'false';
  }

  /** `aria-pressed` za vrednost polja sa više vrednosti (položaj, lista): "mixed" samo kad je vrednost PRISUTNA u izboru. */
  protected prisutno<T>(v: T | null, prisutne: readonly T[], vrednost: T): 'true' | 'false' | 'mixed' {
    return v === vrednost ? 'true' : v === null && prisutne.includes(vrednost) ? 'mixed' : 'false';
  }

  /**
   * Posle izbora MIŠEM (font, veličina iz menija, boja) tokom uređivanja fokus se vraća u tekst, kao u PowerPointu; posle
   * izbora tastaturom ostaje na kontroli (komanda je ionako otišla na sačuvan izbor uređivača). true = fokus je u tekstu.
   */
  protected readonly fokusUTekstMisem = (): boolean => {
    const u = this.uredjivac();
    if (!u || this.modalitet.mostRecentModality === 'keyboard') return false;
    u.fokus();
    return true;
  };

  /** Font: `mat-select` posle izbora sinhrono vraća fokus na sebe, pa se fokus u tekst premešta tek posle toga. */
  protected posleIzbora(): void {
    queueMicrotask(() => this.fokusUTekstMisem());
  }

  /**
   * Meni veličina ne vraća fokus sam (`matMenuTriggerRestoreFocus` false): mišem tokom uređivanja u tekst, inače na
   * okidač; Tab pušta fokus dalje.
   */
  protected posleMenija(razlog: MenuCloseReason): void {
    if (razlog === 'tab' || (razlog !== 'keydown' && this.fokusUTekstMisem())) return;
    this.okidacVelicina().nativeElement.focus();
  }

  /** Tokom uređivanja pritisak na dugme ne uzima fokus: fokus i izbor ostaju u tekstu (polja i izbornici ga uzimaju). */
  protected pritisak(e: MouseEvent): void {
    if (this.store.uredjivanje() && (e.target as Element | null)?.closest('button')) e.preventDefault();
  }

  /** Ključ istorije po polju i izboru (bez uređivanja): isto polje istog izbora u roku od 1 s je jedan korak. */
  private kljuc(polje: string): string {
    // tabela (F14): i opseg ćelija, pa isto polje na drugim ćelijama u roku od 1 s nije isti korak
    const o = this.celije()?.o;
    return `tekst-${polje}:${this.store.izbor().join(',')}${o ? `:${o.r1}-${o.k1}-${o.r2}-${o.k2}` : ''}`;
  }

  /**
   * Izmena pasusa izabranih TEKST slojeva, ili vlasnika opsega ćelija izabrane tabele (F14), bez uređivanja. `f` radi po
   * jedinici (sloju ili ćeliji), pa npr. osnova praznog pasusa u `stilSvima` nikad ne dolazi iz drugog sloja; nepromenjena
   * jedinica ostaje ista.
   */
  private slojevima(f: (pasusi: readonly Pasus[]) => Pasus[], polje?: string): void {
    if (this.store.uredjivanje() || this.store.zakljucanUIzboru()) return;
    const kljuc = polje ? this.kljuc(polje) : undefined;
    const t = this.celije();
    if (t) {
      const poCeliji = poJedinicama<Celija>(t.vlasnici, f);
      if (!poCeliji.size) return;
      this.store.primeni((p) => izmeniSlojeve(p, new Set([t.id]), (s) => (s.tip !== 'TABELA' ? s
        : izmeniCelije(s, t.o, (c) => (poCeliji.has(c) ? { ...c, pasusi: poCeliji.get(c)! } : c)))), kljuc);
      return;
    }
    const poSloju = new Map([...poJedinicama<TekstSloj>(this.tekstSlojevi(), f)].map(([s, pasusi]) => [s.id, pasusi]));
    if (!poSloju.size) return;
    this.store.primeni(
      (p) => izmeniSlojeve(p, new Set(poSloju.keys()), (s) => (s.tip === 'TEKST' ? { ...s, pasusi: poSloju.get(s.id)! } : s)),
      kljuc,
    );
  }

  protected postaviStil(izmena: Partial<AtributiDela>, polje: string): void {
    const u = this.uredjivac();
    if (u) u.postaviStil(izmena);
    else this.slojevima((p) => stilSvima(p, izmena), polje);
  }

  protected postaviBoju(boja: string | null): void {
    if (boja) this.postaviStil({ boja }, 'boja');
  }

  /** B/I/U/S: ceo izbor već ima ukras -> isključi, inače (i mešano) uključi. */
  protected prebaci(polje: PoljeStila): void {
    const u = this.uredjivac();
    if (u) u.prebaciStil(polje);
    else this.slojevima((p) => stilSvima(p, { [polje]: this.stanje()[polje] !== true }));
  }

  /** Indeks / eksponent: isti položaj ponovo -> običan. */
  protected prebaciPolozaj(v: 'INDEKS' | 'EKSPONENT'): void {
    const polozaj = this.stanje().polozaj === v ? 'OBICAN' : v;
    const u = this.uredjivac();
    if (u) u.postaviStil({ polozaj });
    else this.slojevima((p) => stilSvima(p, { polozaj }));
  }

  protected postaviPasus(izmena: Partial<Omit<Pasus, 'delovi'>>, polje: string): void {
    const u = this.uredjivac();
    if (u) u.postaviPasus(izmena);
    else this.slojevima((p) => pasusSvima(p, izmena), polje);
  }

  /**
   * Lista: "svi već te vrste" važi za ceo izbor (više slojeva ili ćelija): tada se lista uklanja svima; inače je dobijaju
   * sve jedinice koje je još nemaju (jedinica u kojoj su svi pasusi već te vrste ostaje ista).
   */
  protected prebaciListu(vrsta: 'ZNAK' | 'BROJ'): void {
    const u = this.uredjivac();
    if (u) {
      u.prebaciListu(vrsta);
      return;
    }
    const svi = this.stanje().lista === vrsta;
    this.slojevima((p) => (!svi && p.every((x) => x.lista?.vrsta === vrsta) ? (p as Pasus[]) : listaSvima(p, vrsta)));
  }

  protected promeniNivo(razlika: 1 | -1): void {
    const u = this.uredjivac();
    if (u) u.promeniNivo(razlika);
    else this.slojevima((p) => nivoSvima(p, razlika));
  }

  /** Okvir izabranih TEKST slojeva (i tokom uređivanja: tekst se prvo upiše kao korak, sesija ostaje). */
  protected postaviOkvir(izmena: Partial<Okvir>, polje?: string): boolean {
    if (this.store.zakljucanUIzboru()) return false;
    const ids = new Set(this.tekstSlojevi().map((s) => s.id));
    const kljucevi = Object.keys(izmena) as (keyof Okvir)[];
    return this.store.primeni((p) => izmeniSlojeve(p, ids, (s) => {
      if (s.tip !== 'TEKST' || kljucevi.every((k) => s.okvir[k] === izmena[k])) return s;
      return { ...s, okvir: { ...s.okvir, ...izmena } };
    }), polje ? this.kljuc(polje) : undefined);
  }

  protected postaviMarginu(polje: Margina, v: number): void {
    this.postaviOkvir({ [polje]: v }, polje);
  }

  /**
   * "Vrati 100%": bez smanjenja fonta i proreda (autofit iz PowerPointa). Uređivač drži skalu od početka sesije (šema i
   * dodaci), pa se tokom uređivanja sesija istog sloja zatvara i odmah otvara nova (nov uređivač sa skalom 1).
   */
  protected vrati100(): void {
    const u = this.store.uredjivanje();
    if (!this.postaviOkvir({ skala: 1, skalaProreda: 1 }) || !u || u.celija) return;
    this.store.zavrsiUredjivanje();
    this.store.pocniUredjivanje(u.slojId);
  }
}

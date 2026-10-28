import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { TextFieldModule } from '@angular/cdk/text-field';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  MAX_OPCIJA, MAX_VREME, MIN_OPCIJA, MIN_VREME, PODRAZUMEVANO_VREME, TIPOVI_PITANJA, imaOpcije, promeniTipPitanja,
} from '../data-access/slajd-pravila';
import { OdstupanjeTip, OpcijaCmd, PitanjeCmd, TekstPrikaz, TipPitanja } from '../data-access/uzivo.models';
import { sRecju } from '../../../shared/util/mnozina';
import { UCITAJ_FORMULE } from '../ui/formula-ucitavanje';
import { markdownSaFormulama } from '../ui/markdown';
import { OpcijaOblikComponent, oblikOpcije } from '../ui/opcija-oblik';
import { MAX_FORMULA_U_TEKSTU } from '../ui/tekst-formule.component';
import { KLASA_FORMULE, podeliFormule } from '../ui/tekst-formule';
import { SlikaPoljeComponent } from './slika-polje.component';

/** Validacija pitanja kao čista funkcija (iste poruke kao backend `SlajdPP`); živi u `slajd-pravila.ts`. */
export { greskePitanja } from '../data-access/slajd-pravila';

export type OpcijaForma = FormGroup<{ tekst: FormControl<string>; tacna: FormControl<boolean> }>;

export type PitanjeForma = FormGroup<{
  tip: FormControl<TipPitanja>;
  tekst: FormControl<string>;
  slikaId: FormControl<string | null>;
  ograniceno: FormControl<boolean>;
  vremeSekunde: FormControl<number | null>;
  opcije: FormArray<OpcijaForma>;
  brojTacno: FormControl<number | null>;
  brojOdstupanje: FormControl<number | null>;
  odstupanjeTip: FormControl<OdstupanjeTip>;
  jedinica: FormControl<string>;
  tekstPrikaz: FormControl<TekstPrikaz>;
  prihvatljiviOdgovori: FormControl<string[]>;
  skalaMinOznaka: FormControl<string>;
  skalaMaxOznaka: FormControl<string>;
}>;

const nn = { nonNullable: true } as const;

function opcijaForma(o: OpcijaCmd): OpcijaForma {
  return new FormGroup({ tekst: new FormControl(o.tekst ?? '', nn), tacna: new FormControl(!!o.tacna, nn) });
}

/** Forma iz komande (pri izboru slajda); polja koja tip ne koristi dobijaju podrazumevane vrednosti. */
export function pitanjeForma(p: PitanjeCmd): PitanjeForma {
  return new FormGroup({
    tip: new FormControl(p.tip, nn),
    tekst: new FormControl(p.tekst ?? '', nn),
    slikaId: new FormControl<string | null>(p.slikaId),
    ograniceno: new FormControl(p.vremeSekunde !== null, nn),
    vremeSekunde: new FormControl<number | null>(p.vremeSekunde ?? PODRAZUMEVANO_VREME),
    opcije: new FormArray(p.opcije.map(opcijaForma)),
    brojTacno: new FormControl<number | null>(p.brojTacno),
    brojOdstupanje: new FormControl<number | null>(p.brojOdstupanje ?? 0),
    odstupanjeTip: new FormControl<OdstupanjeTip>(p.odstupanjeTip ?? 'APSOLUTNO', nn),
    jedinica: new FormControl(p.jedinica ?? '', nn),
    tekstPrikaz: new FormControl<TekstPrikaz>(p.tekstPrikaz ?? 'OBLAK', nn),
    prihvatljiviOdgovori: new FormControl<string[]>([...(p.prihvatljiviOdgovori ?? [])], nn),
    skalaMinOznaka: new FormControl(p.skalaMinOznaka ?? '', nn),
    skalaMaxOznaka: new FormControl(p.skalaMaxOznaka ?? '', nn),
  });
}

/** Komanda iz forme: šalju se samo polja koja važe za tip (kao `SlajdPP.normalizuj`). */
export function pitanjeIzForme(f: PitanjeForma): PitanjeCmd {
  const v = f.getRawValue();
  const tip = v.tip;
  const broj = tip === 'BROJ';
  const tekst = tip === 'KRATAK_TEKST';
  const skala = tip === 'SKALA';
  return {
    tip,
    tekst: v.tekst,
    slikaId: v.slikaId,
    // uključeno ograničenje sa praznim poljem je greška (0), ne "bez ograničenja"
    vremeSekunde: v.ograniceno ? (v.vremeSekunde ?? 0) : null,
    opcije: imaOpcije(tip) ? v.opcije.map(o => ({ tekst: o.tekst, tacna: tip !== 'ANKETA' && o.tacna })) : [],
    brojTacno: broj ? v.brojTacno : null,
    brojOdstupanje: broj ? v.brojOdstupanje : null,
    odstupanjeTip: broj ? v.odstupanjeTip : null,
    jedinica: broj ? v.jedinica || null : null,
    tekstPrikaz: tekst ? v.tekstPrikaz : null,
    prihvatljiviOdgovori: tekst ? v.prihvatljiviOdgovori : [],
    skalaMinOznaka: skala ? v.skalaMinOznaka || null : null,
    skalaMaxOznaka: skala ? v.skalaMaxOznaka || null : null,
  };
}

/**
 * Formule jednog teksta tačno kako ih nalazi prikaz (`app-tekst-formule`): tekst pitanja je Markdown
 * (`markdownSaFormulama`, pa `$` u kodu nije formula), opcija običan tekst (`podeliFormule`). Iz Markdown-a se čitaju
 * mesta formula kao u prikazu (`span.uz-formula`, izvor bez `$`); `<template>` je inertan (ništa se ne izvršava ni ne
 * učitava), a `marked` ionako briše sirov HTML.
 */
function formuleTeksta(tekst: string | null | undefined, markdown: boolean): string[] {
  if (!tekst?.includes('$')) {
    return [];
  }
  if (!markdown) {
    return podeliFormule(tekst).flatMap((d) => (d.vrsta === 'FORMULA' ? [d.latex] : []));
  }
  const t = document.createElement('template');
  t.innerHTML = markdownSaFormulama(tekst).html;
  return Array.from(t.content.querySelectorAll(`span.${KLASA_FORMULE}`), (m) => (m.textContent ?? '').slice(1, -1));
}

/** Formule jednog polja: `gde` za poruku "ima više od 50", `uPolju` za poruku o formuli ("u tekstu pitanja"). */
interface FormulePolja { gde: string; uPolju: string; formule: string[] }

/** Tekst pitanja i svaka opcija posebno (prikaz crta svaki tekst svojom komponentom, i granica formula je po tekstu). */
function formulePoTekstu(p: Pick<PitanjeCmd, 'tekst' | 'opcije'>): FormulePolja[] {
  return [
    { gde: 'Tekst pitanja', uPolju: 'tekstu pitanja', formule: formuleTeksta(p.tekst, true) },
    ...p.opcije.map((o, i) => {
      const slovo = oblikOpcije(i).slovo;
      return { gde: `Odgovor ${slovo}`, uPolju: `odgovoru ${slovo}`, formule: formuleTeksta(o.tekst, false) };
    }),
  ];
}

/** Neispravna formula i polja u kojima stoji (redom polja forme), npr. `['tekstu pitanja', 'odgovoru B']`. */
export interface NeispravnaFormula { latex: string; gde: string[] }

/** "tekstu pitanja", "tekstu pitanja i odgovoru B", "tekstu pitanja, odgovoru A i odgovoru C". */
const nabrojano = (delovi: readonly string[]): string =>
  delovi.length < 2 ? (delovi[0] ?? '') : `${delovi.slice(0, -1).join(', ')} i ${delovi.at(-1)}`;

/**
 * Sve formule iz teksta pitanja i opcija, redom, bez duplikata. Po tekstu najviše `MAX_FORMULA_U_TEKSTU` (koliko prikaz
 * crta MathLive-om; ostale su izvor bez obzira na LaTeX, za njih forma ima posebnu poruku), pa provera ne radi više
 * posla od prikaza.
 */
export function formuleIzPitanja(p: Pick<PitanjeCmd, 'tekst' | 'opcije'>): string[] {
  return jedinstvene(formulePoTekstu(p));
}

const jedinstvene = (tekstovi: { formule: string[] }[]): string[] =>
  [...new Set(tekstovi.flatMap((t) => t.formule.slice(0, MAX_FORMULA_U_TEKSTU)))];

/** Polja (redom) u kojima je `latex` među formulama koje prikaz crta (prvih `MAX_FORMULA_U_TEKSTU` po tekstu). */
const poljaFormule = (tekstovi: readonly FormulePolja[], latex: string): string[] =>
  tekstovi.filter((t) => t.formule.slice(0, MAX_FORMULA_U_TEKSTU).includes(latex)).map((t) => t.uPolju);

/** Debounce provere formula posle izmene teksta ili opcija. */
const CEKANJE_PROVERE_FORMULA_MS = 300;
/** Najviše pojedinačnih upozorenja za formule; ostale se samo broje. */
const MAX_UPOZORENJA = 3;
const MAX_ZNAKOVA_U_PORUCI = 60;

const skrati = (latex: string): string =>
  latex.length > MAX_ZNAKOVA_U_PORUCI ? `${latex.slice(0, MAX_ZNAKOVA_U_PORUCI)}…` : latex;

let sledeciId = 0;

/**
 * Polja pitanja (deo forme slajda): tip (promena čuva tekst), tekst, slika, vreme i polja po tipu. Svaka izmena ide kroz
 * `valueChanges` roditeljske forme; strukturne izmene (tip, opcije) emituju jednom, na kraju.
 */
@Component({
  selector: 'app-pitanje-forma',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule, TextFieldModule, MatButtonModule, MatCheckboxModule, MatChipsModule, MatFormFieldModule,
    MatIconModule, MatInputModule, MatRadioModule, MatSelectModule, MatSlideToggleModule, OpcijaOblikComponent,
    SlikaPoljeComponent,
  ],
  template: `
    @let f = forma();
    @let tip = f.controls.tip.value;
    <div class="uz-ed-red">
      <mat-form-field class="uz-ed-polje-tip" subscriptSizing="dynamic">
        <mat-label>Tip pitanja</mat-label>
        <mat-select [value]="tip" (selectionChange)="promeniTip($event.value)">
          @for (t of tipovi; track t.tip) {
            <mat-option [value]="t.tip"><mat-icon [svgIcon]="t.ikona" />{{ t.naziv }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-slide-toggle [formControl]="f.controls.ograniceno" (change)="ogranicenoPromenjeno($event.checked)">
        Ograničeno vreme
      </mat-slide-toggle>
      @if (f.controls.ograniceno.value) {
        <mat-form-field class="uz-ed-polje-kratko" subscriptSizing="dynamic">
          <mat-label>Sekundi</mat-label>
          <input matInput type="number" inputmode="numeric" [min]="minVreme" [max]="maxVreme" step="1"
                 [formControl]="f.controls.vremeSekunde">
        </mat-form-field>
      }
    </div>

    <mat-form-field subscriptSizing="dynamic" class="uz-ed-puno">
      <mat-label>Tekst pitanja</mat-label>
      <textarea matInput cdkTextareaAutosize cdkAutosizeMinRows="2" [formControl]="f.controls.tekst"
                [aria-describedby]="id + '-formule'"></textarea>
      <mat-hint>
        Markdown: **podebljano**, *kurziv*, \`kod\`<br>
        Formula između znakova dolara: $1011_2$, $\\frac&#123;1&#125;&#123;2&#125;$ · znak dolara: \\$
        · odmah posle cifre $ ne otvara formulu (5$, 10$)
      </mat-hint>
    </mat-form-field>
    <!-- Upozorenje ne blokira čuvanje (server ne proverava formule; boja --warn, ne --danger); region postoji uvek, da čitač
         ekrana najavi promenu. -->
    <div [id]="id + '-formule'" role="status">
      @for (u of upozorenjaFormula(); track $index) {
        <p class="uz-ed-upozorenje">{{ u }}</p>
      }
    </div>

    <app-slika-polje [slikaId]="f.controls.slikaId.value" oznaka="Slika uz pitanje"
                     (promena)="f.controls.slikaId.setValue($event?.id ?? null)" />

    @switch (tip) {
      @case ('KRATAK_TEKST') {
        <div class="uz-ed-grupa">
          <span class="uz-ed-oznaka-grupe" [id]="id + '-prikaz'">Rezultati na projektoru</span>
          <mat-radio-group [formControl]="f.controls.tekstPrikaz" [attr.aria-labelledby]="id + '-prikaz'">
            <mat-radio-button value="OBLAK">Oblak reči</mat-radio-button>
            <mat-radio-button value="LISTA">Lista</mat-radio-button>
          </mat-radio-group>
          @if (f.controls.prihvatljiviOdgovori.value.length) {
            <p class="uz-ed-napomena" data-napomena-cipovi>Sa prihvatljivim odgovorima rezultat su uneti odgovori sa brojem učesnika, a posle „Tačno“ označeni ✓ i ✗; oblak i lista važe za pitanje bez tačnog.</p>
          }
        </div>
        <mat-form-field subscriptSizing="dynamic" class="uz-ed-puno">
          <mat-label>Prihvatljivi odgovori</mat-label>
          <mat-chip-grid #lista aria-label="Prihvatljivi odgovori">
            @for (a of f.controls.prihvatljiviOdgovori.value; track $index) {
              <mat-chip-row (removed)="ukloniPrihvatljiv($index)">
                {{ a }}
                <button matChipRemove type="button" [attr.aria-label]="'Ukloni ' + a"><mat-icon svgIcon="cancel" /></button>
              </mat-chip-row>
            }
            <input placeholder="Upiši odgovor i pritisni Enter" [matChipInputFor]="lista"
                   [matChipInputSeparatorKeyCodes]="separatori" (matChipInputTokenEnd)="dodajPrihvatljiv($event)">
          </mat-chip-grid>
          <mat-hint>Tačni su odgovori sa ove liste (bez obzira na velika slova, kvačice i ćirilicu). Prazno = bez tačnog.</mat-hint>
        </mat-form-field>
      }
      @case ('BROJ') {
        <div class="uz-ed-red">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Tačna vrednost</mat-label>
            <input matInput type="number" step="any" [formControl]="f.controls.brojTacno">
            <mat-hint>Prazno = procena, bez tačnog</mat-hint>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Dozvoljeno odstupanje</mat-label>
            <input matInput type="number" min="0" step="any" [formControl]="f.controls.brojOdstupanje">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Odstupanje je</mat-label>
            <mat-select [formControl]="f.controls.odstupanjeTip">
              <mat-option value="APSOLUTNO">apsolutno</mat-option>
              <mat-option value="PROCENAT">u procentima (%)</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field class="uz-ed-polje-kratko">
            <mat-label>Jedinica</mat-label>
            <input matInput [formControl]="f.controls.jedinica" placeholder="npr. kN">
          </mat-form-field>
        </div>
      }
      @case ('SKALA') {
        <div class="uz-ed-red">
          <mat-form-field>
            <mat-label>Oznaka za 1</mat-label>
            <input matInput [formControl]="f.controls.skalaMinOznaka" placeholder="npr. uopšte se ne slažem">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Oznaka za 5</mat-label>
            <input matInput [formControl]="f.controls.skalaMaxOznaka" placeholder="npr. potpuno se slažem">
          </mat-form-field>
        </div>
      }
      @default {
        @let tn = tip === 'TACNO_NETACNO';
        @let radio = tip === 'JEDAN_TACAN' || tn;
        <fieldset class="uz-ed-opcije">
          <legend class="uz-ed-oznaka-grupe">{{ tn ? 'Tačan odgovor' : 'Ponuđeni odgovori' }}</legend>
          @if (!tn) {
            <p class="uz-ed-napomena">Formule važe i u odgovorima: $x^2$.</p>
          }
          @for (o of f.controls.opcije.controls; track o; let i = $index, prva = $first, poslednja = $last) {
            <div class="uz-ed-opcija">
              <app-opcija-oblik [indeks]="i" [velicina]="34" />
              @if (tn) {
                <span class="uz-ed-opcija-tn">{{ o.controls.tekst.value }}</span>
              } @else {
                <mat-form-field class="uz-ed-opcija-tekst" subscriptSizing="dynamic">
                  <mat-label>Odgovor {{ slovo(i) }}</mat-label>
                  <input matInput [formControl]="o.controls.tekst">
                </mat-form-field>
              }
              @if (radio) {
                <mat-radio-button [name]="id + '-tacna'" [checked]="o.controls.tacna.value" (change)="postaviTacnu(i)">
                  Tačan
                </mat-radio-button>
              } @else if (tip === 'VISE_TACNIH') {
                <mat-checkbox [formControl]="o.controls.tacna">Tačan</mat-checkbox>
              }
              @if (!tn) {
                <span class="uz-ed-opcija-dugmad">
                  <button mat-icon-button type="button" [disabled]="prva" (click)="pomeriOpciju(i, -1)"
                          [attr.aria-label]="'Pomeri odgovor ' + slovo(i) + ' gore'"><mat-icon svgIcon="arrow_upward" /></button>
                  <button mat-icon-button type="button" [disabled]="poslednja" (click)="pomeriOpciju(i, 1)"
                          [attr.aria-label]="'Pomeri odgovor ' + slovo(i) + ' dole'"><mat-icon svgIcon="arrow_downward" /></button>
                  <button mat-icon-button type="button" [disabled]="f.controls.opcije.length <= minOpcija"
                          (click)="ukloniOpciju(i)" [attr.aria-label]="'Ukloni odgovor ' + slovo(i)"><mat-icon svgIcon="close" /></button>
                </span>
              }
            </div>
          }
          @if (!tn) {
            <button mat-stroked-button type="button" [disabled]="f.controls.opcije.length >= maxOpcija" (click)="dodajOpciju()">
              <mat-icon svgIcon="add" />Dodaj odgovor
            </button>
          }
          @if (tip === 'ANKETA') {
            <p class="uz-ed-napomena">Anketa nema tačan odgovor; rezultati pokazuju samo raspodelu.</p>
          }
        </fieldset>
      }
    }
  `,
})
export class PitanjeFormaComponent {
  readonly forma = input.required<PitanjeForma>();

  protected readonly id = `uz-pitanje-${sledeciId++}`;
  protected readonly tipovi = TIPOVI_PITANJA;
  protected readonly separatori = [ENTER, COMMA] as const;
  protected readonly minOpcija = MIN_OPCIJA;
  protected readonly maxOpcija = MAX_OPCIJA;
  protected readonly minVreme = MIN_VREME;
  protected readonly maxVreme = MAX_VREME;

  private readonly ucitajFormule = inject(UCITAJ_FORMULE);
  /** Formule (LaTeX bez `$`) koje prikaz ne bi nacrtao (ista provera: `latexUMarkup`, kao `app-tekst-formule`), sa poljima. */
  readonly neispravne = signal<NeispravnaFormula[]>([]);
  /** Tekstovi sa više od `MAX_FORMULA_U_TEKSTU` formula ("Tekst pitanja", "Odgovor B"). */
  protected readonly previseFormula = signal<string[]>([]);
  /** Poruke ispod teksta pitanja: tekstovi preko granice, pa najviše `MAX_UPOZORENJA` formula i "i još n". */
  protected readonly upozorenjaFormula = computed(() => {
    const n = this.neispravne().length - MAX_UPOZORENJA;
    return [
      ...this.previseFormula().map(
        (gde) => `${gde} ima više od ${MAX_FORMULA_U_TEKSTU} formula; ostale će se prikazati kao tekst.`),
      ...this.neispravne().slice(0, MAX_UPOZORENJA).map(
        (n) => `Formula „${skrati(n.latex)}“ u ${nabrojano(n.gde)} ima grešku u LaTeX-u i prikazaće se kao tekst.`),
      ...(n > 0 ? [`i još ${sRecju(n, 'formula', 'formule', 'formula')} sa greškom.`] : []),
    ];
  });
  /** Redni broj poslednje provere: odgovor starije (sporo učitavanje modula) ne prepisuje noviju. */
  private provera = 0;
  /**
   * Modul se nije učitao (mreža, chunk posle novog deploy-a): forma to pamti dok živi, pa sledeće pauze u kucanju ne zovu
   * `import()` ponovo i ne pišu novi `console.warn` (`ucitajFormule` namerno ne pamti odbijanje; prikaz pokušava sam).
   */
  private modulNeuspeo = false;

  constructor() {
    // Nova forma (drugi slajd): stara upozorenja nestaju odmah, nova provera posle debounce-a, pa na svaku izmenu.
    effect((onCleanup) => {
      const f = this.forma();
      this.provera++;
      this.neispravne.set([]);
      this.previseFormula.set([]);
      let tajmer: ReturnType<typeof setTimeout> | undefined;
      const zakazi = () => {
        clearTimeout(tajmer);
        tajmer = setTimeout(() => void this.proveriFormule(f), CEKANJE_PROVERE_FORMULA_MS);
      };
      zakazi();
      const pretplata = f.valueChanges.subscribe(zakazi);
      onCleanup(() => {
        this.provera++;
        clearTimeout(tajmer);
        pretplata.unsubscribe();
      });
    });
  }

  protected slovo(i: number): string {
    return oblikOpcije(i).slovo;
  }

  protected promeniTip(tip: TipPitanja): void {
    const f = this.forma();
    const novo = promeniTipPitanja(pitanjeIzForme(f), tip);
    f.controls.tip.setValue(tip, { emitEvent: false });
    this.postaviOpcije(novo.opcije);
  }

  protected ogranicenoPromenjeno(ukljuceno: boolean): void {
    const v = this.forma().controls.vremeSekunde;
    if (ukljuceno && v.value === null) {
      v.setValue(PODRAZUMEVANO_VREME);
    }
  }

  protected postaviTacnu(indeks: number): void {
    const f = this.forma();
    f.controls.opcije.controls.forEach((o, i) => o.controls.tacna.setValue(i === indeks, { emitEvent: false }));
    f.updateValueAndValidity();
  }

  protected dodajOpciju(): void {
    const opcije = this.forma().controls.opcije;
    if (opcije.length < MAX_OPCIJA) {
      opcije.push(opcijaForma({ tekst: '', tacna: false }));
    }
  }

  protected ukloniOpciju(i: number): void {
    const opcije = this.forma().controls.opcije;
    if (opcije.length > MIN_OPCIJA) {
      opcije.removeAt(i);
    }
  }

  protected pomeriOpciju(i: number, pomak: -1 | 1): void {
    const opcije = this.forma().controls.opcije;
    const j = i + pomak;
    if (j < 0 || j >= opcije.length) return;
    const o = opcije.at(i);
    opcije.removeAt(i, { emitEvent: false });
    opcije.insert(j, o);
  }

  protected dodajPrihvatljiv(e: MatChipInputEvent): void {
    const tekst = (e.value ?? '').trim();
    const c = this.forma().controls.prihvatljiviOdgovori;
    if (tekst && !c.value.includes(tekst)) {
      c.setValue([...c.value, tekst]);
    }
    e.chipInput.clear();
  }

  protected ukloniPrihvatljiv(i: number): void {
    const c = this.forma().controls.prihvatljiviOdgovori;
    c.setValue(c.value.filter((_, j) => j !== i));
  }

  /**
   * Isti put kao prikaz (`app-tekst-formule`): bez formule se ništa ne učitava; inače lenji modul `formula-markup`
   * (`UCITAJ_FORMULE`, `mathlive/ssr` nije u stranici editora) i `latexUMarkup('\\textstyle ' + f)`: zabranjene komande i
   * `^^`, `trosakFormule`, `validateLatex`, konverzija u `try/catch` i sanitizer (keš je zajednički sa pregledom slajda).
   * Ne blokira čuvanje. Greška učitavanja: bez upozorenja, jedan `console.warn` po formi (`modulNeuspeo`).
   */
  private async proveriFormule(f: PitanjeForma): Promise<void> {
    const broj = ++this.provera;
    const tekstovi = formulePoTekstu(pitanjeIzForme(f));
    const previse = tekstovi.filter((t) => t.formule.length > MAX_FORMULA_U_TEKSTU).map((t) => t.gde);
    const formule = jedinstvene(tekstovi);
    let neispravne: NeispravnaFormula[] = [];
    if (formule.length && this.modulNeuspeo) {
      // isto kao prvi neuspeh: bez upozorenja (ni "više od 50"), bez novog import()-a
      this.neispravne.set([]);
      this.previseFormula.set([]);
      return;
    }
    if (formule.length) {
      try {
        const m = await this.ucitajFormule();
        if (broj !== this.provera) {
          return;
        }
        neispravne = formule.filter((l) => m.latexUMarkup(`\\textstyle ${l}`) === null)
          .map((latex) => ({ latex, gde: poljaFormule(tekstovi, latex) }));
      } catch (e: unknown) {
        this.modulNeuspeo = true;
        console.warn('Provera formula nije učitana; upozorenja se ne prikazuju.', e);
        if (broj === this.provera) {
          this.neispravne.set([]);
          this.previseFormula.set([]);
        }
        return;
      }
    }
    this.neispravne.set(neispravne);
    this.previseFormula.set(previse);
  }

  private postaviOpcije(opcije: OpcijaCmd[]): void {
    const f = this.forma();
    const niz = f.controls.opcije;
    niz.clear({ emitEvent: false });
    opcije.forEach(o => niz.push(opcijaForma(o), { emitEvent: false }));
    f.updateValueAndValidity();
  }
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { meriFormule } from './mera-formule';
import { MERA_FORMULE, TekstFormuleComponent } from './tekst-formule.component';

/**
 * Jedan unet odgovor (ili opcija) kao čip: `broj` koliko je učesnika to unelo (0 samo za tačan odgovor koji niko nije uneo),
 * `stanje` `tacno`/`netacno` tek kad je tačan odgovor poznat (`null` pre toga: tabla je neutralna dok razred ne otkrije),
 * `formula` = tekst opcije sme da ima `$formule$` (uneti odgovori studenata nikad), `sakriven` = nastavnik ga je sakrio
 * (samo nastavnički prikazi: javni rezultat sakrivene i nema).
 */
export interface Cip {
  kljuc: string; tekst: string; broj: number; stanje: 'tacno' | 'netacno' | null; formula: boolean; sakriven?: boolean;
}

/** Ostatak iza granice prikaza: koliko različitih odgovora i koliko učesnika ih je unelo. */
export interface OstatakCipova { vrednosti: number; odgovora: number }

/** Tačni prvi (kad su poznati), pa najčešći, pa redosled kojim su stigli (server: po vrednosti ili ključu). */
export function poredjajCipove(cipovi: readonly Cip[]): Cip[] {
  const tezina = (c: Cip) => (c.stanje === 'tacno' ? 0 : 1);
  return cipovi
    .map((c, i) => ({ c, i }))
    .sort((a, b) => tezina(a.c) - tezina(b.c) || b.c.broj - a.c.broj || a.i - b.i)
    .map(x => x.c);
}

/**
 * Najviše `maks` čipova (već poređanih, `poredjajCipove`); tačni se nikad ne odsecaju (i kad ih je više od `maks`), ostatak
 * se sabira u jedan čip "+N drugih (M)". `maks` `null` = bez granice.
 */
export function ograniciCipove(cipovi: readonly Cip[], maks: number | null): { prikazani: Cip[]; ostatak: OstatakCipova | null } {
  if (maks === null || cipovi.length <= maks) {
    return { prikazani: [...cipovi], ostatak: null };
  }
  const tacnih = cipovi.filter(c => c.stanje === 'tacno').length;
  let mesta = Math.max(0, maks - tacnih);
  const prikazani: Cip[] = [];
  const ostali: Cip[] = [];
  for (const c of cipovi) {
    if (c.stanje === 'tacno') {
      prikazani.push(c);
    } else if (mesta > 0) {
      prikazani.push(c);
      mesta--;
    } else {
      ostali.push(c);
    }
  }
  return {
    prikazani,
    ostatak: ostali.length ? { vrednosti: ostali.length, odgovora: ostali.reduce((s, c) => s + c.broj, 0) } : null,
  };
}

/** "+1 drugi", "+3 druga", "+12 drugih", "+21 drugi" (srpski broj uz pridev). */
export function drugih(n: number): string {
  const d = n % 10;
  const s = n % 100;
  const rec = d === 1 && s !== 11 ? 'drugi' : d >= 2 && d <= 4 && (s < 12 || s > 14) ? 'druga' : 'drugih';
  return `+${n} ${rec}`;
}

/**
 * Uneti odgovori kao čipovi u redu koji se prelama (`198 · 199 (2) · 51`): broj u zagradi tek kad je više od jednog, "niko"
 * za tačan odgovor koji niko nije uneo; tačan zelen sa ✓, netačan sa ✗ (znak i skriveni tekst za čitač, ne samo boja).
 * Zajednički za Zadatak slajd (`app-zadatak-rezultat`) i pitanja sa slobodnim unosom (`app-rezultat-prikaz`). Veličina se
 * nasleđuje; roditelj sme da poveća tačan čip promenljivom `--uz-co-tacno-f` (npr. `1.3em` na projektoru).
 */
@Component({
  selector: 'app-cipovi-odgovora',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // nastavnički prikaz: formula šira od okvira se smanjuje (telefon nema ovaj provajder: skrol u sebi)
  providers: [{ provide: MERA_FORMULE, useValue: meriFormule }],
  imports: [TekstFormuleComponent],
  host: { class: 'uz-co' },
  // u komponenti (lenji chunkovi projektora, konzole i pregleda), ne u globalnom `uzivo-tokeni.css` (početni paket)
  styles: `
    :host { display: block; }
    .uz-co-cipovi {
      display: flex; flex-wrap: wrap; align-items: baseline; justify-content: var(--uz-co-poravnanje, flex-start);
      gap: 0.3em 0.45em; margin: 0.15em 0 0; padding: 0; list-style: none;
    }
    .uz-co-cip {
      display: inline-flex; align-items: baseline; gap: 0.25em; max-width: 100%; box-sizing: border-box; padding: 0.05em 0.45em;
      border: 1px solid var(--line); border-radius: 0.35em; background: var(--surface-2); font-weight: 600;
      font-variant-numeric: tabular-nums; overflow-wrap: anywhere;
    }
    .uz-co-cip-broj { color: var(--muted); font-weight: 500; }
    .uz-co-cip--tacno { border-color: var(--ok); background: var(--ok-soft); font-weight: 800; font-size: var(--uz-co-tacno-f, 1em); }
    .uz-co-cip--tacno .uz-co-znak { color: var(--ok); }
    .uz-co-cip--netacno { border-color: var(--danger); background: var(--danger-soft); }
    .uz-co-cip--netacno .uz-co-znak { color: var(--danger); }
    .uz-co-cip--sakriven { opacity: 0.55; text-decoration: line-through; }
    .uz-co-cip--ostatak { border-style: dashed; background: transparent; color: var(--muted); font-weight: 500; }
  `,
  template: `
    <ul class="uz-co-cipovi">
      @for (c of prikaz().prikazani; track c.kljuc) {
        <li class="uz-co-cip" [class.uz-co-cip--tacno]="c.stanje === 'tacno'" [class.uz-co-cip--netacno]="c.stanje === 'netacno'"
            [class.uz-co-cip--sakriven]="c.sakriven">
          @if (c.stanje === 'tacno') { <span class="uz-co-znak" aria-hidden="true">✓</span><span class="uz-sr">tačno: </span> }
          @if (c.stanje === 'netacno') { <span class="uz-co-znak" aria-hidden="true">✗</span><span class="uz-sr">netačno: </span> }
          <span class="uz-co-cip-tekst">@if (c.formula) { <app-tekst-formule class="uz-co-formula" [tekst]="c.tekst" /> } @else { {{ c.tekst }} }</span>
          @if (c.broj > 1) {
            <span class="uz-co-cip-broj">({{ c.broj }})</span>
          } @else if (c.broj === 0) {
            <span class="uz-co-cip-broj">niko</span>
          }
          @if (c.sakriven) { <span class="uz-sr">, sakriveno</span> }
        </li>
      }
      @if (prikaz().ostatak; as o) {
        <!-- razmak kao tekst: Angular briše čvor sa samim razmakom između dva elementa -->
        <li class="uz-co-cip uz-co-cip--ostatak">{{ drugih(o.vrednosti) }}{{ ' ' }}<span class="uz-co-cip-broj" aria-hidden="true">({{ o.odgovora }})</span><span class="uz-sr">, {{ o.odgovora }} odgovora</span></li>
      }
    </ul>
  `,
})
export class CipoviOdgovoraComponent {
  /** Već poređani čipovi (`poredjajCipove`). */
  readonly cipovi = input.required<readonly Cip[]>();
  /** Najviše toliko čipova, ostatak u jednom "+N drugih (M)"; `null` = svi. */
  readonly maks = input<number | null>(null);

  protected readonly drugih = drugih;
  protected readonly prikaz = computed(() => ograniciCipove(this.cipovi(), this.maks()));
}

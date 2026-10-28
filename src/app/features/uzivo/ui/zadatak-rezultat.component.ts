import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RezultatPolja, RezultatVarijante, ZadatakRezultat, medijUrl } from '../data-access/uzivo.models';
import { Cip, CipoviOdgovoraComponent, poredjajCipove } from './cipovi-odgovora.component';
import { tacanBroj } from './format';
import { meriFormule } from './mera-formule';
import { MERA_FORMULE, TekstFormuleComponent } from './tekst-formule.component';

/** Kolone mreže kartica po broju varijanti: do 4 dve, do 9 tri, inače četiri. */
export function kolone(n: number): 2 | 3 | 4 {
  return n <= 4 ? 2 : n <= 9 ? 3 : 4;
}

/**
 * Tačan odgovor polja kao tekst za prikaz: BROJ vrednost sa jedinicom (sve decimale, bez zaokruživanja), TEKST prihvatljivi odgovori spojeni zarezom,
 * JEDAN_TACAN tekst izabrane opcije, VISE_TACNIH tekstovi tačnih opcija (redom opcija) spojeni zarezom. Tekst opcije sme da
 * ima `$formule$` (prikaz ga crta kroz `app-tekst-formule`). Bez `tacno` (još nije prikazano) prazan tekst.
 */
export function tacnoTekst(p: RezultatPolja): string {
  const t = p.tacno;
  if (!t) return '';
  switch (p.tip) {
    case 'BROJ':
      return t.broj === null ? '' : tacanBroj(t.broj) + (p.jedinica ? ' ' + p.jedinica : '');
    case 'TEKST':
      return (t.prihvatljivi ?? []).join(', ');
    case 'JEDAN_TACAN':
      return (p.opcije ?? []).find(o => o.id === t.tacna)?.tekst ?? '';
    case 'VISE_TACNIH': {
      const tacne = t.tacne ?? [];
      return (p.opcije ?? []).filter(o => tacne.includes(o.id)).map(o => o.tekst ?? '').filter(x => x !== '').join(', ');
    }
  }
}

/**
 * Oznaka polja se prikazuje samo kad varijanta ima više polja: kod jednog polja "a) binarni zapis" ništa ne znači (oznake iz
 * starih šema i snimaka rundi često počinju slovom liste), pa se izostavlja na tabli i u pregledu.
 */
export function oznakaVidljiva(v: Pick<RezultatVarijante, 'polja'>): boolean {
  return v.polja.length > 1;
}

export type { Cip } from './cipovi-odgovora.component';

/**
 * Čipovi polja: unete vrednosti (BROJ i TEKST, grupisane na serveru) ili opcije sa bar jednim glasom, najčešće prve. Kad je
 * tačan odgovor poznat (`tacno`), tačni idu prvi, a kad ga niko nije uneo, dodaje se čip tačnog odgovora sa brojem 0 (tačna
 * vrednost se nikad ne gubi iza netačnih). Bez prikazanih odgovora (`vrednosti` `null`, opcije sa 0) prazna lista.
 */
export function cipoviPolja(p: RezultatPolja): Cip[] {
  const poznato = p.tacno !== null;
  const stanje = (tacan: boolean | null) => (!poznato ? null : tacan === true ? 'tacno' : 'netacno');
  const cipovi: Cip[] = p.opcije
    ? p.opcije
      .filter(o => o.broj > 0 || (poznato && o.tacna === true))
      .map(o => ({ kljuc: String(o.id), tekst: o.tekst ?? '', broj: o.broj, stanje: stanje(o.tacna), formula: true }))
    : (p.vrednosti ?? []).map(t => ({
      kljuc: t.kljuc, tekst: t.tekst + (p.tip === 'BROJ' && p.jedinica ? ' ' + p.jedinica : ''), broj: t.broj,
      stanje: stanje(t.tacan), formula: false,
    }));
  if (!p.opcije && poznato && !cipovi.some(c => c.stanje === 'tacno')) {
    const t = tacnoTekst(p);
    if (t && p.vrednosti) cipovi.push({ kljuc: '\u0000tacno', tekst: t, broj: 0, stanje: 'tacno', formula: false });
  }
  return poredjajCipove(cipovi);
}

/**
 * Kako kartica izgleda: `sve` (pregled izvođenja: slike, brojevi, tačno i čipovi), `resenje` (tabla uz rešenje ili samo
 * tačan odgovor: slike zadatka i rešenja i red "tačno", bez čipova) i `odgovori` (tabla uz prikazane odgovore bez rešenja:
 * samo uneti brojevi, krupno, bez slika).
 */
export type PrikazZadatka = 'sve' | 'resenje' | 'odgovori';

interface PoljeKartice {
  kljuc: string; oznaka: string | null; cipovi: Cip[] | null; tacno: string;
}

interface Kartica {
  id: number; naziv: string; svgId: string; resenjeSvgId: string | null; brojevi: string | null; polja: PoljeKartice[];
}

function poljeKartice(p: RezultatPolja, v: RezultatVarijante, prikazani: boolean): PoljeKartice {
  return {
    kljuc: p.kljuc, oznaka: oznakaVidljiva(v) ? p.oznaka : null, cipovi: prikazani ? cipoviPolja(p) : null,
    tacno: tacnoTekst(p),
  };
}

/**
 * Rezultat Zadatak runde po varijanti, u mreži kartica (2-4 kolone, `kolone`). Tri prekidača projektora su nezavisna, pa
 * kartica crta samo ono što rezultat nosi (server javni rezultat pravi po pravilima vidljivosti: bez prikazanih odgovora su
 * brojevi 0 i `vrednosti` `null`, bez `TACAN` nema `tacnih` ni `tacno`, bez `RESENJE` nema `resenjeSvgId`), a `prikaz` bira
 * slučaj upotrebe (`PrikazZadatka`). Uneti odgovori su čipovi u jednom redu koji se prelama (`198 · 199 (2) · 51`, broj u
 * zagradi tek kad je više od jednog), tačan prvi i istaknut kad je poznat. Oznaka polja samo kad varijanta ima više polja
 * (`oznakaVidljiva`). Imena učesnika rezultat ne nosi. Slike su SVG iz `api/public/mediji` na beloj podlozi (zadatak je crn
 * na providnoj pozadini, pa na tamnoj temi ne bi bio čitljiv). Isti sastojak koristi pregled izvođenja.
 */
@Component({
  selector: 'app-zadatak-rezultat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // nastavnički prikaz: formula šira od okvira se smanjuje (telefon nema ovaj provajder: skrol u sebi)
  providers: [{ provide: MERA_FORMULE, useValue: meriFormule }],
  imports: [CipoviOdgovoraComponent, TekstFormuleComponent],
  host: { class: 'uz-zr', '[attr.data-prikaz]': 'prikaz()' },
  // u komponenti (lenji chunkovi), ne u globalnom `uzivo-tokeni.css`: početni paket je na granici budžeta `e2e/lenji-editor.spec.ts`.
  // Osnova je mreža prirodne visine (pregled izvođenja); na projektoru (host dobija klasu `uz-zad-rezultat`) mreža puni ostatak
  // platna, redovi su jednake visine, a slike dele visinu kartice. Veličine na projektoru su u `cqw` (platno), pa nisu u osnovi.
  styles: `
    :host { display: block; }
    .uz-zr-mreza {
      display: grid; grid-template-columns: repeat(var(--uz-kolone, 2), minmax(0, 1fr)); gap: 0.8em; margin: 0; padding: 0;
      list-style: none;
    }
    .uz-zr-kartica {
      display: flex; flex-direction: column; gap: 0.4em; min-width: 0; min-height: 0; overflow: hidden; box-sizing: border-box;
      padding: 0.6em; border: 1px solid var(--line); border-radius: 0.6em; background: var(--surface); color: var(--ink);
      line-height: 1.25;
    }
    /* jedna varijanta zauzima ceo red, ne pola (kolone(1) je 2) */
    .uz-zr-kartica:only-child { grid-column: 1 / -1; }
    .uz-zr-slike { display: flex; flex-direction: column; gap: 0.4em; }
    .uz-zr-slika { display: block; width: 100%; max-height: 16em; object-fit: contain; border-radius: 0.4em; background: var(--surface); }
    .uz-zr-resenje { position: relative; display: flex; margin: 0; }
    .uz-zr-natpis {
      position: absolute; top: 0; left: 0; padding: 0 0.6em; border-radius: 0.3em; background: var(--ok); color: var(--ok-ink);
      font-size: 0.85em; font-weight: 700;
    }
    .uz-zr-naziv { margin: 0; color: var(--muted); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .uz-zr-brojevi { color: var(--muted); font-variant-numeric: tabular-nums; }
    .uz-zr-polje { min-height: 0; overflow: hidden; }
    .uz-zr-oznaka { color: var(--muted); font-weight: 600; overflow-wrap: anywhere; }
    .uz-zr-tacno { margin: 0.1em 0 0.25em; font-weight: 600; }
    .uz-zr-prazno { color: var(--muted); }

    :host(.uz-zad-rezultat) .uz-zr-mreza { position: absolute; inset: 0; grid-auto-rows: minmax(0, 1fr); gap: 1.2cqw; }
    :host(.uz-zad-rezultat) .uz-zr-kartica { gap: 0.5cqw; padding: 0.8cqw; border-radius: 1cqw; font-size: 1.7cqw; }
    :host(.uz-zad-rezultat) .uz-zr-mreza[data-kolone="3"] .uz-zr-kartica { font-size: 1.4cqw; }
    :host(.uz-zad-rezultat) .uz-zr-mreza[data-kolone="4"] .uz-zr-kartica { font-size: 1.15cqw; }
    /* slike (zadatak, rešenje ispod njega) dele visinu kartice; polja ispod ih ne mogu pojesti do kraja (min-height) */
    :host(.uz-zad-rezultat) .uz-zr-slike { flex: 1 1 0; min-height: 40%; gap: 0.5cqw; }
    :host(.uz-zad-rezultat) .uz-zr-slika { flex: 1 1 0; min-height: 0; max-height: none; border-radius: 0.5cqw; }
    :host(.uz-zad-rezultat) .uz-zr-resenje { flex: 1 1 0; min-height: 0; }

    /* tabla, prikazani odgovori: samo brojevi, krupno. Tačan čip je prvi u redu, pa ga prelivanje kartice ne odseca. */
    /* veličina = manja od one po koloni (širina kartice) i one po redovima (visina): 4 varijante sa po ~6 vrednosti staju */
    :host(.uz-zad-rezultat[data-prikaz="odgovori"]) .uz-zr-mreza { --uz-f-k: 3cqw; --uz-f-r: 3cqw; }
    :host(.uz-zad-rezultat[data-prikaz="odgovori"]) .uz-zr-mreza[data-kolone="3"] { --uz-f-k: 2.3cqw; }
    :host(.uz-zad-rezultat[data-prikaz="odgovori"]) .uz-zr-mreza[data-kolone="4"] { --uz-f-k: 1.8cqw; }
    :host(.uz-zad-rezultat[data-prikaz="odgovori"]) .uz-zr-mreza[data-redova="2"] { --uz-f-r: 2.4cqw; }
    :host(.uz-zad-rezultat[data-prikaz="odgovori"]) .uz-zr-mreza[data-redova="3"] { --uz-f-r: 1.9cqw; }
    :host(.uz-zad-rezultat[data-prikaz="odgovori"]) .uz-zr-mreza[data-redova="4"] { --uz-f-r: 1.3cqw; }
    :host(.uz-zad-rezultat[data-prikaz="odgovori"]) .uz-zr-mreza[data-redova="5"] { --uz-f-r: 1.05cqw; }
    :host(.uz-zad-rezultat[data-prikaz="odgovori"]) .uz-zr-kartica { font-size: min(var(--uz-f-k), var(--uz-f-r)); gap: 0.6cqw; }
    :host(.uz-zad-rezultat[data-prikaz="odgovori"]) .uz-zr-kartica:only-child { font-size: 4.5cqw; }
    :host(.uz-zad-rezultat[data-prikaz="odgovori"]) .uz-zr-naziv,
    :host(.uz-zad-rezultat[data-prikaz="odgovori"]) .uz-zr-oznaka { font-size: 0.5em; }
    :host(.uz-zad-rezultat[data-prikaz="odgovori"]) { --uz-co-tacno-f: 1.3em; }
    :host(.uz-zad-rezultat[data-prikaz="odgovori"]) .uz-zr-prazno-sve {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 3cqw;
    }
  `,
  template: `
    @let rezim = prikaz();
    <ul class="uz-zr-mreza" [attr.data-kolone]="brojKolona()" [attr.data-redova]="brojRedova()" [style.--uz-kolone]="brojKolona()">
      @for (k of kartice(); track k.id) {
        <li class="uz-zr-kartica" [attr.data-varijanta]="k.id">
          @if (rezim === 'odgovori') {
            <p class="uz-zr-naziv">{{ k.naziv }}</p>
          } @else {
            <div class="uz-zr-slike">
              <img class="uz-zr-slika rezim-dan" [src]="url(k.svgId)" [alt]="'Zadatak, varijanta ' + k.naziv">
              @if (k.resenjeSvgId; as r) {
                <figure class="uz-zr-resenje">
                  <img class="uz-zr-slika rezim-dan" [src]="url(r)" [alt]="'Rešenje, varijanta ' + k.naziv">
                  <figcaption class="uz-zr-natpis" aria-hidden="true">Rešenje</figcaption>
                </figure>
              }
            </div>
            @if (k.brojevi) { <p class="uz-zr-brojevi">{{ k.brojevi }}</p> }
          }
          @for (p of k.polja; track p.kljuc) {
            @let cipovi = rezim === 'resenje' ? null : p.cipovi;
            @let tacno = rezim === 'odgovori' ? '' : p.tacno;
            @if (cipovi || tacno) {
              <div class="uz-zr-polje" [attr.data-polje]="p.kljuc">
                @if (p.oznaka) { <p class="uz-zr-oznaka">{{ p.oznaka }}</p> }
                @if (tacno) {
                  <p class="uz-zr-tacno"><span class="uz-tacno-znak"><span aria-hidden="true">✓ </span>tačno:</span>{{ ' ' }}<app-tekst-formule class="uz-zr-formula" [tekst]="tacno" /></p>
                }
                @if (cipovi) {
                  @if (cipovi.length) {
                    <app-cipovi-odgovora [cipovi]="cipovi" />
                  } @else {
                    <p class="uz-zr-prazno">Još nema odgovora.</p>
                  }
                }
              </div>
            }
          }
        </li>
      }
    </ul>
    @if (rezim === 'odgovori' && !kartice().length) {
      <p class="uz-zr-prazno uz-zr-prazno-sve">Još nema odgovora.</p>
    }
  `,
})
export class ZadatakRezultatComponent {
  readonly rezultat = input.required<ZadatakRezultat>();
  /** Slučaj upotrebe (`PrikazZadatka`); pregled izvođenja ostaje na `sve`, tablu bira `app-zadatak-prikaz`. */
  readonly prikaz = input<PrikazZadatka>('sve');

  protected readonly url = medijUrl;
  protected readonly brojKolona = computed(() => kolone(this.kartice().length));
  protected readonly brojRedova = computed(() => Math.min(5, Math.ceil(this.kartice().length / this.brojKolona())));

  protected readonly kartice = computed<Kartica[]>(() => {
    const r = this.rezultat();
    const odgovori = this.prikaz() === 'odgovori';
    return r.varijante.flatMap((v, i) => {
      const papir = v.polja.length === 0;
      // tabla sa odgovorima: varijanta koju niko nije rešio (ili rad na papiru) nema šta da pokaže
      if (odgovori && (papir || v.odgovorilo === 0)) return [];
      let brojevi: string | null = null;
      if (r.odgovoriPrikazani) {
        brojevi = papir ? `dodeljeno ${v.dodeljeno} · rad na papiru`
          : `dodeljeno ${v.dodeljeno} · odgovorilo ${v.odgovorilo}` + (v.tacnih !== null ? ` · tačno ${v.tacnih}` : '');
      }
      return [{
        id: v.varijantaId, naziv: v.naziv ?? `V${i + 1}`, svgId: v.svgId, resenjeSvgId: v.resenjeSvgId, brojevi,
        polja: v.polja.map(p => poljeKartice(p, v, r.odgovoriPrikazani)),
      }];
    });
  });
}

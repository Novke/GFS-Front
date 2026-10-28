import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Faza, NastavnickiZadatak, SlajdDetails, medijUrl } from '../data-access/uzivo.models';
import type { TajmerUlaz } from './slajd-prikaz.component';
import { TajmerComponent } from './tajmer.component';
import { PrikazZadatka, ZadatakRezultatComponent } from './zadatak-rezultat.component';

/**
 * Zadatak slajd na platnu 16:9 (projektor, umanjeni prikaz u konzoli): zaglavlje "Zadatak" sa nazivom grupe, tajmerom i,
 * uz prekidač rezultata (Space), "Odgovorilo x od y"; ispod njega uputstvo po fazi (CEKA, OTVORENO i zatvorena runda dok ništa nije prikazano; bez broja varijanti) ili, kad
 * snimak nosi `javniRezultat` (bar jedan od tri nezavisna prekidača: rezultati, `TACAN`, `RESENJE`) i runda je zatvorena, mreža
 * `app-zadatak-rezultat` (dok se odgovara, tabla ne pokazuje šta je ko odgovorio) u jednom od dva prikaza (`prikazRezultata`).
 * Čita **samo** `javniRezultat`: nastavnički `rezultat` i `varijante` (sa id-jevima svih rešenja i tačnim vrednostima) se ovde
 * ne crtaju, pa slika rešenja ne postoji u DOM-u (ni zahtev na nju) dok nastavnik
 * ne uključi `RESENJE`. Imena učesnika se ne prikazuju. Bez stanja izvođenja (`zadatak` je `null`, npr. pregled u editoru i panel "Sledeće") statična kartica sa opisom
 * sa slajda: naziv grupe i "Različitih: N" (prazno = sve). Uz `primer` (samo editor: pregled i sličice) i `primerSvgId` sa servera
 * kartica umesto toga pokazuje sliku jedne varijante, da se odmah vidi kakav je zadatak. Konzola (panel "Sledeće") ga ne
 * uključuje: njen ekran se često deli na projektor, a razred zadatak vidi tek na telefonu.
 */
@Component({
  selector: 'app-zadatak-prikaz',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TajmerComponent, ZadatakRezultatComponent],
  host: { class: 'uz-zad', '[attr.data-faza]': 'faza()' },
  // u komponenti (lenji chunkovi projektora, konzole i editora), ne u globalnom `uzivo-tokeni.css`: početni paket je na granici
  // budžeta `e2e/lenji-editor.spec.ts`, a ove stilove telefon i ostatak aplikacije ne trebaju
  styles: `
    /* prilagođeni element je podrazumevano inline, a u platnu (kolona) puni preostalu visinu */
    :host { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 1.8cqw; }
    .uz-zad-zaglavlje { display: flex; align-items: center; gap: 2cqw; }
    .uz-zad-naslovi { flex: 1; min-width: 0; }
    .uz-zad-grupa { margin-top: 0.4cqw; font-size: 2.6cqw; font-weight: 600; line-height: 1.2; color: var(--muted); overflow-wrap: anywhere; }
    .uz-zad-odgovori { flex: none; font-size: 1.9cqw; color: var(--muted); }
    .uz-zad-odgovori strong { color: var(--ink); font-size: 1.35em; font-variant-numeric: tabular-nums; }
    .uz-zad-opis { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; text-align: center; }
    .uz-zad-broj { font-size: 6.5cqw; font-weight: 700; line-height: 1.15; }
    /* mreža rezultata puni ostatak (apsolutno u okviru): redovi su jednake visine bez obzira na sadržaj kartica */
    .uz-zad-rezultat { position: relative; flex: 1 1 0; min-height: 0; }
    /* primer u editoru: SVG je crn tekst bez pozadine, pa uvek na dnevnoj podlozi (\`rezim-dan\` na slici, i na tamnoj temi) */
    .uz-zad-primer { flex: 1 1 0; min-height: 0; margin: 0; display: flex; flex-direction: column; align-items: center; gap: 1cqw; }
    .uz-zad-primer-slika {
      flex: 1 1 0; min-height: 0; max-width: 100%; object-fit: contain; padding: 1.2cqw; border-radius: 0.8cqw;
      background: var(--surface);
    }
    .uz-zad-primer-opis { font-size: 1.8cqw; color: var(--muted); }
  `,
  template: `
    @if (zadatak(); as z) {
      <header class="uz-zad-zaglavlje">
        <div class="uz-zad-naslovi">
          <h1 class="uz-slajd-naslov">Zadatak</h1>
          <p class="uz-zad-grupa">{{ grupa() }}</p>
        </div>
        @if (odgovorilo(); as o) {
          <span class="uz-zad-odgovori" data-odgovorilo>Odgovorilo <strong>{{ o.broj }}</strong> od <strong>{{ o.od }}</strong></span>
        }
        @if (aktivanTajmer(); as t) {
          <app-tajmer class="uz-slajd-tajmer" [rokMs]="t.rokMs" [preostaloMs]="t.preostaloMs" [sat]="t.sat" [ukupnoMs]="ukupnoMs()" />
        }
      </header>
      @if (karticeVidljive() && z.javniRezultat; as r) {
        <app-zadatak-rezultat class="uz-zad-rezultat" [rezultat]="r" [prikaz]="prikazRezultata()" />
      } @else {
        <div class="uz-zad-opis" data-zadatak><p class="uz-zad-broj">{{ uputstvo() }}</p></div>
      }
    } @else if (primerSvg(); as svg) {
      <header class="uz-zad-zaglavlje">
        <div class="uz-zad-naslovi">
          <h1 class="uz-slajd-naslov">Zadatak</h1>
          <p class="uz-zad-grupa">{{ grupa() }}</p>
        </div>
      </header>
      <figure class="uz-zad-primer" data-primer>
        <img class="uz-zad-primer-slika rezim-dan" [src]="url(svg)" [alt]="'Primer zadatka: ' + grupa()" loading="lazy">
        <figcaption class="uz-zad-primer-opis">Primer jedne varijante · različitih: {{ slajd().zadatak?.brojVarijanti ?? 'sve' }}</figcaption>
      </figure>
    } @else {
      <h1 class="uz-slajd-naslov">Zadatak</h1>
      <div class="uz-slajd-telo">
        <div class="uz-md uz-slajd-md" data-zadatak>
          <p>{{ grupa() }}</p>
          <p>Različitih: {{ slajd().zadatak?.brojVarijanti ?? 'sve' }}</p>
        </div>
      </div>
    }
  `,
})
export class ZadatakPrikazComponent {
  readonly slajd = input.required<SlajdDetails>();
  /** Nastavnički snimak Zadatak slajda; `null` bez stanja izvođenja. */
  readonly zadatak = input<NastavnickiZadatak | null>(null);
  readonly faza = input<Faza | null>(null);
  readonly brojOdgovora = input<number | null>(null);
  /** Imenilac "Odgovorilo x od y" (učesnici povezani ili koji su već odgovorili, kao u konzoli); `null` bez runde. */
  readonly odgovoriliOd = input<number | null>(null);
  /** Prekidač "rezultati" (Space): pali "Odgovorilo x od y", a posle zatvaranja i kartice rezultata. */
  readonly prikaziRezultat = input<boolean>(false);
  readonly tajmer = input<TajmerUlaz | null>(null);
  /** Editor: bez stanja izvođenja prikaži sliku primera (`ZadatakSlajdaInfo.primerSvgId`) umesto opisa. */
  readonly primer = input<boolean>(false);

  protected readonly url = medijUrl;
  protected readonly primerSvg = computed(() => (this.primer() && !this.zadatak() ? this.slajd().zadatak?.primerSvgId ?? null : null));

  /** Opis sa slajda (kad je grupa obrisana, naziv je `null`); u stanju isti opis stiže u `zadatak.slajd`. */
  private readonly opis = computed(() => this.zadatak()?.slajd ?? this.slajd().zadatak ?? null);
  protected readonly grupa = computed(() => {
    const o = this.opis();
    return o?.grupaNaziv ?? (o && o.grupaId !== null ? 'Grupa zadataka' : 'Grupa nije izabrana');
  });
  /**
   * Uputstvo za tablu po fazi. Broj izvučenih varijanti se ne prikazuje (studentima ne znači ništa); nastavnik ga vidi u panelu
   * konzole ("Različitih: N od M").
   */
  protected readonly uputstvo = computed(() => {
    switch (this.faza() ?? 'CEKA') {
      case 'CEKA': return 'Zadatak stiže na telefone';
      case 'OTVORENO': return 'Svako ima svoj zadatak na telefonu';
      case 'ZATVORENO': return 'Odgovaranje je završeno';
    }
  });
  /** "Odgovorilo x od y" samo uz prekidač rezultata (Space), da nastavnik bira kad razred vidi koliko je odgovorilo. */
  protected readonly odgovorilo = computed(() => {
    const broj = this.brojOdgovora();
    return this.prikaziRezultat() && broj !== null ? { broj, od: Math.max(this.odgovoriliOd() ?? 0, broj) } : null;
  });
  /**
   * Kartice rezultata tek posle zatvaranja: dok je runda otvorena (još se odgovara) tabla uz Space pokazuje samo koliko je
   * odgovorilo, ne i šta.
   */
  protected readonly karticeVidljive = computed(() => this.faza() === 'ZATVORENO');
  /**
   * Dva odvojena slučaja table: uz prikazane odgovore (Space) bez rešenja samo uneti brojevi, krupno (`odgovori`); uz rešenje
   * (Shift+R) ili samo tačan odgovor (C bez Space) slike zadatka i rešenja i red "tačno" (`resenje`). Kad su uključeni i
   * odgovori i rešenje, rešenje ima prednost, a gašenjem rešenja tabla se vraća na odgovore.
   */
  protected readonly prikazRezultata = computed<PrikazZadatka>(() => {
    const z = this.zadatak();
    return z?.javniRezultat?.odgovoriPrikazani && !z.resenjePrikazano ? 'odgovori' : 'resenje';
  });
  protected readonly ukupnoMs = computed(() => {
    const s = this.opis()?.vremeSekunde;
    return s ? s * 1000 : null;
  });
  protected readonly aktivanTajmer = computed(() => {
    const t = this.tajmer();
    return t && (t.rokMs !== null || t.preostaloMs !== null) ? t : null;
  });
}

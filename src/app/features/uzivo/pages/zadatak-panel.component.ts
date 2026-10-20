import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NastavnickoStanje, VarijantaRunde, medijUrl } from '../data-access/uzivo.models';
import { KomandaZahtev } from './konzola-kontrole.component';

/** Server prima 1-50 različitih (`BROJ_VARIJANTI`), pa ponuda ne ide preko toga ni kad je aktivnih više. */
const MAKS_RAZLICITIH = 50;

interface OpcijaBroja { kljuc: string; vrednost: number | null; oznaka: string; }

const kljucBroja = (v: number | null) => (v === null ? '' : String(v));

/**
 * Zadatak slajd u konzoli (banka spec 4.5, spec 11.1): putanja grupe i upozorenja servera; pre otvaranja "Različitih: N od M"
 * i izbor broja za ovu rundu (`BROJ_VARIJANTI`: `null` kao na slajdu, `0` sve, `1..min(M, 50)`), posle otvaranja male
 * kartice izvučenih varijanti (slika zadatka, dodeljeno · odgovorilo · tačno uživo). Izbor uvek prikazuje stanje servera:
 * izabrana vrednost se vidi tek kad je server primi (409 ga ne pomera).
 */
@Component({
  selector: 'app-zadatak-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'uz-zp' },
  // u komponenti (lenji chunk konzole), ne u globalnom `uzivo-izvodjenje.css`: početni paket je na granici budžeta
  styles: `
    :host { display: block; }
    .uz-zp-putanja { margin: 0 0 6px; font-weight: 600; overflow-wrap: anywhere; }
    .uz-zp-upozorenje { margin: 4px 0; color: var(--warn); font-size: 14px; overflow-wrap: anywhere; }
    .uz-zp-broj { margin: 8px 0; font-size: 18px; }
    .uz-zp-broj strong { font-variant-numeric: tabular-nums; }
    .uz-zp-izbor { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 14px; }
    .uz-zp-izbor select {
      min-height: 40px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface);
      color: var(--ink); font: 500 15px/1.2 var(--font);
    }
    .uz-zp-izbor select:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
    .uz-zp-resenje { margin: 8px 0; }
    .uz-cip--ok { border-color: transparent; background: var(--ok-soft); color: var(--ok); font-weight: 600; }
    .uz-zp-varijante {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin: 8px 0 0; padding: 0;
      list-style: none;
    }
    .uz-zp-varijanta {
      display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 6px; border: 1px solid var(--line); border-radius: 10px;
    }
    .uz-zp-slika { display: block; width: 100%; height: 96px; object-fit: contain; background: var(--surface); }
    .uz-zp-naziv { font-weight: 600; overflow-wrap: anywhere; }
    .uz-zp-brojevi { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
  `,
  template: `
    @if (stanje().zadatak; as z) {
      <p class="uz-zp-putanja" data-putanja>{{ putanja() }}</p>
      <div role="status">
        @for (u of z.slajd.upozorenja; track u) {
          <p class="uz-zp-upozorenje">{{ u }}</p>
        }
      </div>
      @if (z.varijante; as varijante) {
        @if (z.resenjePrikazano) {
          <p class="uz-zp-resenje"><span class="uz-cip uz-cip--ok">Rešenje prikazano</span></p>
        }
        <ul class="uz-zp-varijante" aria-label="Izvučene varijante">
          @for (v of varijante; track v.varijantaId; let i = $index) {
            <li class="uz-zp-varijanta">
              <img class="uz-zp-slika" [src]="url(v.svgId)" [alt]="'Zadatak, varijanta ' + naziv(v, i)" loading="lazy">
              <span class="uz-zp-naziv">{{ naziv(v, i) }}</span>
              <span class="uz-zp-brojevi">
                @if (papir().has(v.varijantaId)) {
                  dodeljeno {{ v.dodeljeno }} · rad na papiru
                } @else {
                  dodeljeno {{ v.dodeljeno }} · odgovorilo {{ v.odgovorilo }} · tačno {{ v.tacnih }}
                }
              </span>
            </li>
          }
        </ul>
      } @else {
        <p class="uz-zp-broj">Različitih: <strong>{{ z.brojZaOtvaranje }}</strong> od {{ z.slajd.brojAktivnihVarijanti }}</p>
        @if (z.slajd.brojAktivnihVarijanti > 0) {
          <label class="uz-zp-izbor">
            <span>Broj različitih zadataka</span>
            <!-- izbor mišem pušta fokus: u polju za unos prečice ne rade (uPoljuZaUnos), a sledeće je obično O -->
            <select (mousedown)="misem = true" (keydown)="misem = false" (change)="izaberi($event)">
              @for (o of opcije(); track o.kljuc) {
                <option [value]="o.kljuc" [selected]="o.vrednost === z.izmenaBrojaVarijanti">{{ o.oznaka }}</option>
              }
            </select>
          </label>
        }
      }
    }
  `,
})
export class ZadatakPanelComponent {
  readonly stanje = input.required<NastavnickoStanje>();
  readonly komanda = output<KomandaZahtev>();

  protected readonly url = medijUrl;
  /** Poslednji izbor je počeo mišem (pa fokus posle izbora ide sa polja). */
  protected misem = false;

  protected readonly putanja = computed(() => (this.stanje().zadatak?.slajd.putanja ?? []).map(p => p.naziv).join(' › '));

  /** Varijante bez polja odgovora (rad na papiru): po rezultatu konzole, koji ima šemu svake izvučene. */
  protected readonly papir = computed(() => new Set(
    (this.stanje().zadatak?.rezultat?.varijante ?? []).filter(r => r.polja.length === 0).map(r => r.varijantaId)));

  protected readonly opcije = computed<OpcijaBroja[]>(() => {
    const z = this.stanje().zadatak;
    if (!z) return [];
    const m = z.slajd.brojAktivnihVarijanti;
    const gornja = Math.min(m, MAKS_RAZLICITIH);
    const o: OpcijaBroja[] = [
      { kljuc: kljucBroja(null), vrednost: null, oznaka: `Kao na slajdu (${z.slajd.brojVarijanti ?? 'sve'})` },
      { kljuc: kljucBroja(0), vrednost: 0, oznaka: `Sve (${m})` },
    ];
    for (let n = 1; n <= gornja; n++) o.push({ kljuc: kljucBroja(n), vrednost: n, oznaka: String(n) });
    // ranije izabran broj iznad ponude (npr. varijanta je u međuvremenu arhivirana) ostaje vidljiv i izabran
    const izmena = z.izmenaBrojaVarijanti;
    if (izmena !== null && izmena > gornja) o.push({ kljuc: kljucBroja(izmena), vrednost: izmena, oznaka: String(izmena) });
    return o;
  });

  protected naziv(v: VarijantaRunde, i: number): string {
    return v.naziv ?? `V${i + 1}`;
  }

  protected izaberi(e: Event): void {
    const izbor = e.target as HTMLSelectElement;
    const k = izbor.value;
    this.komanda.emit({ tip: 'BROJ_VARIJANTI', vrednost: k === '' ? null : Number(k) });
    // izbor pokazuje stanje servera: nova vrednost stiže sa snimkom (i ne stiže kad server odbije)
    izbor.value = kljucBroja(this.stanje().zadatak?.izmenaBrojaVarijanti ?? null);
    if (this.misem) izbor.blur();
    this.misem = false;
  }
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { grupisiCifre } from '../ui/format';
import { OpcijaOblikComponent } from '../ui/opcija-oblik';
import { TekstFormuleComponent } from '../ui/tekst-formule.component';
import { OZNAKE_STANJA, RED_STANJA, StanjeOpcije, naslovUdela, opisUdela, stanjaOpcija } from './ishod-vise-tacnih';
import { IshodPitanja, StudentStore, naslovIshoda } from './student.store';

/** Klasa naslova po udelu: zeleno, ćilibar (`--warn`), crveno. */
const KLASA_NASLOVA = { 'Tačno!': 'uz-st-ok', 'Delimično tačno': 'uz-st-pola', 'Netačno': 'uz-st-lose' } as const;

interface StavkaIshoda { id: number; indeks: number; tekst: string | null; stanje: StanjeOpcije; oznaka: string | null; }

/**
 * Ekran ishoda na telefonu posle "Tačno" (ekran `tacan`). Pitanje sa više tačnih, kad server pošalje svoje izabrane opcije
 * (maketa deo 2): naslov po udelu ("Delimično tačno +425"), objašnjenje i spisak svih opcija sa stanjem (pogođena, pogrešna,
 * propuštena, pa ostale, prigušene bojom teksta, ne providnošću: belo slovo na znački mora ostati 4.5:1). Sve iz snimka
 * servera (`JavnoPitanje.tacneOpcije`, `LicniOdgovor.izabrane`/`udeo`), pa posle osvežavanja telefona spisak ostaje. Tekst
 * opcije samo kad ga `JavnoPitanje.opcije[i].tekst` nosi (u režimu "samo dugmad" ne stiže): inače oblik i slovo. Ostala pitanja (i više tačnih bez `izabrane`: nije odgovorio, stari backend):
 * naslov ishoda i "Tačan odgovor:" kao ranije. Ispod oba mesto u takmičenju.
 *
 * Lenja (`@defer` u stranici studenta, kao `app-zadatak-ekran`): ceo ekran ishoda, kod i stilovi, je van statičkog zatvorenja
 * stranice (`e2e/lenji-formule.spec.ts`) i van globalnog CSS-a početnog paketa (`e2e/lenji-editor.spec.ts`). Stanje uzima iz
 * {@link StudentStore} stranice (ubrizgan, bez ulaza). Uvozi samo module dozvoljene javnom delu.
 */
@Component({
  selector: 'app-ishod-ekran',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OpcijaOblikComponent, TekstFormuleComponent],
  styles: `
    :host { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; width: 100%; }
    .uz-st-pola { color: var(--warn); }
    .uz-st-iv { display: flex; flex-direction: column; gap: 0.5rem; width: 100%; margin: 0; padding: 0; list-style: none; }
    .uz-st-iv li {
      display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 0.25rem 0.75rem;
      padding: 0.5rem 0.75rem; border: 1px solid var(--line); border-radius: 0.5rem; font-size: 1.125rem;
      overflow-wrap: anywhere;
    }
    .uz-st-iv-s { grid-column: 2; font-size: 0.875rem; font-weight: 600; }
    .uz-st-iv li.pogodjena { background: var(--ok-soft); border-color: var(--ok); }
    .uz-st-iv li.pogodjena .uz-st-iv-s { color: var(--ok); }
    .uz-st-iv li.propustena { background: var(--warn-soft); border-color: var(--warn); border-style: dashed; }
    .uz-st-iv li.propustena .uz-st-iv-s { color: var(--warn); }
    .uz-st-iv li.pogresna { background: var(--danger-soft); border-color: var(--danger); }
    .uz-st-iv li.pogresna .uz-st-iv-s { color: var(--danger); }
    .uz-st-iv li.ostala { color: var(--muted); }
  `,
  template: `
    @let s = store;
    @let l = s.licno();
    @if (prikaz(); as v) {
      <p class="uz-st-veliko" data-naslov [class]="v.klasa">{{ v.naslov }}</p>
      <p class="uz-st-tekst" data-opis>{{ v.opis }}</p>
      <ul class="uz-st-iv">
        @for (o of v.stavke; track o.id) {
          <li [class]="o.stanje" [attr.data-stanje]="o.stanje">
            <app-opcija-oblik [indeks]="o.indeks" [velicina]="32" />
            @if (o.tekst) { <app-tekst-formule [tekst]="o.tekst" /> }
            @if (o.oznaka) { <span class="uz-st-iv-s" data-oznaka-stanja>{{ o.oznaka }}</span> }
          </li>
        }
      </ul>
    } @else {
      @if (s.ishod(); as i) {
        <p class="uz-st-veliko" [class.uz-st-ok]="i.tacno === true" [class.uz-st-lose]="i.tacno === false">
          {{ naslov(i) }}
        </p>
      }
      @if (s.tacan(); as t) {
        <p class="uz-st-tekst">Tačan odgovor:</p>
        @for (o of t.opcije; track o.indeks) {
          <p class="uz-st-tacna">
            <app-opcija-oblik [indeks]="o.indeks" [velicina]="40" />
            @if (o.tekst) { <app-tekst-formule [tekst]="o.tekst" /> }
          </p>
        }
        @if (t.tekst) { <p class="uz-st-tacna"><strong>{{ t.tekst }}</strong></p> }
      }
    }
    @if (s.javno()?.takmicenje && l?.mesto) {
      <p class="uz-st-mesto">Tvoje mesto: {{ l!.mesto }} · {{ poeni(l!.poeni) }}</p>
    }
  `,
})
export class IshodEkranComponent {
  protected readonly store = inject(StudentStore);
  protected readonly poeni = grupisiCifre;

  protected readonly prikaz = computed(() => {
    const p = this.store.pitanje();
    const i = this.store.ishod();
    if (p?.tip !== 'VISE_TACNIH' || !i?.izabrane) return null;
    const tacne = p.tacneOpcije ?? [];
    const opcije = p.opcije ?? [];
    const stanja = stanjaOpcija(opcije, tacne, i.izabrane);
    const stavke: StavkaIshoda[] = opcije
      .map((o, indeks) => ({ id: o.id, indeks, tekst: o.tekst, stanje: stanja[indeks], oznaka: OZNAKE_STANJA[stanja[indeks]] }))
      .sort((a, b) => RED_STANJA[a.stanje] - RED_STANJA[b.stanje] || a.indeks - b.indeks);
    return {
      naslov: this.naslov(i),
      klasa: KLASA_NASLOVA[naslovUdela(i.udeo ?? (i.tacno ? 1 : 0))],
      opis: opisUdela(tacne, i.izabrane),
      stavke,
    };
  });

  protected naslov(i: IshodPitanja): string {
    return naslovIshoda(i, !!this.store.javno()?.takmicenje);
  }
}

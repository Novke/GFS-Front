import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { KontrolnaTablaCeka } from '../../../core/api/pregled.api';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { oblik } from '../data-access/pocetna.vreme';

/** Koliko se imena stavki ispisuje u podnaslovu reda; ostalo ide u "+N još". */
const IMENA = 3;
/** Najviše pojedinačnih redova nezavršenih predavanja; ostalo ide u "+N još". */
const MAX_NEZAVRSENIH = 5;

interface Red {
  kljuc: string;
  /** Tekst u značku: broj stavki, ili `!` za pojedinačno nezavršeno predavanje. */
  broj: string;
  /** `warn` za stvari koje kasne (testovi, nezavršena predavanja). */
  ton: 'warn' | 'info';
  naslov: string;
  podnaslov: string;
  akcija: string;
  /** Putanja i query parametri `routerLink`-a. */
  veza: unknown[];
  query: Record<string, string> | null;
}

function pomocni(imena: string[], ukupno: number): string {
  const prikazano = imena.slice(0, IMENA);
  const jos = ukupno - prikazano.length;
  return prikazano.join(', ') + (jos > 0 ? `${prikazano.length ? ' ' : ''}+${jos} još` : '');
}

/**
 * P3 "Čeka na tebe": testovi za evidentiranje i domaći za pregled (vode na filtriranu listu), prijave na čekanju po
 * sesiji (na prijave sesije) i nezavršena predavanja (na detalj, ili na listu kad ih je više). Liste sa servera su
 * ograničene na 10; brojevi su ukupni, pa se "+N još" računa iz njih.
 */
@Component({
  selector: 'app-ceka-na-tebe',
  imports: [MatIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="kartica" aria-labelledby="ceka-naslov">
      <div class="zaglavlje"><h2 id="ceka-naslov">Čeka na tebe</h2></div>
      @if (redovi().length > 0 || josPrijava() > 0 || josNezavrsenih() > 0) {
        <ul class="sanduce">
          @for (r of redovi(); track r.kljuc) {
            <li>
              <span class="broj" [class.warn]="r.ton === 'warn'">{{ r.broj }}</span>
              <div class="tekst">
                <div class="t">{{ r.naslov }}</div>
                @if (r.podnaslov) {
                  <div class="s">{{ r.podnaslov }}</div>
                }
              </div>
              <a class="ide" [routerLink]="r.veza" [queryParams]="r.query" [attr.data-ceka]="r.kljuc">{{ r.akcija }}<span class="sr-only"> — {{ r.naslov }}@if (r.podnaslov) {: {{ r.podnaslov }}}</span></a>
            </li>
          }
        </ul>
        @if (josPrijava() > 0) {
          <p class="jos">+{{ josPrijava() }} {{ josPrijavaRec() }} u drugim sesijama · <a routerLink="/grupe">Grupe</a></p>
        }
        @if (josNezavrsenih() > 0) {
          <p class="jos" data-jos-nezavrsenih>+{{ josNezavrsenih() }} {{ josNezavrsenihRec() }} · <a routerLink="/predavanja" [queryParams]="{ status: 'u-toku' }">Predavanja u toku</a></p>
        }
      } @else {
        <p class="prazno" data-nista>
          <mat-icon svgIcon="check_circle" aria-hidden="true" />
          Ništa ne čeka: svi testovi su evidentirani, domaći pregledani, a predavanja završena.
        </p>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .kartica { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    .zaglavlje { padding: 14px 18px; border-bottom: 1px solid var(--line); }
    h2 { font-size: 16px; }
    .sanduce { margin: 0; padding: 4px 18px; list-style: none; }
    li { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line); }
    li:last-child { border-bottom: 0; }
    .broj { display: grid; place-items: center; flex: none; min-width: 30px; height: 30px; padding: 0 4px; border-radius: var(--radius-sm);
      background: var(--primary-soft); color: var(--primary-soft-ink); font-family: var(--font-mono); font-size: 14px; font-weight: 700; }
    .broj.warn { background: var(--warn-soft); color: var(--warn); }
    .tekst { min-width: 0; flex: 1; }
    .t { font-size: 14px; font-weight: 600; }
    .s { color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }
    .ide { flex: none; padding: 8px 4px; color: var(--primary); font-size: 13px; font-weight: 600; text-decoration: none; }
    .ide:hover { text-decoration: underline; }
    .jos { margin: 0; padding: 0 18px 14px; color: var(--muted); font-size: 12.5px; }
    .prazno { display: flex; align-items: center; gap: 10px; margin: 0; padding: 16px 18px; color: var(--ink-2); }
    .prazno .mat-icon { flex: none; color: var(--ok); }
  `,
})
export class CekaNaTebe {
  readonly ceka = input.required<KontrolnaTablaCeka>();

  protected readonly redovi = computed<Red[]>(() => {
    const c = this.ceka();
    const redovi: Red[] = [];

    if (c.brojTestova > 0) {
      redovi.push({
        kljuc: 'testovi',
        broj: String(c.brojTestova),
        ton: 'warn',
        naslov: `${oblik(c.brojTestova, 'Test', 'Testa', 'Testova')} za evidentiranje`,
        podnaslov: pomocni(c.testovi.map(t => `${t.tipTesta?.naziv ?? 'Test'} · ${t.grupa?.naziv ?? '—'} · ${formatDatum(t.datum, 'kratko')}`), c.brojTestova),
        akcija: 'Otvori',
        veza: ['/testovi'],
        query: { status: 'za-evidentiranje' },
      });
    }

    for (const p of c.prijave) {
      const istice = p.istice ? ` · ističe ${formatDatum(p.istice, 'kratko')}` : '';
      redovi.push({
        kljuc: `prijave-${p.sesijaId}`,
        broj: String(p.brojNaCekanju),
        ton: 'info',
        naslov: oblik(p.brojNaCekanju, 'Prijava', 'Prijave', 'Prijava') + ' na čekanju',
        podnaslov: `Onboarding ${p.grupa?.naziv ?? '—'}${istice}`,
        akcija: 'Pregledaj',
        veza: p.grupa ? ['/grupe', p.grupa.id, 'onboarding', p.sesijaId] : ['/grupe'],
        query: null,
      });
    }

    if (c.brojDomacih > 0) {
      redovi.push({
        kljuc: 'domaci',
        broj: String(c.brojDomacih),
        ton: 'info',
        naslov: `${oblik(c.brojDomacih, 'Domaći', 'Domaća', 'Domaćih')} za pregled`,
        podnaslov: pomocni(c.domaci.map(d => `${d.naslov?.trim() || 'Domaći'} · ${d.grupa?.naziv ?? '—'}`), c.brojDomacih),
        akcija: 'Otvori',
        veza: ['/domaci'],
        query: { status: 'za-pregled' },
      });
    }

    // Svako nezavršeno predavanje je svoj red sa vezom na detalj (zbirna veza na listu bi prikazala i današnja, pa se brojevi ne bi slagali)
    for (const p of c.nezavrsena.slice(0, MAX_NEZAVRSENIH)) {
      redovi.push({
        kljuc: `nezavrsena-${p.id}`,
        broj: '!',
        ton: 'warn',
        naslov: 'Nezavršeno predavanje',
        podnaslov: `Predavanje ${p.rb}${p.tema ? ` · ${p.tema}` : ''} · ${p.predmet?.naziv ?? '—'} · ${p.grupa?.naziv ?? '—'} · ${formatDatum(p.datum, 'kratko')}`,
        akcija: 'Završi',
        veza: ['/predavanja', p.id],
        query: null,
      });
    }
    return redovi;
  });

  /** Nezavršenih predavanja više nego što je redova (server šalje najviše 10, ovde se prikazuje {@link MAX_NEZAVRSENIH}). */
  protected readonly josNezavrsenih = computed(() => {
    const c = this.ceka();
    return Math.max(0, c.brojNezavrsenih - Math.min(c.nezavrsena.length, MAX_NEZAVRSENIH));
  });

  /** Prijave u sesijama koje nisu među prikazanim (server vraća najviše 10 sesija). */
  protected readonly josPrijava = computed(() => {
    const c = this.ceka();
    return Math.max(0, c.brojPrijava - c.prijave.reduce((zbir, p) => zbir + p.brojNaCekanju, 0));
  });
  protected readonly josNezavrsenihRec = computed(() => oblik(this.josNezavrsenih(), 'nezavršeno predavanje', 'nezavršena predavanja', 'nezavršenih predavanja'));
  protected readonly josPrijavaRec = computed(() => oblik(this.josPrijava(), 'prijava', 'prijave', 'prijava'));
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { JavnaRangTacnostiStavka } from '../data-access/uzivo.models';
import { decimalni } from '../../../shared/util/broj';
import { nivoTacnosti, prikazVremena } from '../../../core/api/rang.api';

/** Najveća veličina slova reda (cqw) u jednoj i u dve kolone; dve kolone su uže, pa manje. */
const MAKS_JEDNA = 3;
const MAKS_DVE = 2;
/** Visina koju lista sme da zauzme, preračunata u "cqw po redu": slova = RASPOLOZIVO / (redova + zaglavlje). */
const RASPOLOZIVO = 19;
/**
 * Širina koju lista sme da zauzme (cqw) i širina jednog reda u em: kolone sa brojevima (21,6 em, tri su za do 5 znakova, npr. "12,67" u rangu predavanja), razmaci i uvlačenje
 * (5,6 em) i ime (najmanje 8 em, "Aleksandra P."). Bez ovoga dve kolone na većim slovima ostave imenu 0 px (vidi se samo
 * prvo slovo), jer su kolone sa brojevima fiksne.
 */
const SIRINA = 91;
const RED_EM = 35.2;
/** Razmak između kolona u em (`gap` hosta). */
const RAZMAK_EM = 1.6;

/**
 * Veličina slova (cqw) kad su redovi u {@code kolona} kolona: koliko staje po visini i po širini (red sa celim imenom),
 * a najviše {@link MAKS_JEDNA} odnosno {@link MAKS_DVE}.
 */
export function velicinaSlova(redova: number, kolona: 1 | 2): number {
  const poKoloni = Math.ceil(redova / kolona);
  const poSirini = SIRINA / (kolona * RED_EM + (kolona - 1) * RAZMAK_EM);
  return Math.min(kolona === 1 ? MAKS_JEDNA : MAKS_DVE, RASPOLOZIVO / (poKoloni + 1), poSirini);
}

/**
 * Rang tačnosti na projektoru (L, Shift+L; spec rang tačnosti 6, dorada 2026-10-29): mesto, kratko ime ("Ana K."), ✓
 * tačnih, ✗ netačnih (neodgovoreno je netačno), tačnost u obojenoj pilulji, prosečno vreme i ★, redom servera (★, pa
 * prosek). Server šalje koliko je izabrano u konzoli ("Na tabli"), najviše 30 redova, bez id-jeva. Sve staje na slajd:
 * slova se smanjuju sa brojem redova i sa širinom (ime se uvek vidi celo), a kad tako ispadnu veća, redovi idu u dve kolone.
 */
@Component({
  selector: 'app-rang-tacnosti-projektor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'uz-rang uz-rt', '[style.font-size.cqw]': 'raspored().slova' },
  styles: `
    :host { display: flex !important; gap: 1.6em; width: 100%; }
    .uz-rt-kolona { flex: 1 1 0; min-width: 0; }
    .uz-rang-red.uz-rt-red { grid-template-columns: 2em minmax(8em, 1fr) 3.6em 3.6em 4.4em 4.4em 3.6em; column-gap: .7em;
      padding: .3em .7em; }
    .uz-rt-zaglavlje { padding: 0 .7em .2em; background: none; color: var(--muted); font-size: .8em; font-weight: 600; }
    .uz-rt-broj { font-variant-numeric: tabular-nums; text-align: center; white-space: nowrap; }
    .uz-rt-tacnih { color: var(--ok); font-weight: 700; }
    .uz-rt-netacnih { color: var(--danger); }
    .uz-rt-pilula { display: inline-block; min-width: 3.4em; padding: 0 .4em; border-radius: 1em; font-weight: 700; }
    /* tačnost iz postojećih tokena (bez novih globalnih: budžet početnog paketa): crveno, narandžasto, žuto, zeleno */
    .uz-rt-pilula { --b: var(--muted); background: color-mix(in srgb, var(--b) 14%, var(--surface)); color: var(--b); }
    .uz-rt-pilula[data-nivo='1'] { --b: var(--danger); }
    .uz-rt-pilula[data-nivo='2'] { --b: color-mix(in srgb, var(--danger) 50%, var(--warn)); }
    .uz-rt-pilula[data-nivo='3'] { --b: var(--warn); }
    .uz-rt-pilula[data-nivo='4'] { --b: var(--ok); }
    .uz-rt-vreme { color: var(--ink-2); }
    .uz-rt-zvezde { font-weight: 700; }
    .uz-rt-zvezde-znak { color: var(--star); }
  `,
  template: `
    @if (stavke().length) {
      @for (kol of raspored().kolone; track $index) {
        <div class="uz-rt-kolona">
          <div class="uz-rang-red uz-rt-red uz-rt-zaglavlje" aria-hidden="true">
            <span>#</span><span>Ime</span>
            <span class="uz-rt-broj uz-rt-tacnih">✓</span><span class="uz-rt-broj uz-rt-netacnih">✗</span>
            <span class="uz-rt-broj">%</span><span class="uz-rt-broj">⏱</span>
            <span class="uz-rt-broj uz-rt-zvezde-znak">★</span>
          </div>
          <ol class="uz-rang-lista">
            @for (s of kol; track $index) {
              <li class="uz-rang-red uz-rt-red">
                <span class="uz-rang-mesto">{{ s.mesto }}.</span>
                <span class="uz-rang-ime">{{ s.ime }}</span>
                <span class="uz-rt-broj uz-rt-tacnih">{{ decimalni(s.tacnih) }}<span class="uz-sr"> tačnih</span></span>
                <span class="uz-rt-broj uz-rt-netacnih">{{ decimalni(netacnih(s)) }}<span class="uz-sr"> netačnih</span></span>
                <span class="uz-rt-broj"><span class="uz-rt-pilula" [attr.data-nivo]="nivo(s.procenat)">{{ s.procenat ?? 0 }}%</span></span>
                <span class="uz-rt-broj uz-rt-vreme">{{ vreme(s.prosekMs) }}</span>
                <span class="uz-rt-broj uz-rt-zvezde">{{ decimalni(s.zvezdice) }}<span class="uz-sr"> zvezdica</span></span>
              </li>
            }
          </ol>
        </div>
      }
    } @else {
      <p class="uz-prazno">Još nema zatvorenih pitanja sa tačnim odgovorom.</p>
    }
  `,
})
export class RangTacnostiProjektorComponent {
  readonly stavke = input<readonly JavnaRangTacnostiStavka[]>([]);
  protected readonly decimalni = decimalni;
  protected readonly vreme = prikazVremena;
  /** Netačnih = dugovanih - tačnih, na dve decimale (tačnih je decimalno) i nikad ispod nule ni -0. */
  protected netacnih(s: JavnaRangTacnostiStavka): number {
    return Math.max(0, Math.round((s.dugovanih - s.tacnih) * 100) / 100) + 0;
  }
  protected readonly nivo = nivoTacnosti;

  /** Jedna ili dve kolone (šta daje veća slova) i veličina slova u cqw. */
  protected readonly raspored = computed(() => {
    const s = this.stavke();
    const jedna = velicinaSlova(s.length, 1);
    const dve = velicinaSlova(s.length, 2);
    if (dve <= jedna) return { kolone: [s], slova: jedna };
    const pola = Math.ceil(s.length / 2);
    return { kolone: [s.slice(0, pola), s.slice(pola)], slova: dve };
  });
}

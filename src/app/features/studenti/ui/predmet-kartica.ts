import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { StudentPredmetKartica } from '../../../core/api/studenti.api';
import { StatusChip } from '../../../shared/ui/status-chip';
import { formatBroj } from '../data-access/studenti.models';

/** Procenat `prisutan` od `predavanja`, zaokružen; bez predavanja `null` (prikaz `—`). */
export function procenatPrisustva(prisutan: number, predavanja: number): number | null {
  return predavanja > 0 ? Math.min(100, Math.round((prisutan / predavanja) * 100)) : null;
}

/**
 * S2: kartica studenta na jednom predmetu: prisustvo x/y, zadaci, zvezdice, domaći x/y sa prosekom, poeni po tipu testa,
 * ukupno poena, predlog ocene i koliko poena fali do sledeće ("najviša ocena" kad je predlog 10). Naslov vodi na
 * `studenti/:id/predmeti/:pid`.
 */
@Component({
  selector: 'app-predmet-kartica',
  imports: [RouterLink, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <h3><a [routerLink]="['/studenti', studentId(), 'predmeti', kartica().predmet.id]" data-predmet>{{ kartica().predmet.naziv }}</a></h3>
      <div class="ocena" data-ocena>
        @if (kartica().predlogOcene; as o) {
          <span class="broj mono" aria-label="Predlog ocene">{{ o }}</span>
        } @else {
          <app-status-chip tekst="Nije položio" ton="warn" />
        }
      </div>
    </header>

    <dl class="brojke">
      <div><dt>Prisustvo</dt><dd class="mono" data-prisustvo>{{ kartica().prisutan }}/{{ kartica().predavanja }}{{ procenat() }}</dd></div>
      <div><dt>Zadaci</dt><dd class="mono" data-zadaci>{{ kartica().zadaci }}</dd></div>
      <div><dt>Zvezdice</dt><dd class="mono" data-zvezdice>{{ kartica().zvezdice }}</dd></div>
      <div><dt>Domaći</dt><dd class="mono" data-domaci>{{ kartica().domaciUradjeno }}/{{ kartica().domaciUkupno }}{{ prosek() }}</dd></div>
    </dl>

    @if (kartica().testovi.length > 0) {
      <ul class="testovi" aria-label="Poeni po tipu testa">
        @for (t of kartica().testovi; track $index) {
          <li><span>{{ t.tipTesta?.naziv ?? 'Test' }}</span><span class="mono" data-test>{{ poeni(t.ostvarenoPoena) }}</span></li>
        }
      </ul>
    }

    <footer>
      <span>Ukupno <strong class="mono" data-ukupno>{{ ukupno() }}</strong> poena</span>
      <span class="sledeca" data-sledeca>{{ sledeca() }}</span>
    </footer>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius);
      background: var(--surface); box-shadow: var(--shadow); }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    h3 { font-size: 16px; overflow-wrap: anywhere; }
    h3 a { color: var(--ink); text-decoration: none; }
    h3 a:hover { color: var(--primary); text-decoration: underline; }
    .broj { display: inline-grid; place-items: center; min-width: 40px; height: 40px; padding: 0 8px; border-radius: var(--radius-sm);
      background: var(--primary-soft); color: var(--primary-soft-ink); font-size: 22px; font-weight: 700; }
    .brojke { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; margin: 0; }
    .brojke div { display: flex; flex-direction: column; }
    dt { font-size: 12px; color: var(--muted); }
    dd { margin: 0; font-size: 15px; font-weight: 600; }
    .testovi { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 8px 0 0; border-top: 1px solid var(--line); list-style: none; font-size: 14px; }
    .testovi li { display: flex; justify-content: space-between; gap: 12px; }
    footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; padding-top: 8px; border-top: 1px solid var(--line); font-size: 14px; }
    .sledeca { color: var(--muted); }
  `,
})
export class PredmetKartica {
  readonly kartica = input.required<StudentPredmetKartica>();
  readonly studentId = input.required<number>();

  protected readonly procenat = computed(() => {
    const k = this.kartica();
    const p = procenatPrisustva(k.prisutan, k.predavanja);
    return p === null ? '' : ` (${p}%)`;
  });
  protected readonly prosek = computed(() => {
    const p = this.kartica().domaciProsek;
    return p === null || p === undefined ? '' : ` · prosek ${formatBroj(p)}`;
  });
  protected readonly ukupno = computed(() => formatBroj(this.kartica().ukupno));

  /** "do sledeće ocene: 8,4 poena", a za predlog 10 (server šalje `null`) "najviša ocena". */
  protected readonly sledeca = computed(() => {
    const d = this.kartica().doSledeceOcene;
    return d === null || d === undefined ? 'najviša ocena' : `do sledeće ocene: ${formatBroj(d)} poena`;
  });

  protected poeni(p: number | null): string {
    return p === null ? '—' : formatBroj(p);
  }
}

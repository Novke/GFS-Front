import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';

import { formatSkolskaGodina, tekucaSkolskaGodina } from '../../../shared/util/skolska-godina';
import { PreferencesStore } from '../../../core/state/preferences.store';
import { ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { PredavanjaApi } from '../../../core/api/predavanja.api';
import { PocetnaStore } from '../data-access/pocetna.store';
import { naslovDatuma, pozdravZaSat } from '../data-access/pocetna.vreme';
import { CekaNaTebe } from '../ui/ceka-na-tebe';
import { Nedavno } from '../ui/nedavno';
import { OvaNedelja } from '../ui/ova-nedelja';
import { SledecePredavanje } from '../ui/sledece-predavanje';
import { StatusChip } from '../../../shared/ui/status-chip';

/**
 * Kontrolna tabla (`/`): pozdrav po dobu dana, datum i školska godina; traka "U toku" po nezavršenom predavanju od danas,
 * "Sledeće predavanje" (P1), "Čeka na tebe" (P3), "Ova nedelja" (P4) i "Nedavno" (P5). Jedan zahtev
 * `GET pregled/kontrolna-tabla`; greška je panel sa "Pokušaj ponovo".
 */
@Component({
  selector: 'app-pocetna',
  imports: [CekaNaTebe, ErrorPanel, MatButton, Nedavno, OvaNedelja, PageHeader, RouterLink, SkeletonRows, SledecePredavanje, StatusChip],
  providers: [PocetnaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pocetna.html',
  styleUrl: './pocetna.scss',
})
export class Pocetna implements OnInit {
  protected readonly store = inject(PocetnaStore);
  protected readonly preference = inject(PreferencesStore);
  private readonly api = inject(PredavanjaApi);
  private readonly router = inject(Router);

  protected readonly salje = signal(false);

  ngOnInit(): void {
    this.store.ucitaj();
  }

  protected pozdrav(): string {
    return pozdravZaSat(this.store.sada().getHours());
  }

  protected podnaslov(): string {
    const sada = this.store.sada();
    return `${naslovDatuma(sada)} · školska godina ${formatSkolskaGodina(tekucaSkolskaGodina(sada))}`;
  }

  /** "Započni predavanje": `POST predavanja/start` (greška ide u snackbar) pa detalj; dvostruki klik je blokiran. */
  protected zapocni(): void {
    const s = this.store.sledece();
    if (this.salje() || !s?.grupa) {
      return;
    }
    this.salje.set(true);
    this.api.start({ predmetId: s.predmet.id, grupaId: s.grupa.id }).subscribe({
      next: p => {
        void this.router.navigate(['/predavanja', p.id]).finally(() => this.salje.set(false));
      },
      error: () => this.salje.set(false),
    });
  }
}

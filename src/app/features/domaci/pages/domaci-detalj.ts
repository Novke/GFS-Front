import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';

import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { JE_ID } from '../../../core/route-matchers';
import { PreferencesStore } from '../../../core/state/preferences.store';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { DomaciStore, IzmenaZaglavljaDomaceg } from '../data-access/domaci.store';
import { brojStudenata, naslovDomaceg } from '../data-access/domaci.models';
import { DomaciZaglavlje } from '../ui/domaci-zaglavlje';
import { EvidentiranjeTabela, IzmenaReda } from '../ui/evidentiranje-tabela';

/**
 * Domaći (`/domaci/:id`): dok nije pregledan, tabelarno evidentiranje (bodovi, prepisivanje, napomena po studentu, svaki red
 * se čuva sam), "Oslobodi aktivne" (ako je domaći vezan za predavanje) i "Završi pregled" uz potvrdu; posle toga tabela je
 * samo za čitanje (backend nema "ponovo otvori": `PATCH domaci/{id}` samo postavlja `pregledan=true`). Meni ⋮: izmena
 * podataka i brisanje (potvrda, destruktivna).
 */
@Component({
  selector: 'app-domaci-detalj',
  imports: [DomaciZaglavlje, EmptyState, ErrorPanel, EvidentiranjeTabela, MatButton, MatIcon, RouterLink, SkeletonRows],
  providers: [DomaciStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './domaci-detalj.html',
  styleUrl: './domaci-detalj.scss',
})
export class DomaciDetalj {
  protected readonly store = inject(DomaciStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly mrvice = inject(BreadcrumbService);
  private readonly preference = inject(PreferencesStore);

  /** Id iz putanje (`withComponentInputBinding`); matcher rute već propušta samo brojeve. */
  readonly id = input.required<string>();

  protected readonly dId = computed(() => (JE_ID.test(this.id()) ? Number(this.id()) : null));
  /** Stabilna referenca (ulaz zaglavlja), da se ne pravi nova funkcija pri svakoj detekciji promena. */
  protected readonly sacuvajZaglavlje = (izmena: IzmenaZaglavljaDomaceg) => this.store.izmeniZaglavlje(izmena);
  /** Naslov za mrvice i "Nedavno" (string, pa se menja samo kad se promeni naslov ili predavanje). */
  protected readonly naslov = computed(() => {
    const d = this.store.domaci();
    return d ? naslovDomaceg(d) : null;
  });

  constructor() {
    effect(() => {
      const id = this.dId();
      if (id !== null) {
        untracked(() => this.store.ucitaj(id));
      }
    });

    // mrvice i "Nedavno" kad stigne domaći i posle izmene naslova (ne na svaku izmenu reda)
    effect(() => {
      const naslov = this.naslov();
      const id = untracked(() => this.store.domaci()?.id);
      if (naslov === null || id === undefined) {
        return;
      }
      untracked(() => {
        this.mrvice.postavi(naslov);
        this.preference.zabeleziNedavno({ tip: 'domaci', id, naslov, url: `/domaci/${id}` });
      });
    });
  }

  protected ponovo(): void {
    const id = this.dId();
    if (id !== null) {
      this.store.ucitaj(id);
    }
  }

  protected izmena(i: IzmenaReda): void {
    this.store.izmeni(i.studentId, i.izmena);
  }

  protected oslobodi(): void {
    const n = this.store.brojevi().zaOslobadjanje;
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Oslobodi aktivne?',
      tekst: `${brojStudenata(n)} koji su radili zadatak ili imali zvezdicu na predavanju dobija 10 bodova i oznaku „oslobođen“. Već upisani bodovi i napomene tih studenata se zamenjuju.`,
      potvrdi: 'Oslobodi',
    })
      .pipe(filter(Boolean))
      .subscribe(() => void this.store.oslobodi());
  }

  protected zavrsi(): void {
    const b = this.store.brojevi();
    const nesacuvano = this.store.brojGresaka() > 0 ? ' Redovi sa greškom čuvanja nisu u evidenciji.' : '';
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Završi pregled?',
      tekst: `Evidentirano: ${b.evidentirano} od ${b.studenata}.${nesacuvano} Pregledan domaći je samo za čitanje i ne može se ponovo otvoriti.`,
      potvrdi: 'Završi pregled',
    })
      .pipe(filter(Boolean))
      .subscribe(() => void this.store.zavrsi());
  }

  protected obrisi(): void {
    const b = this.store.brojevi();
    const n = b.evidentirano + b.oslobodjenih;
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Obriši domaći?',
      tekst: `Briše se domaći i ${n === 1 ? '1 evidentirani student' : `${n} evidentiranih studenata`}. Predavanje i grupa ostaju. Ovo se ne može poništiti.`,
      potvrdi: 'Obriši',
      destruktivno: true,
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.obrisi()),
        filter(Boolean),
      )
      .subscribe(() => void this.router.navigate(['/domaci']));
  }
}

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';

import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { JE_ID } from '../../../core/route-matchers';
import { NotificationStore } from '../../../core/state/notification.store';
import { PreferencesStore } from '../../../core/state/preferences.store';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { StudentPicker } from '../../../shared/ui/student-picker';
import { IndeksPipe } from '../../../shared/util/indeks.pipe';
import { IzmenaZaglavlja, PredavanjeStore, StanjeStudenta } from '../data-access/predavanje.store';
import { TipAktivnosti } from '../../../core/api/predavanja.models';
import { BrziUnos } from '../ui/brzi-unos';
import { NapomenaDialog } from '../ui/napomena-dialog';
import { PredavanjeZaglavlje } from '../ui/predavanje-zaglavlje';
import { StudentskaPlocica } from '../ui/studentska-plocica';

const TIP_TEKST: Record<TipAktivnosti, string> = { PRISUSTVO: 'Prisustvo', ZADATAK: 'Zadatak', SA_ZVEZDICOM: 'Zadatak sa zvezdicom' };

/** `1 zabeležena aktivnost`, `2 zabeležene aktivnosti`, `5 zabeleženih aktivnosti`. */
export function brojAktivnosti(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) {
    return `${n} zabeležena aktivnost`;
  }
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) {
    return `${n} zabeležene aktivnosti`;
  }
  return `${n} zabeleženih aktivnosti`;
}

/**
 * Predavanje (`/predavanja/:id`): dok nije završeno, beleženje uživo (mreža pločica, brzi unos, stariji studenti,
 * "Završi predavanje"); posle toga pregled samo za čitanje sa listom aktivnosti i napomena. Backend ne može da vrati
 * završeno predavanje u tok (`PATCH predavanja/{id}` samo postavlja `zavrseno=true`), pa "Nastavi beleženje" ne postoji.
 */
@Component({
  selector: 'app-predavanje-detalj',
  imports: [
    BrziUnos,
    EmptyState,
    ErrorPanel,
    IndeksPipe,
    MatButton,
    MatIcon,
    PredavanjeZaglavlje,
    RouterLink,
    SkeletonRows,
    StudentskaPlocica,
  ],
  providers: [PredavanjeStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './predavanje-detalj.html',
  styleUrl: './predavanje-detalj.scss',
})
export class PredavanjeDetalj {
  protected readonly store = inject(PredavanjeStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly mrvice = inject(BreadcrumbService);
  private readonly preference = inject(PreferencesStore);
  private readonly obavestenja = inject(NotificationStore);

  /** Id iz putanje (`withComponentInputBinding`); matcher rute već propušta samo brojeve. */
  readonly id = input.required<string>();

  protected readonly pId = computed(() => (JE_ID.test(this.id()) ? Number(this.id()) : null));
  protected readonly tipTekst = TIP_TEKST;
  /** Stabilna referenca (ulaz zaglavlja), da se ne pravi nova funkcija pri svakoj detekciji promena. */
  protected readonly sacuvajZaglavlje = (izmena: IzmenaZaglavlja) => this.store.izmeniZaglavlje(izmena);

  /** Aktivnosti za pregled završenog predavanja, redom pločica (prirodni red indeksa). */
  protected readonly aktivnosti = computed(() => {
    const p = this.store.predavanje();
    if (!p) {
      return [];
    }
    const red = new Map(this.store.studenti().map((s, i) => [s.id, i]));
    return [...p.aktivnosti].sort((a, b) => (red.get(a.student?.id) ?? 1e9) - (red.get(b.student?.id) ?? 1e9));
  });
  protected readonly napomenePoStudentu = computed(
    () => new Map((this.store.predavanje()?.aktivnosti ?? []).filter(a => a.napomene).map(a => [a.student.id, a.napomene])),
  );
  /** `Predavanje 12 · Petlje` (string, pa se menja samo kad se promeni broj ili tema). */
  protected readonly naslov = computed(() => {
    const p = this.store.predavanje();
    const tema = p?.tema?.trim();
    return p ? `Predavanje ${p.rb}${tema ? ' · ' + tema : ''}` : null;
  });
  protected readonly godinePoStudentu = computed(() => new Map(this.store.studenti().map(s => [s.id, s.godina])));

  constructor() {
    effect(() => {
      const id = this.pId();
      if (id !== null) {
        untracked(() => this.store.ucitaj(id));
      }
    });

    // mrvice i "Nedavno" kad stigne predavanje i posle izmene teme ili broja (ne na svaki klik na pločicu)
    effect(() => {
      const naslov = this.naslov();
      const id = untracked(() => this.store.predavanje()?.id);
      if (naslov === null || id === undefined) {
        return;
      }
      untracked(() => {
        this.mrvice.postavi(naslov);
        this.preference.zabeleziNedavno({ tip: 'predavanje', id, naslov, url: `/predavanja/${id}` });
      });
    });
  }

  protected ponovo(): void {
    const id = this.pId();
    if (id !== null) {
      this.store.ucitaj(id);
    }
  }

  /** Brzi unos: Enter = prisutan; već prisutnog ne menja. */
  protected brziUnos(sId: number): void {
    const s = this.store.studenti().find(x => x.id === sId);
    if (!s) {
      return;
    }
    if ((this.store.stanjePoStudentu()[sId] ?? 'odsutan') === 'odsutan') {
      this.store.postavi(sId, 'prisutan');
    } else {
      this.obavestenja.info(`${s.ime} ${s.prezime} je već zabeležen.`, { grupa: `predavanje-${this.pId()}` });
    }
  }

  /** "Stariji studenti": birač (tab "Stariji studenti"), izabrani dobijaju pločicu i beleže se kao prisutni. */
  protected dodajStarije(): void {
    const grupa = this.store.predavanje()?.grupa;
    if (!grupa) {
      return;
    }
    StudentPicker.otvori(this.dialog, {
      grupaId: grupa.id,
      iskljuci: this.store.studenti().map(s => s.id),
      naslov: 'Stariji studenti na predavanju',
      pocetniRezim: 'stariji',
    }).subscribe(izabrani => {
      this.store.dodajStarije(izabrani);
      for (const s of izabrani) {
        this.store.postavi(s.id, 'prisutan');
      }
    });
  }

  protected napomena(sId: number): void {
    const s = this.store.studenti().find(x => x.id === sId);
    if (!s) {
      return;
    }
    NapomenaDialog.otvori(this.dialog, { student: `${s.ime} ${s.prezime}`, napomena: this.napomenePoStudentu().get(sId) ?? null })
      .pipe(filter((t): t is string => t !== undefined))
      .subscribe(tekst => void this.store.napomena(sId, tekst));
  }

  protected postavi(sId: number, stanje: StanjeStudenta): void {
    this.store.postavi(sId, stanje);
  }

  protected zavrsi(): void {
    const b = this.store.brojevi();
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Završi predavanje?',
      tekst: `Prisutno: ${b.prisutnoUkupno}. Završeno predavanje se više ne menja na ovom ekranu i ne može se ponovo otvoriti za beleženje.`,
      potvrdi: 'Završi predavanje',
    })
      .pipe(filter(Boolean))
      .subscribe(() => void this.store.zavrsi());
  }

  protected obrisi(): void {
    const n = this.store.predavanje()?.aktivnosti.length ?? 0;
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Obriši predavanje?',
      tekst: `Briše se predavanje i ${brojAktivnosti(n)}. Domaći vezani za predavanje ostaju, bez veze sa njim. Ovo se ne može poništiti.`,
      potvrdi: 'Obriši',
      destruktivno: true,
    })
      .pipe(
        filter(Boolean),
        switchMap(() => this.store.obrisi()),
        filter(Boolean),
      )
      .subscribe(() => void this.router.navigate(['/predavanja']));
  }
}

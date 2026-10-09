import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppRoutes } from '../../../app.routes';
import { IzvodjenjaApi } from '../data-access/izvodjenja.api';
import { imaBrojeve, mozePregled, opisVeze } from '../data-access/izvodjenje-pravila';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { razlogGreske } from '../data-access/razlog-greske';
import { IzvodjenjeInfo } from '../data-access/uzivo.models';
import { kodSaRazmakom } from '../ui/format';
import { potvrdi } from '../ui/potvrda.dialog';

/**
 * Izvođenja jedne prezentacije (spec 6.2), najnovije prvo: aktivno ima "Nastavi" (konzola), završeno sa čuvanjem
 * "Pregled", završeno "Obriši" uz potvrdu (aktivno se ne briše, server vraća 409).
 */
@Component({
  selector: 'app-izvodjenja-lista',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <main class="uz-ed-strana">
      <header class="uz-ed-strana-zaglavlje">
        <a mat-icon-button [routerLink]="'/' + rute.prezentacija(prezentacijaId)" aria-label="Nazad na prezentaciju">
          <mat-icon>arrow_back</mat-icon>
        </a>
        <h1>Izvođenja{{ naziv() ? ': ' + naziv() : '' }}</h1>
      </header>

      @if (greska(); as g) {
        <p class="uz-ed-greska" role="alert">{{ g }}</p>
      }

      @if (lista(); as l) {
        @if (l.length) {
          <div class="uz-ed-tabela-okvir">
            <table class="uz-ed-tabela">
              <thead>
                <tr>
                  <th scope="col">Početak</th>
                  <th scope="col">Grupa / predavanje</th>
                  <th scope="col">Čuvanje</th>
                  <th scope="col">Status</th>
                  <th scope="col" class="uz-ed-broj">Učesnika</th>
                  <th scope="col" class="uz-ed-broj">Pitanja</th>
                  <th scope="col"><span class="uz-sr">Radnje</span></th>
                </tr>
              </thead>
              <tbody>
                @for (i of l; track i.id) {
                  <tr>
                    <td>{{ i.pocetak | date: 'd.M.yyyy. HH:mm' }}</td>
                    <td>{{ veza(i) }}</td>
                    <td>{{ i.cuvanje ? 'Sačuvano' : 'Ne čuva se' }}</td>
                    <td>
                      @if (i.status === 'AKTIVNO') {
                        <span class="uz-cip uz-ed-u-toku">U toku</span>
                        <span class="uz-ed-napomena">kod {{ kod(i.kod) }}</span>
                      } @else {
                        Završeno
                      }
                    </td>
                    <td class="uz-ed-broj">{{ brojevi(i) ? i.brojUcesnika : '–' }}</td>
                    <td class="uz-ed-broj">{{ brojevi(i) ? i.brojPitanja : '–' }}</td>
                    <td class="uz-ed-radnje">
                      @if (i.status === 'AKTIVNO') {
                        <a mat-flat-button [routerLink]="'/' + rute.izvodjenjeKonzola(i.id)">Nastavi</a>
                      }
                      @if (pregled(i)) {
                        <a mat-button [routerLink]="'/' + rute.izvodjenjePregled(i.id)"
                           [attr.aria-label]="'Pregled izvođenja od ' + (i.pocetak | date: 'd.M.yyyy. HH:mm')">Pregled</a>
                      }
                      @if (i.status === 'ZAVRSENO') {
                        <button mat-button type="button" [disabled]="brise() === i.id" (click)="obrisi(i)"
                                [attr.aria-label]="'Obriši izvođenje od ' + (i.pocetak | date: 'd.M.yyyy. HH:mm')">Obriši</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <section class="uz-ed-prazno-stanje">
            <mat-icon aria-hidden="true">history</mat-icon>
            <h2>Ova prezentacija još nije izvođena.</h2>
            <p>Pokrenuta izvođenja se pojavljuju ovde, a sačuvani rezultati ostaju dostupni i posle časa.</p>
            <a mat-flat-button color="primary" [routerLink]="'/' + rute.prezentacija(prezentacijaId)">Nazad na prezentaciju</a>
          </section>
        }
      } @else if (!greska()) {
        <mat-progress-bar mode="indeterminate" aria-label="Učitavanje izvođenja" />
      }
    </main>
  `,
})
export class IzvodjenjaListaPage {
  private readonly api = inject(IzvodjenjaApi);
  private readonly prezentacije = inject(PrezentacijeApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  protected readonly rute = AppRoutes;
  protected readonly prezentacijaId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  protected readonly lista = signal<IzvodjenjeInfo[] | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly brise = signal<number | null>(null);
  private readonly nazivIzDetalja = signal<string | null>(null);
  protected readonly naziv = computed(() => this.nazivIzDetalja() ?? this.lista()?.[0]?.prezentacija.naziv ?? null);

  protected readonly veza = opisVeze;
  protected readonly kod = kodSaRazmakom;
  protected readonly brojevi = imaBrojeve;
  protected readonly pregled = mozePregled;

  constructor() {
    this.api.lista(this.prezentacijaId).subscribe({
      next: l => this.lista.set(l),
      error: e => this.greska.set(razlogGreske(e, 'Izvođenja nisu učitana.')),
    });
    // Naziv se čita i posebno, da zaglavlje ima naslov i kad lista još nema nijedno izvođenje.
    this.prezentacije.detalji(this.prezentacijaId).subscribe({ next: p => this.nazivIzDetalja.set(p.naziv), error: () => undefined });
  }

  protected obrisi(i: IzvodjenjeInfo): void {
    const poruke = i.cuvanje
      ? ['Izvođenje sa svim sačuvanim odgovorima i rang-listom biće trajno obrisano.']
      : ['Izvođenje će nestati iz liste. Odgovori ove sesije ionako nisu čuvani.'];
    potvrdi(this.dialog, { naslov: 'Obrisati izvođenje?', poruke, potvrdi: 'Obriši', opasno: true }).subscribe(da => {
      if (!da) return;
      this.brise.set(i.id);
      this.api.obrisi(i.id).subscribe({
        next: () => {
          this.brise.set(null);
          this.lista.update(l => l?.filter(x => x.id !== i.id) ?? l);
          this.snack.open('Izvođenje je obrisano.', undefined, { duration: 4000 });
        },
        error: e => {
          this.brise.set(null);
          this.snack.open(razlogGreske(e, 'Brisanje nije uspelo.'), 'U redu', { duration: 8000 });
        },
      });
    });
  }
}

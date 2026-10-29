import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBar } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { PrezentacijaZaIzbor, PrezentacijePredavanjaApi, StavkaIzbora } from '../../../core/api/prezentacije-predavanja.api';
import { IzborPrezentacije, RedIzbora } from '../../../shared/ui/izbor-prezentacije';
import { IzvodjenjaApi } from '../data-access/izvodjenja.api';
import { javiNovoIzvodjenje } from '../data-access/novo-izvodjenje';
import { razlogGreske } from '../data-access/razlog-greske';
import { IzvodjenjeInfo, PokreniCmd } from '../data-access/uzivo.models';
import { UzivoPutanje } from '../uzivo-putanje';

/** "23 učesnika", "1 učesnik", "21 učesnik". */
export function brojUcesnika(n: number): string {
  return `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'učesnik' : 'učesnika'}`;
}

/** Trajanje iz `LocalDateTime` bez zone: "41 min", "1 h 05 min"; bez kraja `null`. */
export function trajanje(pocetak: string, kraj: string | null): string | null {
  if (!kraj) return null;
  const min = Math.max(0, Math.round((new Date(kraj).getTime() - new Date(pocetak).getTime()) / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/**
 * Komanda novog izvođenja posle završenog: sa predavanjem isto predavanje (grupa i čuvanje kao u dijalogu predavanja),
 * bez njega ista grupa i isto čuvanje. Bodovan run se ne nastavlja sam (traži čekiranje); pokreće se sa predavanja.
 */
export function komandaNastavka(iz: IzvodjenjeInfo): PokreniCmd {
  return iz.predavanje
    ? { cuvanje: true, grupaId: null, predavanjeId: iz.predavanje.id, boduje: false }
    : { cuvanje: iz.cuvanje, grupaId: iz.grupa?.id ?? null, predavanjeId: null, boduje: false };
}

interface SveCfg {
  redovi: RedIzbora[];
  naslov: string;
}

/** "Vidi sve prezentacije": isti izbor kao na predavanju, u iskačućem prozoru (strana se ne menja). */
@Component({
  selector: 'app-sve-prezentacije-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, IzborPrezentacije],
  template: `
    <h2 mat-dialog-title>{{ cfg.naslov }}</h2>
    <mat-dialog-content>
      <app-izbor-prezentacije [redovi]="cfg.redovi" naslovListe="" (pokreni)="ref.close($event)" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Zatvori</button>
    </mat-dialog-actions>
  `,
})
export class SvePrezentacijeDialog {
  protected readonly cfg = inject<SveCfg>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<SvePrezentacijeDialog, PrezentacijaZaIzbor>>(MatDialogRef);
}

/**
 * Završni ekran konzole (umesto skoka na pregled): rezime, 2-3 predloga sledeće prezentacije (`GET prezentacije/izbor`: za
 * grupu po onome što je puštala, bez grupe sledeće po redu), "Vidi sve prezentacije" (iskačući prozor) i povratak na
 * predavanje ili listu prezentacija. "Pokreni" pokreće novo izvođenje u ISTOJ kartici (konzola prelazi na njega) i javlja
 * prozoru publike da i on pređe ({@link javiNovoIzvodjenje}). Prati dan/noć aplikacije (konzola ga traži od layouta).
 */
@Component({
  selector: 'app-kraj-izvodjenja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatProgressBar, IzborPrezentacije],
  host: { class: 'uz-kraj' },
  template: `
    <header class="uz-kon-zaglavlje">
      <div class="uz-kon-naslovi">
        <h1 class="uz-kon-naziv">{{ iz().prezentacija.naziv }}</h1>
        <p class="uz-kon-meta">
          <span>Završeno</span>
          @if (iz().grupa; as g) { <span>{{ g.naziv }}</span> }
          @if (iz().predavanje; as p) { <span>{{ p.rb }}. predavanje</span> }
        </p>
      </div>
    </header>
    <div class="uz-kraj-telo">
      <section class="uz-kraj-kartica uz-kraj-rezime" aria-labelledby="uz-kraj-naslov">
        <div>
          <h2 id="uz-kraj-naslov" class="uz-kraj-naslov" tabindex="-1">Izvođenje je završeno</h2>
          <p class="uz-kraj-meta">{{ rezime() }}</p>
        </div>
        @if (iz().cuvanje) {
          <a mat-stroked-button [routerLink]="'/' + rute.izvodjenjePregled(iz().id)" data-rezultati>Rezultati</a>
        }
      </section>

      @if (ucitava()) {
        <mat-progress-bar mode="indeterminate" aria-label="Učitavanje predloga" />
      }
      @if (greska(); as g) {
        <p class="uz-kraj-greska" role="alert" data-greska>{{ g }}</p>
      }
      @if (!ucitava() && predlog().length) {
        <app-izbor-prezentacije [redovi]="redovi()" [predlog]="predlog()" [naslovPredloga]="naslovPredloga()" [lista]="false"
                                [zauzeto]="salje()" (pokreni)="pokreni($event)" />
      } @else if (!ucitava() && !greskaUcitavanja()) {
        <p class="uz-kraj-meta" data-bez-predloga>
          {{ iz().grupa ? 'Nema predloga: sve prezentacije sa brojem vežbe su puštene ovoj grupi.' : 'Nema predloga za sledeću prezentaciju.' }}
        </p>
      }

      <div class="uz-kraj-akcije">
        <button mat-stroked-button type="button" [disabled]="ucitava() || greskaUcitavanja()" data-vidi-sve (click)="vidiSve()">
          Vidi sve prezentacije
        </button>
        @if (iz().predavanje; as p) {
          <button mat-stroked-button type="button" data-nazad-predavanje (click)="nazadNaPredavanje(p.id)">← Nazad na predavanje</button>
        } @else {
          <a mat-stroked-button [routerLink]="'/' + rute.prezentacije" data-nazad-prezentacije>← Nazad na prezentacije</a>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .uz-kraj-telo { display: grid; gap: 18px; max-width: 760px; margin: 0 auto; padding: 20px 16px 32px; }
    .uz-kraj-kartica { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
    .uz-kraj-naslov { margin: 0; font-size: 18px; font-weight: 600; }
    .uz-kraj-naslov:focus { outline: none; }
    .uz-kraj-meta { margin: 2px 0 0; color: var(--muted); font-size: 14px; }
    .uz-kraj-greska { margin: 0; color: var(--danger-ink); }
    .uz-kraj-akcije { display: flex; flex-wrap: wrap; gap: 10px; }
  `,
})
export class KrajIzvodjenjaComponent {
  readonly izvodjenje = input.required<IzvodjenjeInfo>();

  private readonly izborApi = inject(PrezentacijePredavanjaApi);
  private readonly izvodjenjaApi = inject(IzvodjenjaApi);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  protected readonly rute = UzivoPutanje;

  protected readonly iz = this.izvodjenje;
  protected readonly ucitava = signal(true);
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  protected readonly greskaUcitavanja = signal(false);
  private readonly stavke = signal<StavkaIzbora[]>([]);
  protected readonly predlog = signal<number[]>([]);

  protected readonly rezime = computed(() => {
    const iz = this.iz();
    return [brojUcesnika(iz.brojUcesnika), trajanje(iz.pocetak, iz.kraj)].filter(Boolean).join(' · ');
  });
  protected readonly naslovPredloga = computed(() => {
    const g = this.iz().grupa;
    return g ? `Sledeće za ${g.naziv}` : 'Sledeće po redu';
  });
  /** Sa grupom "puštano" je za tu grupu, bez nje poslednje puštanje bilo koje. */
  protected readonly redovi = computed<RedIzbora[]>(() => {
    const saGrupom = !!this.iz().grupa;
    return this.stavke().map(s => ({
      p: s.prezentacija,
      pusteno: saGrupom ? s.pustenoGrupi : s.prezentacija.poslednjePustanje,
      stanje: s.prezentacija.aktivnoIzvodjenjeId ? { vrsta: 'zauzeta' as const } : { vrsta: 'slobodna' as const },
    }));
  });

  constructor() {
    let ucitavanje: Subscription | undefined;
    inject(DestroyRef).onDestroy(() => ucitavanje?.unsubscribe());
    effect(() => {
      const iz = this.iz();
      untracked(() => {
        ucitavanje?.unsubscribe();
        this.ucitava.set(true);
        this.greska.set(null);
        this.greskaUcitavanja.set(false);
        ucitavanje = this.izborApi.izbor(iz.prezentacija.predmetId, iz.grupa?.id ?? null, iz.grupa ? null : iz.prezentacija.id)
          .subscribe({
            next: izbor => {
              this.stavke.set(izbor.stavke);
              this.predlog.set(izbor.predlog);
              this.ucitava.set(false);
            },
            error: e => {
              this.greska.set(razlogGreske(e, 'Prezentacije nisu učitane.'));
              this.greskaUcitavanja.set(true);
              this.ucitava.set(false);
            },
          });
      });
    });
  }

  protected vidiSve(): void {
    if (this.ucitava() || this.greskaUcitavanja() || this.dialog.openDialogs.length) return;
    this.dialog.open<SvePrezentacijeDialog, SveCfg, PrezentacijaZaIzbor>(SvePrezentacijeDialog, {
      data: { redovi: this.redovi(), naslov: 'Sve prezentacije' }, width: '40rem', maxWidth: '96vw', autoFocus: 'first-tabbable',
    }).afterClosed().subscribe(p => {
      if (p) this.pokreni(p);
    });
  }

  protected pokreni(p: PrezentacijaZaIzbor): void {
    if (this.salje()) return;
    const iz = this.iz();
    this.salje.set(true);
    this.greska.set(null);
    this.izvodjenjaApi.pokreni(p.id, komandaNastavka(iz)).subscribe({
      next: novo => {
        javiNovoIzvodjenje(iz.id, novo.id);
        void this.router.navigate(['/' + UzivoPutanje.izvodjenjeKonzola(novo.id)]);
      },
      error: e => {
        this.salje.set(false);
        this.greska.set(razlogGreske(e, 'Prezentacija nije pokrenuta.'));
      },
    });
  }

  /**
   * Konzola sa predavanja je otvorena u novoj kartici (`window.open`), pa je zatvaranje vraća na karticu predavanja koja
   * je i dalje otvorena (bez dve kartice istog predavanja). Ako pregledač ne dozvoli zatvaranje (kartica otvorena rukom),
   * ova kartica prelazi na predavanje.
   */
  protected nazadNaPredavanje(predavanjeId: number): void {
    window.close();
    setTimeout(() => {
      if (!window.closed) void this.router.navigate(['/predavanja', predavanjeId]);
    }, 300);
  }
}

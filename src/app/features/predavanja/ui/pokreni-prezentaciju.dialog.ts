import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatProgressBar } from '@angular/material/progress-bar';
import { forkJoin, Observable } from 'rxjs';

import { IzvodjenjeNaPredavanju, PrezentacijaZaIzbor, PrezentacijePredavanjaApi, StavkaIzbora } from '../../../core/api/prezentacije-predavanja.api';
import { IzborPrezentacije, RedIzbora, StanjeStavke } from '../../../shared/ui/izbor-prezentacije';
import { razlogZahteva } from '../data-access/prezentacije-predavanja.store';
import { konzolaIzvodjenja } from './izvodjenje-putanje';

export type { StanjeStavke } from '../../../shared/ui/izbor-prezentacije';

/** Ishod dijaloga: pokrenuto izvođenje i da li se konzola otvorila u novoj kartici (`false` = pregledač je blokirao karticu). */
export interface PokrenutaPrezentacija {
  izvodjenjeId: number;
  otvorena: boolean;
}

export interface PokreniPrezentacijuCfg {
  predavanjeId: number;
  predmetId: number;
  /** Grupa predavanja: predlog "Sledeće za <grupa>" prati šta je ona puštala; bez grupe nema predloga. */
  grupa?: { id: number; naziv: string } | null;
}

/** Apsolutni URL konzole izvođenja (`<base href>` + putanja), za novu karticu. */
export function urlKonzole(dokument: Document, izvodjenjeId: number): string {
  return new URL(konzolaIzvodjenja(izvodjenjeId), dokument.baseURI).href;
}

export function stanjeStavke(p: PrezentacijaZaIzbor, uTokuOvde: readonly IzvodjenjeNaPredavanju[]): StanjeStavke {
  if (p.aktivnoIzvodjenjeId === null || p.aktivnoIzvodjenjeId === undefined) return { vrsta: 'slobodna' };
  const ovde = uTokuOvde.find(i => i.id === p.aktivnoIzvodjenjeId);
  return ovde ? { vrsta: 'nastavi', izvodjenjeId: ovde.id } : { vrsta: 'zauzeta' };
}

/**
 * Izbor prezentacije predmeta za predavanje u toku: na vrhu predlog "Sledeće za <grupa>" (`GET prezentacije/izbor`, po onome
 * što je grupa puštala), ispod sve prezentacije po vežbama sa filterom vrste i pretragom ({@link IzborPrezentacije}).
 * "Pokreni" odmah pokreće izvođenje vezano za predavanje (sa čuvanjem) i
 * otvara konzolu u NOVOJ kartici, da beleženje na ovoj stranici ne prestane. Kartica se otvara sinhrono iz klika (prazna
 * `about:blank`), a adresa joj se postavlja kad server odgovori: `window.open` posle asinhronog poziva blokiraju pregledači
 * (Safari odmah). Ako je i prazna kartica blokirana, izvođenje je ipak pokrenuto i dijalog se zatvara; stranica predavanja
 * nudi "Nastavi" u svom odeljku. "Nastavi" (izvođenje u toku za ovo predavanje) je običan link u novu karticu, bez drugog starta.
 * Prezentacija u toku negde drugde (bez predavanja ili za drugo) ne može dvaput u toku (server: 409), pa je ovde zaključana.
 */
@Component({
  selector: 'app-pokreni-prezentaciju-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IzborPrezentacije, MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatProgressBar],
  template: `
    <h2 mat-dialog-title>Pokreni prezentaciju</h2>
    <mat-dialog-content>
      @if (ucitava()) {
        <mat-progress-bar mode="indeterminate" aria-label="Učitavanje prezentacija" />
      }
      @if (greska(); as g) {
        <p class="greska" role="alert" data-greska>{{ g }}</p>
      }
      @if (!ucitava() && redovi().length === 0 && !greskaUcitavanja()) {
        <p class="prazno" data-prazno>Ovaj predmet još nema prezentacija. Napravi je u odeljku Prezentacije.</p>
      }
      @if (redovi().length) {
        <app-izbor-prezentacije [redovi]="redovi()" [predlog]="predlog()" [naslovPredloga]="naslovPredloga()"
                                [zauzeto]="salje()" [urlNastavi]="urlFn" (pokreni)="pokreni($event)" />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Zatvori</button>
    </mat-dialog-actions>
  `,
  styles: `
    .greska { color: var(--danger-ink); margin: 0 0 8px; }
    .prazno { color: var(--muted); }
  `,
})
export class PokreniPrezentacijuDialog {
  private readonly cfg = inject<PokreniPrezentacijuCfg>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<PokreniPrezentacijuDialog, PokrenutaPrezentacija>>(MatDialogRef);
  private readonly api = inject(PrezentacijePredavanjaApi);
  private readonly dokument = inject(DOCUMENT);

  protected readonly ucitava = signal(true);
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  protected readonly greskaUcitavanja = signal(false);
  private readonly stavke = signal<StavkaIzbora[]>([]);
  protected readonly predlog = signal<number[]>([]);
  private readonly uTokuOvde = signal<IzvodjenjeNaPredavanju[]>([]);
  protected readonly naslovPredloga = computed(() => `Sledeće za ${this.cfg.grupa?.naziv ?? 'grupu'}`);
  protected readonly urlFn = (id: number) => this.url(id);

  protected readonly redovi = computed<RedIzbora[]>(() => this.stavke().map(s => ({
    p: s.prezentacija, pusteno: s.pustenoGrupi, stanje: stanjeStavke(s.prezentacija, this.uTokuOvde()),
  })));

  constructor() {
    forkJoin({
      izbor: this.api.izbor(this.cfg.predmetId, this.cfg.grupa?.id ?? null),
      izvodjenja: this.api.izvodjenja(this.cfg.predavanjeId),
    }).pipe(takeUntilDestroyed()).subscribe({
      next: ({ izbor, izvodjenja }) => {
        this.stavke.set(izbor.stavke);
        this.predlog.set(this.cfg.grupa ? izbor.predlog : []);
        this.uTokuOvde.set(izvodjenja.filter(i => i.status === 'AKTIVNO'));
        this.ucitava.set(false);
      },
      error: e => {
        this.greskaUcitavanja.set(true);
        this.greska.set(razlogZahteva(e));
        this.ucitava.set(false);
      },
    });
  }

  protected url(izvodjenjeId: number): string {
    return urlKonzole(this.dokument, izvodjenjeId);
  }

  protected pokreni(p: PrezentacijaZaIzbor): void {
    if (this.salje()) return;
    this.salje.set(true);
    this.greska.set(null);
    // sinhrono iz klika: prazna kartica; adresa joj se postavlja kad server odgovori
    const kartica = this.dokument.defaultView?.open('about:blank', '_blank') ?? null;
    if (kartica) kartica.opener = null;
    this.api.pokreni(p.id, this.cfg.predavanjeId).subscribe({
      next: i => {
        if (kartica) kartica.location.href = this.url(i.id);
        this.ref.close({ izvodjenjeId: i.id, otvorena: kartica !== null });
      },
      error: e => {
        kartica?.close();
        this.salje.set(false);
        this.greska.set(razlogZahteva(e));
      },
    });
  }

  /** Emituje pokrenuto izvođenje ili `undefined` kad nastavnik zatvori dijalog bez pokretanja. */
  static otvori(dialog: MatDialog, cfg: PokreniPrezentacijuCfg): Observable<PokrenutaPrezentacija | undefined> {
    return dialog.open<PokreniPrezentacijuDialog, PokreniPrezentacijuCfg, PokrenutaPrezentacija>(PokreniPrezentacijuDialog, {
      data: cfg, width: '36rem', maxWidth: '96vw', autoFocus: 'first-tabbable',
    }).afterClosed();
  }
}

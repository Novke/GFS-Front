import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, Injector } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { sRecju } from '../../shared/util/mnozina';
import { PORUKA_SISTEM, toApiError } from '../api/api-error';
import { SesijaStore } from '../auth/sesija.store';
import { NesacuvaneIzmene } from '../state/nesacuvane-izmene';
import { NotificationStore } from '../state/notification.store';

/**
 * Meni nastavnika u gornjoj traci: "Instaliraj na telefon" (stranica Podešavanja -> Obaveštenja na telefonu), "Prijavljeni
 * uređaji" (lenji `./sesije.dialog`) i "Odjava".
 *
 * Odjava: ako sesije čuvanja imaju nesačuvanog (`NesacuvaneIzmene`), prvo pita (`ConfirmDialog`). Posle `SesijaStore.odjavi()`
 * uvek vodi na `/prijava` bez `nazad`, i kad server odgovori 401 (sesije već nema; store to prima kao uspeh, a 401 na
 * `api/auth/odjava` nije "istek sesije" za interceptor, pa nema druge navigacije). Druga greška (mreža, 5xx) znači da
 * kolačić na serveru i dalje važi: nastavnik ostaje gde je, a poruka ide u snackbar.
 */
@Component({
  selector: 'app-korisnik-meni',
  imports: [MatIcon, MatIconButton, MatMenu, MatMenuItem, MatMenuTrigger, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button mat-icon-button type="button" class="okidac" data-korisnik [matMenuTriggerFor]="meni" [attr.aria-label]="labela()">
      <mat-icon svgIcon="account_circle" aria-hidden="true" />
    </button>
    <mat-menu #meni="matMenu" xPosition="before">
      @if (sesija.korisnik(); as korisnik) {
        <div class="ko" aria-hidden="true">{{ korisnik }}</div>
      }
      <a mat-menu-item routerLink="/podesavanja/obavestenja" data-instaliraj-telefon>
        <mat-icon svgIcon="notifications" aria-hidden="true" />
        <span>Instaliraj na telefon</span>
      </a>
      <button mat-menu-item type="button" data-uredjaji (click)="uredjaji()">
        <mat-icon svgIcon="devices" aria-hidden="true" />
        <span>Prijavljeni uređaji</span>
      </button>
      <button mat-menu-item type="button" data-odjava (click)="odjava()">
        <mat-icon svgIcon="logout" aria-hidden="true" />
        <span>Odjava</span>
      </button>
    </mat-menu>
  `,
  styles: `
    :host { display: inline-flex; }
    .okidac { color: var(--ink); }
    .ko { padding: 8px 16px 6px; color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }
  `,
})
export class KorisnikMeni {
  protected readonly sesija = inject(SesijaStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private odjavaUToku = false;

  protected readonly labela = computed(() => {
    const korisnik = this.sesija.korisnik();
    return korisnik ? `Nalog: ${korisnik}` : 'Nalog nastavnika';
  });

  protected async uredjaji(): Promise<void> {
    try {
      const { SesijeDialog } = await this.ucitajSesijeDialog();
      SesijeDialog.otvori(this.dialog);
    } catch {
      // lenji chunk nije stigao (npr. posle novog izdanja su hešovi fajlova drugi): bez povratne informacije klik bi bio mrtav
      this.injector.get(NotificationStore).greska('Nije moguće otvoriti listu uređaja. Osveži stranicu.');
    }
  }

  /** Lenji chunk dijaloga (izdvojeno da test može da simulira neuspelo učitavanje). */
  protected ucitajSesijeDialog(): Promise<typeof import('./sesije.dialog')> {
    return import('./sesije.dialog');
  }

  protected async odjava(): Promise<void> {
    if (this.odjavaUToku) {
      return;
    }
    // registar nesačuvanog se uzima tek ovde: bez ekrana koji čuva ne treba ni da postoji
    const n = this.injector.get(NesacuvaneIzmene).broj();
    if (n > 0) {
      const ipak = await firstValueFrom(
        ConfirmDialog.otvori(this.dialog, {
          naslov: 'Odjaviti se?',
          tekst: `Nije sačuvano: ${sRecju(n, 'izmena', 'izmene', 'izmena')}. Ako se sada odjaviš, te izmene se gube.`,
          potvrdi: 'Odjavi se',
          destruktivno: true,
        }),
      );
      if (!ipak) {
        return;
      }
    }
    this.odjavaUToku = true;
    try {
      await this.sesija.odjavi();
    } catch (e: unknown) {
      this.odjavaUToku = false;
      const razlog = e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
      this.injector.get(NotificationStore).greska(`Odjava nije uspela: ${razlog}`);
      return;
    }
    try {
      await this.router.navigateByUrl('/prijava');
    } finally {
      this.odjavaUToku = false;
    }
  }
}

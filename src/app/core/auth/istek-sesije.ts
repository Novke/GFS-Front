import { inject, Injectable, Injector } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { Observable, of, take } from 'rxjs';

import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { sRecju } from '../../shared/util/mnozina';
import { nazadIzUrla } from '../../shared/util/nazad';
import { NesacuvaneIzmene } from '../state/nesacuvane-izmene';
import { NotificationStore } from '../state/notification.store';
import { urlPrijave } from './nastavnik.guard';
import { SesijaStore } from './sesija.store';

/** Poruka kad nastavnik posle isteka ostane na ekranu (sam je odustao od odlaska na prijavu). */
export const PORUKA_OSTAO = 'Prijava je istekla, pa se izmene ne čuvaju. Prijavi se u novoj kartici, pa ovde ponovi čuvanje.';

/** Da li neka aktivna ruta ima `canDeactivate` (forma sa svojim pitanjem "Napustiti stranicu?"). */
function imaCuvarNapustanja(r: ActivatedRouteSnapshot | null): boolean {
  return !!r && (!!r.routeConfig?.canDeactivate?.length || r.children.some(imaCuvarNapustanja));
}

const jePrijava = (url: string) => url === '/prijava' || url.startsWith('/prijava?');

/**
 * Šta se radi kad server odbije sesiju nastavnika (401 sa nastavničkog API-ja), jednom za sve paralelne zahteve:
 * `SesijaStore.ponisti()` i navigacija **kroz ruter** na `/prijava?nazad=<trenutni URL>`, pa posle prijave nastavnik
 * stiže tačno gde je bio.
 *
 * Nesačuvan rad se ne gubi bez pitanja:
 * - Forma sa `canDeactivate` (`unsavedChangesGuard`) pita sama, jer navigacija ide kroz ruter.
 * - Ekrani koji čuvaju red po red (`RegistarCuvanja`: predavanje, domaći, test) nemaju čuvar rute: kad ima nesačuvanog
 *   (`NesacuvaneIzmene.broj()`, isto što pita pre zatvaranja kartice), ovde se otvara `ConfirmDialog`. Odlazak bi zatvorio
 *   sesiju čuvanja, a redovi čije je čuvanje palo zbog 401 bi nestali sa ekranom.
 * Kad nastavnik ostane ("Odustani" u bilo kom od ta dva pitanja), dobija {@link PORUKA_OSTAO}; dok je na istom URL-u,
 * novi 401 (npr. sledeći red) ga više ne pita, a polja sa greškom imaju "Pokušaj ponovo" za posle prijave u drugoj kartici.
 *
 * Lenji chunk: `sesijaInterceptor` ga uvozi dinamički tek na prvi 401, pa ni dijalog ni ova logika nisu u početnom bundle-u
 * (budžet `e2e/lenji-editor.spec.ts`), a javne rute (koje nikad ne dobiju 401 nastavničkog API-ja) ga nikad ne učitaju.
 * Servisi se uzimaju lenjo (`Injector`), pa se `NesacuvaneIzmene` ne pravi pre prvog isteka.
 */
@Injectable({ providedIn: 'root' })
export class IstekSesije {
  private readonly injector = inject(Injector);
  private uToku = false;
  /** URL na kom je nastavnik odlučio da ostane; tu se više ne pita. */
  private ostaoNa: string | null = null;

  obradi(): void {
    const router = this.injector.get(Router);
    const url = router.url;
    if (this.uToku || jePrijava(url) || this.ostaoNa === url) {
      return;
    }
    this.uToku = true;
    this.ostaoNa = null;
    this.injector.get(SesijaStore).ponisti();
    this.pitajAkoTreba(router).pipe(take(1)).subscribe(ide => {
      if (!ide) {
        this.ostani(url);
        return;
      }
      router.navigateByUrl(urlPrijave(router, nazadIzUrla(url))).then(
        uspeh => {
          this.uToku = false;
          if (!uspeh && router.url === url) {
            this.ostani(url);
          }
        },
        () => (this.uToku = false),
      );
    });
  }

  private pitajAkoTreba(router: Router): Observable<boolean> {
    if (imaCuvarNapustanja(router.routerState.snapshot.root)) {
      return of(true);
    }
    const n = this.injector.get(NesacuvaneIzmene).broj();
    if (n === 0) {
      return of(true);
    }
    return ConfirmDialog.otvori(this.injector.get(MatDialog), {
      naslov: 'Prijava je istekla',
      tekst: [
        `Server više ne prima izmene sa ovog uređaja. Nije sačuvano: ${sRecju(n, 'izmena', 'izmene', 'izmena')}.`,
        'Ako sada odeš na prijavu, te izmene se gube. Da ih sačuvaš, odustani, prijavi se u novoj kartici, pa ovde ponovi čuvanje.',
      ],
      potvrdi: 'Idi na prijavu',
      destruktivno: true,
    });
  }

  private ostani(url: string): void {
    this.uToku = false;
    this.ostaoNa = url;
    this.injector.get(NotificationStore).greska(PORUKA_OSTAO);
  }
}

import { inject, Injectable, Injector } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
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

const jePrijava = (url: string) => url === '/prijava' || url.startsWith('/prijava?');

/**
 * Javne rute studenta (`PublicLayout`, bez sesije nastavnika). Nastavnički zahtev tu ne bi smeo ni da postoji (ljuska i
 * njeni store-ovi osvežavaju samo dok ljuska živi), ali zakasneli odgovor (npr. zahtev ljuske poslat pre odjave i prelaska
 * na `/nalog` u istoj kartici) ne sme studenta da odvede na `/prijava`.
 */
const JAVNA_RUTA = /^\/(upis|uzivo|nalog)(?:[/?#]|$)/;

/**
 * Šta se radi kad server odbije sesiju nastavnika (401 sa nastavničkog API-ja), jednom za sve paralelne zahteve:
 * `SesijaStore.ponisti()` i navigacija **kroz ruter** na `/prijava?nazad=<trenutni URL>`, pa posle prijave nastavnik
 * stiže tačno gde je bio.
 *
 * Nesačuvan rad se ne gubi bez pitanja:
 * - Kad sesije čuvanja (`RegistarCuvanja`: predavanje, domaći, test, editor prezentacije) imaju nesačuvanog
 *   (`NesacuvaneIzmene.broj()`, isto što pita pre zatvaranja kartice), ovde se **uvek** otvara `ConfirmDialog`, i na ruti sa
 *   `canDeactivate`: čuvar rute zna samo za svoje (npr. editor prezentacije broji nepotpune slajdove i uvoz, ne PUT-ove na
 *   čekanju ili pale zbog 401). Odlazak bi zatvorio sesiju čuvanja, a izmene čije je čuvanje palo zbog 401 bi nestale.
 * - Posle "Idi na prijavu" navigacija ide kroz ruter, pa forma sa `canDeactivate` (`unsavedChangesGuard`) još pita za
 *   svoje (drugo pitanje je prihvatljivo: odnosi se na nešto drugo); bez nesačuvanog u registru pita samo ona.
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
    // i navigacija koja još traje (npr. odjava -> /nalog): njen cilj odlučuje, ne URL koji se upravo napušta
    const cilj = router.currentNavigation()?.finalUrl ?? router.currentNavigation()?.extractedUrl;
    if ([url, cilj ? router.serializeUrl(cilj) : null].some(u => u !== null && JAVNA_RUTA.test(u))) {
      this.injector.get(SesijaStore).ponisti();
      return;
    }
    if (this.uToku || jePrijava(url) || this.ostaoNa === url) {
      return;
    }
    this.uToku = true;
    this.ostaoNa = null;
    this.injector.get(SesijaStore).ponisti();
    this.pitajAkoTreba().pipe(take(1)).subscribe(ide => {
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

  private pitajAkoTreba(): Observable<boolean> {
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

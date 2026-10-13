// Otpremanje slike iz panela Svojstva (zamena slike sloja, slika pozadine): provera pre slanja, `POST /mediji`, stanje
// "otprema se" i greška u snackbar (razlog servera). U `providers` komponente `PlatnoEditorComponent`, pa živi koliko i
// editor slajda: promena izbora ili taba (podkomponente panela nestaju) ne prekida otpremanje, a rezultat ide u CILJNI sloj
// (uhvaćen id), uz proveru da on još postoji i nije zaključan. Ako editor nestane pre odgovora (promena slajda), zahtev se
// prekida i to se javlja porukom: upis u dokument koji se više ne uređuje mogao bi da pregazi noviji.
import { Injectable, type OnDestroy, inject, signal } from '@angular/core';
import type { Subscription } from 'rxjs';
import { NotificationStore } from '../../../core/state/notification.store';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { TIPOVI_SLIKA, proveriSliku } from '../data-access/provera-slike';
import { razlogGreske } from '../data-access/razlog-greske';
import { izmeniSlojeve } from './komande';
import { PlatnoEditorStore } from './platno-editor.store';

export const PRIHVACENE_SLIKE_PANELA = TIPOVI_SLIKA.join(',');
export const PORUKA_SLAJD_ZATVOREN = 'Slika nije primenjena: slajd je zatvoren.';
export const PORUKA_SLOJ_OBRISAN = 'Slika nije primenjena: sloj je obrisan.';
export const PORUKA_SLOJ_ZAKLJUCAN = 'Slika nije primenjena: sloj je zaključan.';
export const PORUKA_GEST = 'Slika nije primenjena: platno se upravo pomeralo. Pokušaj ponovo.';

@Injectable()
export class OtpremanjeSlike implements OnDestroy {
  private readonly api = inject(PrezentacijeApi);
  private readonly obavestenja = inject(NotificationStore);
  private readonly store = inject(PlatnoEditorStore);
  private pretplata: Subscription | null = null;

  /** Otpremanje u toku (jedno po editoru: dugmad zamene i pozadine su tada onemogućena). */
  readonly salje = signal(false);

  /** Zamena slike sloja `slojId` (kutija i ostalo ostaju). */
  zameniSliku(polje: HTMLInputElement, slojId: string): void {
    this.otpremi(polje, (medijId) => {
      const s = this.store.platno().slojevi.find((x) => x.id === slojId);
      if (!s || s.tip !== 'SLIKA') {
        this.obavestenja.greska(PORUKA_SLOJ_OBRISAN);
        return;
      }
      if (s.zakljucan) {
        this.obavestenja.greska(PORUKA_SLOJ_ZAKLJUCAN);
        return;
      }
      this.primeni(() => this.store.primeni((p) => izmeniSlojeve(p, new Set([slojId]),
        (x) => (x.tip === 'SLIKA' && x.medijId !== medijId ? { ...x, medijId } : x))));
    });
  }

  /** Slika pozadine slajda. */
  postaviPozadinu(polje: HTMLInputElement): void {
    this.otpremi(polje, (medijId) => this.primeni(() => this.store.primeni((p) =>
      (p.pozadina.medijId === medijId ? p : { ...p, pozadina: { ...p.pozadina, medijId } }))));
  }

  ngOnDestroy(): void {
    if (!this.pretplata || this.pretplata.closed) return;
    this.pretplata.unsubscribe();
    this.obavestenja.greska(PORUKA_SLAJD_ZATVOREN);
  }

  /** `primeni` odbija samo usred gesta mišem (ista slika ili granice ne mogu da je odbiju): tada poruka. */
  private primeni(f: () => boolean): void {
    if (!f() && this.store.gest()) this.obavestenja.greska(PORUKA_GEST);
  }

  /** Prvi fajl iz polja (polje se prazni, pa isti fajl može ponovo). */
  private otpremi(polje: HTMLInputElement, gotovo: (medijId: string) => void): void {
    const fajl = polje.files?.[0];
    polje.value = '';
    if (!fajl || this.salje()) return;
    const greska = proveriSliku(fajl);
    if (greska) {
      this.obavestenja.greska(greska);
      return;
    }
    this.salje.set(true);
    this.pretplata = this.api.upload(fajl).subscribe({
      next: (m) => {
        this.salje.set(false);
        gotovo(m.id);
      },
      error: (e: unknown) => {
        this.salje.set(false);
        this.obavestenja.greska(razlogGreske(e, 'Slanje slike nije uspelo.'));
      },
    });
  }
}

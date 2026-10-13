// Otpremanje slike iz panela Svojstva (zamena slike sloja, slika pozadine): provera pre slanja, `POST /mediji`, stanje
// "otprema se" i greška u snackbar (razlog servera). U `providers` komponente koja ga koristi: otpremanje traje dok
// komponenta postoji (nestane li pre odgovora, npr. promena izbora, slika se ne primenjuje).
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NotificationStore } from '../../../core/state/notification.store';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { TIPOVI_SLIKA, proveriSliku } from '../data-access/provera-slike';
import { razlogGreske } from '../data-access/razlog-greske';

export const PRIHVACENE_SLIKE_PANELA = TIPOVI_SLIKA.join(',');

@Injectable()
export class OtpremanjeSlike {
  private readonly api = inject(PrezentacijeApi);
  private readonly obavestenja = inject(NotificationStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly salje = signal(false);

  /** Prvi fajl iz polja (polje se prazni, pa isti fajl može ponovo); `gotovo` dobija id medija posle uspeha. */
  izPolja(polje: HTMLInputElement, gotovo: (medijId: string) => void): void {
    const fajl = polje.files?.[0];
    polje.value = '';
    if (!fajl || this.salje()) return;
    const greska = proveriSliku(fajl);
    if (greska) {
      this.obavestenja.greska(greska);
      return;
    }
    this.salje.set(true);
    this.api.upload(fajl).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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

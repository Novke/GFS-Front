// Slika iz trake alata i prevlačenjem fajla na platno (F7, odluka 29). Tanak sloj nad `OtpremanjeSlike` (F6): isto
// otpremanje, ista provera (`proveriSliku`) i ista obrada grešaka; ovde su samo provera granice slojeva pre slanja,
// merenje prirodne veličine i ubacivanje sloja. U `providers` komponente `PlatnoEditorComponent`.
import { Injectable, InjectionToken, inject } from '@angular/core';
import { NotificationStore } from '../../../core/state/notification.store';
import type { Tacka } from '../data-access/platno.models';
import { novaSlika } from '../data-access/platno-novo';
import { prekoGranica } from '../data-access/platno-provera';
import { TIPOVI_SLIKA } from '../data-access/provera-slike';
import { slobodnoMesto } from './komande';
import { OtpremanjeSlike } from './otpremanje-slike';
import { PlatnoEditorStore } from './platno-editor.store';

export const PRIHVACENE_SLIKE = TIPOVI_SLIKA.join(',');
export const PORUKA_PREVLACENJE = 'Prevuci sliku (PNG, JPEG, GIF ili WebP).';
export const PORUKA_DIMENZIJE = 'Slika se ne može pročitati.';

export interface Dimenzije { sirina: number; visina: number; }

/** Prirodna veličina slike (px); `createImageBitmap`, a bez njega `<img>` iz object URL-a. */
export async function dimenzijeSlike(fajl: Blob): Promise<Dimenzije> {
  if (typeof createImageBitmap === 'function') {
    const bitmapa = await createImageBitmap(fajl);
    try {
      return { sirina: bitmapa.width, visina: bitmapa.height };
    } finally {
      bitmapa.close();
    }
  }
  const adresa = URL.createObjectURL(fajl);
  try {
    return await new Promise<Dimenzije>((resolve, reject) => {
      const slika = new Image();
      slika.onload = () => resolve({ sirina: slika.naturalWidth, visina: slika.naturalHeight });
      slika.onerror = () => reject(new Error(PORUKA_DIMENZIJE));
      slika.src = adresa;
    });
  } finally {
    URL.revokeObjectURL(adresa);
  }
}

export const DIMENZIJE_SLIKE = new InjectionToken<(fajl: Blob) => Promise<Dimenzije>>('DIMENZIJE_SLIKE', {
  providedIn: 'root',
  factory: () => dimenzijeSlike,
});

@Injectable()
export class SlikeEditora {
  private readonly store = inject(PlatnoEditorStore);
  private readonly otpremanje = inject(OtpremanjeSlike);
  private readonly obavestenja = inject(NotificationStore);
  private readonly dimenzije = inject(DIMENZIJE_SLIKE);

  /** Otpremanje u toku (dugme trake je tada onemogućeno). */
  readonly salje = this.otpremanje.salje;

  /** Otpremi, izmeri i ubaci sloj slike (centar: tačka spuštanja ili slobodno mesto u centru platna); greška ide u snackbar. */
  async ubaci(fajl: File, centar?: Tacka): Promise<string | null> {
    // granica slojeva pre otpremanja (isti ogledalo servera kao u store-u; sloj slike nema znakova)
    const p = this.store.platno();
    const granica = prekoGranica({ ...p, slojevi: [...p.slojevi, novaSlika('x', 'x', 1, 1)] });
    if (granica) {
      this.obavestenja.greska(granica);
      return null;
    }
    const medijId = await this.otpremanje.otpremiFajl(fajl);
    if (medijId === null) return null;
    let mere: Dimenzije;
    try {
      mere = await this.dimenzije(fajl);
    } catch {
      this.obavestenja.greska(PORUKA_DIMENZIJE);
      return null;
    }
    const id = this.store.ubaci((novi, platno) => {
      const sloj = novaSlika(novi, medijId, mere.sirina, mere.visina, centar);
      return centar ? sloj : { ...sloj, ...slobodnoMesto(platno, sloj.sirina, sloj.visina) };
    });
    // usred gesta mišem `ubaci` odbija bez poruke: javi, da slika ne nestane tiho
    if (id === null && this.store.gest()) this.obavestenja.greska('Slika nije ubačena: platno se upravo pomeralo. Pokušaj ponovo.');
    return id;
  }
}

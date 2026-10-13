// Slika iz trake alata i prevlačenjem fajla na platno (F7, odluka 29). Tanak sloj nad `OtpremanjeSlike` (F6): isto
// otpremanje, ista provera (`proveriSliku`) i ista obrada grešaka; ovde su samo provera granice slojeva pre slanja,
// merenje prirodne veličine i ubacivanje sloja. U `providers` komponente `PlatnoEditorComponent`.
import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { NotificationStore } from '../../../core/state/notification.store';
import type { Tacka } from '../data-access/platno.models';
import { novaSlika } from '../data-access/platno-novo';
import { prekoGranica } from '../data-access/platno-provera';
import { TIPOVI_SLIKA, proveriSliku } from '../data-access/provera-slike';
import { slobodnoMesto } from './komande';
import { OtpremanjeSlike, PORUKA_SLAJD_ZATVOREN } from './otpremanje-slike';
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

export const PORUKA_ZAUZETO = 'Sačekaj da se prethodna slika otpremi.';

@Injectable()
export class SlikeEditora {
  private readonly store = inject(PlatnoEditorStore);
  private readonly otpremanje = inject(OtpremanjeSlike);
  private readonly obavestenja = inject(NotificationStore);
  private readonly dimenzije = inject(DIMENZIJE_SLIKE);
  private readonly rad = signal(false);
  /** Editor slajda je zatvoren (komponenta uništena): posle svakog `await` nema upisa u dokument koji se ne uređuje. */
  private zatvoren = false;

  /** Merenje ili otpremanje u toku (dugme trake je tada onemogućeno). */
  readonly salje = computed(() => this.rad() || this.otpremanje.salje());

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.zatvoren = true));
  }

  /**
   * Izmeri, otpremi i ubaci sloj slike (centar: tačka spuštanja ili slobodno mesto u centru platna); greška ide u
   * snackbar. Dimenzije se mere PRE otpremanja: oštećen fajl ne ostavlja medij bez sloja.
   */
  async ubaci(fajl: File, centar?: Tacka): Promise<string | null> {
    if (this.salje()) {
      this.obavestenja.greska(PORUKA_ZAUZETO);
      return null;
    }
    // granica slojeva pre otpremanja (ogledalo servera kao u store-u; sloj slike nema znakova)
    const p = this.store.platno();
    const granica = prekoGranica({ ...p, slojevi: [...p.slojevi, novaSlika('x', 'x', 1, 1)] });
    if (granica) {
      this.obavestenja.greska(granica);
      return null;
    }
    const neispravna = proveriSliku(fajl);
    if (neispravna) {
      this.obavestenja.greska(neispravna);
      return null;
    }
    this.rad.set(true);
    try {
      let mere: Dimenzije;
      try {
        mere = await this.dimenzije(fajl);
      } catch {
        this.obavestenja.greska(this.zatvoren ? PORUKA_SLAJD_ZATVOREN : PORUKA_DIMENZIJE);
        return null;
      }
      if (this.zatvoren) {
        this.obavestenja.greska(PORUKA_SLAJD_ZATVOREN);
        return null;
      }
      const medijId = await this.otpremanje.otpremiFajl(fajl);
      if (medijId === null) return null; // poruku je dao `OtpremanjeSlike` (greška servera, zatvoren editor)
      if (this.zatvoren) {
        this.obavestenja.greska(PORUKA_SLAJD_ZATVOREN);
        return null;
      }
      const id = this.store.ubaci((novi, platno) => {
        const sloj = novaSlika(novi, medijId, mere.sirina, mere.visina, centar);
        return centar ? sloj : { ...sloj, ...slobodnoMesto(platno, sloj.sirina, sloj.visina) };
      });
      // usred gesta mišem `ubaci` odbija bez poruke: javi, da slika ne nestane tiho
      if (id === null && this.store.gest()) this.obavestenja.greska('Slika nije ubačena: platno se upravo pomeralo. Pokušaj ponovo.');
      return id;
    } finally {
      this.rad.set(false);
    }
  }
}

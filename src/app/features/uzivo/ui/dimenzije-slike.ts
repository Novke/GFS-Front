import { InjectionToken } from '@angular/core';

export type DimenzijeSlike = (url: string) => Promise<{ sirina: number; visina: number }>;

/** Prirodna veličina slike (za pretvaranje INFO slajda u platno: odnos stranica SLIKA sloja); u testovima lažna. */
export const DIMENZIJE_SLIKE = new InjectionToken<DimenzijeSlike>('DIMENZIJE_SLIKE', {
  providedIn: 'root',
  factory: () => async (url: string) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { sirina: img.naturalWidth, visina: img.naturalHeight };
  },
});

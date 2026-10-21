// Provera slike pre slanja na `POST /mediji` (poruke iste kao na serveru, `MedijService`). Deli je polje slike u formi
// slajda (`pages/slika-polje.component.ts`) i editor platna (zamena slike i slika pozadine), pa živi u `data-access/`.

/** Isto kao backend (`spring.servlet.multipart.max-file-size=10MB`, `MedijService`). */
export const MAX_SLIKA_BAJTOVA = 10 * 1024 * 1024;
export const TIPOVI_SLIKA: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const PORUKA_VELICINA = 'Slika je veća od 10 MB.';
export const PORUKA_TIP = 'Dozvoljene su samo slike PNG, JPEG, GIF i WebP.';

/** Provera pre slanja (poruke iste kao na serveru); `null` = može da se šalje. */
export function proveriSliku(fajl: { size: number; type: string }): string | null {
  if (fajl.size > MAX_SLIKA_BAJTOVA) return PORUKA_VELICINA;
  if (!TIPOVI_SLIKA.includes(fajl.type)) return PORUKA_TIP;
  return null;
}

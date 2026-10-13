// Sintetički PPTX za e2e uvoza (izmišljen sadržaj; pravi fajlovi predavanja nikad ne ulaze u repo). Fabrika je ista
// kao u unit testovima uvoza (`pptx-fabrika.testing.ts`, samo fflate, bez Angular-a).
import { napraviPptx, oblik, pasus, PNG_1X1, timing } from '../src/app/features/uzivo/uvoz-pptx/pptx-fabrika.testing';

/** Ime fajla kako ga vidi dijalog (i izveštaj: `Uvoz: <ime>`). */
export const IME_PPTX = 'statika-uvod.pptx';

/**
 * Dva slajda: 1 = naslov + tekst sa 2 pasusa koji se otkrivaju na klik + slika sa efektom 6 (Circle, uvoz ga zamenjuje
 * sa FADE i upozorava); 2 = naslov + ista slika + beleške. Ista slika na oba slajda ide na server jednom.
 */
export function uzorakPptx(): { name: string; mimeType: string; buffer: Buffer } {
  const slika = { id: 'rIdI', tip: 'image', cilj: '../media/image1.png' };
  const bajtovi = napraviPptx({
    slajdovi: [
      {
        spTree: oblik.placeholder(2, '<p:ph type="title"/>', pasus('Ravnoteža sila'))
          + oblik.tekst(3, 838200, 1905000, 6096000, 1270000, pasus('Prvi uslov') + pasus('Drugi uslov'))
          + oblik.slika(4, 'rIdI', 7620000, 1905000, 1270000, 1270000),
        veze: [slika],
        timing: timing([
          { spid: 3, klasa: 'entr', preset: 10, filter: 'fade', okidac: 'clickEffect', pasus: 0 },
          { spid: 3, klasa: 'entr', preset: 10, filter: 'fade', okidac: 'clickEffect', pasus: 1 },
          { spid: 4, klasa: 'entr', preset: 6, filter: 'circle(in)', okidac: 'clickEffect' },
        ]),
      },
      {
        spTree: oblik.placeholder(2, '<p:ph type="title"/>', pasus('Primer'))
          + oblik.slika(3, 'rIdI', 838200, 1905000, 2540000, 2540000),
        veze: [slika],
        beleske: pasus('Pokazati primer na tabli.'),
      },
    ],
    delovi: { 'ppt/media/image1.png': PNG_1X1 },
  });
  return { name: IME_PPTX, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: Buffer.from(bajtovi) };
}

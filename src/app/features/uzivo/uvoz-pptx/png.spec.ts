import { zlibSync } from 'fflate';
import { dekodirajPng, isecRedove, kodirajPng, pojaseviMastila, type Rgba } from './png';

const POTPIS = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/** Ručno sastavljen PNG (CRC se ne proverava pri dekodiranju, pa je 0). */
function png(ihdr: number[], ostali: [string, number[]][]): Uint8Array {
  const deo = (tip: string, d: number[]) => [...u32(d.length), ...Array.from(tip, (c) => c.charCodeAt(0)), ...d, 0, 0, 0, 0];
  return Uint8Array.from([...POTPIS, ...deo('IHDR', ihdr), ...ostali.flatMap(([t, d]) => deo(t, d)), ...deo('IEND', [])]);
}
const ihdr = (w: number, h: number, dubina: number, tip: number, preplet = 0) => [...u32(w), ...u32(h), dubina, tip, 0, 0, preplet];
const idat = (redovi: number[]): [string, number[]] => ['IDAT', Array.from(zlibSync(Uint8Array.from(redovi)))];

describe('kodirajPng / dekodirajPng', () => {
  it('kruzno: 3 x 2 RGBA daje iste piksle', () => {
    const piksli = Uint8Array.from([
      255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0,
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    const bajtovi = kodirajPng({ sirina: 3, visina: 2, piksli });
    expect(Array.from(bajtovi.slice(0, 8))).toEqual(POTPIS);
    const r = dekodirajPng(bajtovi)!;
    expect([r.sirina, r.visina]).toEqual([3, 2]);
    expect(Array.from(r.piksli)).toEqual(Array.from(piksli));
  });

  it('CRC32 delova je ispravan (IEND ima poznat CRC AE426082)', () => {
    const b = kodirajPng({ sirina: 1, visina: 1, piksli: Uint8Array.from([0, 0, 0, 255]) });
    expect(Array.from(b.slice(-4))).toEqual([0xae, 0x42, 0x60, 0x82]);
  });

  it('paletni 2 x 2 sa tRNS: piksel 0 providan, piksel 1 iz palete', () => {
    const b = png(ihdr(2, 2, 8, 3), [
      ['PLTE', [10, 20, 30, 40, 50, 60]],
      ['tRNS', [0]],
      idat([0, 0, 1, 0, 1, 0]),
    ]);
    const r = dekodirajPng(b)!;
    expect(Array.from(r.piksli)).toEqual([10, 20, 30, 0, 40, 50, 60, 255, 40, 50, 60, 255, 10, 20, 30, 0]);
  });

  it('IDAT u više delova se spaja', () => {
    const z = Array.from(zlibSync(Uint8Array.from([0, 7])));
    const b = png(ihdr(1, 1, 8, 0), [['IDAT', z.slice(0, 3)], ['IDAT', z.slice(3)]]);
    expect(Array.from(dekodirajPng(b)!.piksli)).toEqual([7, 7, 7, 255]);
  });

  it('tipovi boje 2 (RGB) i 4 (siva + alfa)', () => {
    const rgb = dekodirajPng(png(ihdr(1, 1, 8, 2), [idat([0, 1, 2, 3])]))!;
    expect(Array.from(rgb.piksli)).toEqual([1, 2, 3, 255]);
    const sa = dekodirajPng(png(ihdr(1, 1, 8, 4), [idat([0, 9, 100])]))!;
    expect(Array.from(sa.piksli)).toEqual([9, 9, 9, 100]);
  });

  it('tRNS za tipove 0 i 2 je boja-ključ: samo piksli te boje su providni', () => {
    const siva = dekodirajPng(png(ihdr(2, 1, 8, 0), [['tRNS', [0, 7]], idat([0, 7, 8])]))!;
    expect(Array.from(siva.piksli)).toEqual([7, 7, 7, 0, 8, 8, 8, 255]);
    const rgb = dekodirajPng(png(ihdr(2, 1, 8, 2), [['tRNS', [0, 1, 0, 2, 0, 3]], idat([0, 1, 2, 3, 1, 2, 4])]))!;
    expect(Array.from(rgb.piksli)).toEqual([1, 2, 3, 0, 1, 2, 4, 255]);
  });

  it('paletni PNG sa indeksom van palete daje null', () => {
    expect(dekodirajPng(png(ihdr(1, 1, 8, 3), [['PLTE', [1, 2, 3]], idat([0, 5])]))).toBeNull();
  });

  // 8-bitna siva, 3 piksla u redu; prvi red je filter 0 [10, 20, 30]
  it.each([
    ['Sub', 1, [5, 5, 5], [5, 10, 15]],
    ['Up', 2, [1, 2, 3], [11, 22, 33]],
    ['Average', 3, [1, 1, 1], [6, 14, 23]],
    ['Paeth', 4, [1, 1, 1], [11, 21, 31]],
  ])('filter %s', (_ime, filter, podaci, ocekivano) => {
    const r = dekodirajPng(png(ihdr(3, 2, 8, 0), [idat([0, 10, 20, 30, filter, ...podaci])]))!;
    const drugiRed = Array.from({ length: 3 }, (_, i) => r.piksli[(3 + i) * 4]);
    expect(drugiRed).toEqual(ocekivano);
  });

  it('16-bitni IHDR, prepleteni PNG, nepoznat filter i pokvaren fajl daju null', () => {
    expect(dekodirajPng(png(ihdr(1, 1, 16, 0), [idat([0, 0, 0])]))).toBeNull();
    expect(dekodirajPng(png(ihdr(1, 1, 8, 0, 1), [idat([0, 0])]))).toBeNull();
    expect(dekodirajPng(png(ihdr(1, 1, 8, 0), [idat([9, 0])]))).toBeNull();
    expect(dekodirajPng(Uint8Array.from([1, 2, 3]))).toBeNull();
    expect(dekodirajPng(png(ihdr(2, 2, 8, 0), [idat([0, 1])]))).toBeNull();   // premalo podataka
  });
});

/** Slika `sirina` x `visina`: crna na datim redovima, ostalo providno ili belo neprovidno. */
function slikaSaMastilom(visina: number, redovi: [number, number][], pozadina: 'providna' | 'bela'): Rgba {
  const sirina = 10;
  const piksli = new Uint8Array(sirina * visina * 4);
  for (let y = 0; y < visina; y++) {
    const mastilo = redovi.some(([a, b]) => y >= a && y < b);
    for (let x = 0; x < sirina; x++) {
      const i = (y * sirina + x) * 4;
      if (mastilo) piksli.set([0, 0, 0, 255], i);
      else piksli.set(pozadina === 'bela' ? [255, 255, 255, 255] : [0, 0, 0, 0], i);
    }
  }
  return { sirina, visina, piksli };
}

describe('pojaseviMastila', () => {
  const NIZOVI: [number, number][] = [[2, 6], [12, 16], [22, 26]];
  it.each(['providna', 'bela'] as const)('tri niza, broj 3, pozadina %s', (poz) => {
    expect(pojaseviMastila(slikaSaMastilom(30, NIZOVI, poz), 3)).toEqual([[0, 9], [9, 19], [19, 30]]);
  });
  it('broj 2: razmaci su jednaki, spaja se prvi par', () => {
    expect(pojaseviMastila(slikaSaMastilom(30, NIZOVI, 'providna'), 2)).toEqual([[0, 19], [19, 30]]);
  });
  it('broj 4 (manje nizova nego pasusa) daje null', () => {
    expect(pojaseviMastila(slikaSaMastilom(30, NIZOVI, 'providna'), 4)).toBeNull();
  });
  it('broj 1 spaja sve', () => {
    expect(pojaseviMastila(slikaSaMastilom(30, NIZOVI, 'providna'), 1)).toEqual([[0, 30]]);
  });
  it('broj 0 ili negativan daje null (bez izuzetka)', () => {
    expect(pojaseviMastila(slikaSaMastilom(30, [[2, 6]], 'providna'), 0)).toBeNull();
    expect(pojaseviMastila(slikaSaMastilom(30, NIZOVI, 'providna'), -1)).toBeNull();
  });
  it('mastilo do poslednjeg reda: poslednji pojas se završava na visini slike', () => {
    expect(pojaseviMastila(slikaSaMastilom(10, [[0, 2], [8, 10]], 'providna'), 2)).toEqual([[0, 5], [5, 10]]);
  });
  it('skoro beo ili skoro providan piksel nije mastilo', () => {
    const r = slikaSaMastilom(10, [[1, 2], [6, 7]], 'providna');
    r.piksli.set([250, 250, 250, 255], (3 * 10) * 4);   // red 3: skoro beo
    r.piksli.set([0, 0, 0, 20], (4 * 10) * 4);         // red 4: alfa 20
    expect(pojaseviMastila(r, 2)).toEqual([[0, 4], [4, 10]]);
  });
  it('prazna slika (nema mastila) i broj 1 daje null', () => {
    expect(pojaseviMastila(slikaSaMastilom(30, [], 'providna'), 1)).toBeNull();
  });
});

describe('isecRedove', () => {
  it('vraca redove [od, do)', () => {
    const r = slikaSaMastilom(30, [[2, 6]], 'providna');
    const i = isecRedove(r, 2, 6);
    expect([i.sirina, i.visina]).toEqual([10, 4]);
    expect(Array.from(i.piksli.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(i.piksli.length).toBe(10 * 4 * 4);
  });
});

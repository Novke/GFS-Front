import { afterEach, describe, expect, it, vi } from 'vitest';

import { smanjiSliku } from './slike';

const MB = 1024 * 1024;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];
const sa = (zaglavlje: number[], velicina = 64) => {
  const b = new Uint8Array(velicina);
  b.set(zaglavlje);
  return b;
};

/** Lažni OffscreenCanvas: beleži veličine i tip izlaza, `convertToBlob` vraća blob zadate veličine. */
function lazniPregledac(o: { sirina: number; visina: number; alfa: boolean; velicine: number[] }) {
  const pozivi: { w: number; h: number; tip: string; kvalitet?: number }[] = [];
  /** Veličine platna sa kojih je čitan ImageData (provera providnosti). */
  const citanja: { w: number; h: number }[] = [];
  const zatvorena = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: o.sirina, height: o.visina, close: zatvorena })));
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(readonly width: number, readonly height: number) {}
    getContext() {
      return {
        drawImage: vi.fn(),
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          citanja.push({ w, h });
          const data = new Uint8ClampedArray(w * h * 4).fill(255);
          if (o.alfa) data[3] = 128;
          return { data };
        },
      };
    }
    async convertToBlob(op: { type: string; quality?: number }) {
      pozivi.push({ w: this.width, h: this.height, tip: op.type, kvalitet: op.quality });
      const n = o.velicine[Math.min(pozivi.length - 1, o.velicine.length - 1)];
      return new Blob([new Uint8Array(n)], { type: op.type });
    }
  });
  return { pozivi, zatvorena, citanja };
}

describe('smanjiSliku', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('JPEG bez alfe -> JPEG 0,9; faktor sqrt(9,5 MB / veličina), pa * 0,8 dok ne bude <= 10 MB', async () => {
    const { pozivi, zatvorena, citanja } = lazniPregledac({ sirina: 4000, visina: 3000, alfa: false, velicine: [11 * MB, 9 * MB] });
    const ulaz = sa(JPEG, 19 * MB);
    const r = await smanjiSliku(ulaz, 'foto.jpeg');
    const f = Math.sqrt(9.5 / 19);
    expect(pozivi).toEqual([
      { w: Math.round(4000 * f), h: Math.round(3000 * f), tip: 'image/jpeg', kvalitet: 0.9 },
      { w: Math.round(4000 * f * 0.8), h: Math.round(3000 * f * 0.8), tip: 'image/jpeg', kvalitet: 0.9 },
    ]);
    expect(r.bajtovi.length).toBe(9 * MB);
    expect(r.ime).toBe('foto.jpg');
    expect(zatvorena).toHaveBeenCalled();
    expect(citanja).toEqual([]); // JPEG nema providnost: pikseli se ne čitaju
  });

  it('PNG i GIF izvor -> PNG (ime .png)', async () => {
    const { pozivi } = lazniPregledac({ sirina: 100, visina: 100, alfa: false, velicine: [1000] });
    expect((await smanjiSliku(sa(PNG, 12 * MB), 'crtez.PNG')).ime).toBe('crtez.png');
    expect((await smanjiSliku(sa([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 11 * MB), 'anim.gif')).ime).toBe('anim.png');
    expect(pozivi.map((p) => p.tip)).toEqual(['image/png', 'image/png']);
  });

  it('nepodržan format sa alfa kanalom -> PNG; providnost se čita sa malog uzorka; mala slika se ne uvećava (faktor najviše 1)', async () => {
    const { pozivi, citanja } = lazniPregledac({ sirina: 640, visina: 480, alfa: true, velicine: [5000] });
    const r = await smanjiSliku(sa([0x42, 0x4d], 300_000), 'slika.bmp');
    expect(pozivi).toEqual([{ w: 640, h: 480, tip: 'image/png', kvalitet: undefined }]);
    expect(r.ime).toBe('slika.png');
    expect(citanja).toHaveLength(1);
    expect(citanja[0].w).toBeLessThanOrEqual(64);
    expect(citanja[0].h).toBeLessThanOrEqual(64);
  });

  it('WebP bez providnosti -> JPEG; uzorak čuva odnos stranica', async () => {
    const { pozivi, citanja } = lazniPregledac({ sirina: 4000, visina: 1000, alfa: false, velicine: [5000] });
    const r = await smanjiSliku(sa(WEBP, 11 * MB), 'foto.webp');
    expect(pozivi.map((p) => p.tip)).toEqual(['image/jpeg']);
    expect(r.ime).toBe('foto.jpg');
    expect(citanja).toEqual([{ w: 64, h: 16 }]);
  });

  it('PNG i GIF ne čitaju piksele (izlaz je uvek PNG)', async () => {
    const { citanja } = lazniPregledac({ sirina: 4000, visina: 3000, alfa: false, velicine: [1000] });
    await smanjiSliku(sa(PNG, 12 * MB), 'a.png');
    expect(citanja).toEqual([]);
  });

  it('ime bez ekstenzije dobija ekstenziju', async () => {
    lazniPregledac({ sirina: 10, visina: 10, alfa: false, velicine: [10] });
    expect((await smanjiSliku(sa([0x42, 0x4d]), 'slika')).ime).toBe('slika.jpg');
  });

  it('posle 5 pokušaja i dalje preko 10 MB -> greška', async () => {
    const { pozivi, zatvorena } = lazniPregledac({ sirina: 8000, visina: 8000, alfa: false, velicine: [11 * MB] });
    await expect(smanjiSliku(sa(JPEG, 30 * MB), 'x.jpg')).rejects.toThrow();
    expect(pozivi).toHaveLength(5);
    expect(zatvorena).toHaveBeenCalled();
  });
});

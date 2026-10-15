import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GreskaPdf, kodiraj, otvoriPdf, platnoIzDokumenta, porukaOtvaranja, PORUKE_PDF, putanjePdf, spremanRadnik,
  type PdfDokument, type PdfJs, type PdfStrana, type Platno2d, type PutanjePdf,
} from './pdf-crtac';
import { MAX_PDF_BAJTOVA } from './strane';

// --- lažni pdf.js (bez pdfjs-dist; vi.mock relativnih modula ne radi, faza 4 F15) -------------------------------------

const PUTANJE: PutanjePdf = { standardFontDataUrl: 'f/', cMapUrl: 'c/', iccUrl: 'i/', wasmUrl: 'w/' };
const MB = 1024 * 1024;
const A4 = { width: 595.28, height: 841.89 };

/** `Blob` zadate veličine i tipa (sadržaj su nule; bitna je samo veličina). */
const blob = (velicina: number, tip: string) => new Blob([new Uint8Array(velicina)], { type: tip });

/** Lažna strana: viewport srazmeran `scale`, `render` po želji testa; beleži pozive. */
function laznaStrana(osnova = A4, render?: () => Promise<void>) {
  const pozivi = { render: [] as { canvas: HTMLCanvasElement; viewport: unknown; background: string }[], cleanup: 0 };
  const strana: PdfStrana = {
    // `scale` ostaje na viewport-u (kao u pdf.js), da test pročita razmeru crtanja.
    getViewport: ({ scale }) => ({ width: osnova.width * scale, height: osnova.height * scale, scale }) as { width: number; height: number },
    render: (p) => {
      pozivi.render.push(p);
      return { promise: render ? render() : Promise.resolve() };
    },
    cleanup: () => {
      pozivi.cleanup++;
    },
  };
  return { strana, pozivi };
}

/** Lažni zadatak učitavanja: `promise` po želji testa; `destroy` je `vi.fn`. Dokument NEMA `destroy` (kao pravi). */
function lazniPdfJs(promise: Promise<PdfDokument>, destroy: () => Promise<void> = () => Promise.resolve()) {
  // Odbijeno obećanje dobija rukovaoca odmah (test ga čita tek kroz `otvoriPdf`), da Node ne prijavi neobrađeno odbijanje.
  promise.catch(() => undefined);
  const zadatak = { promise, destroy: vi.fn(destroy) };
  const getDocument = vi.fn<PdfJs['getDocument']>(() => zadatak);
  return { pdfjs: { getDocument } satisfies PdfJs, zadatak, getDocument };
}

const dokument = (numPages: number, getPage: (broj: number) => Promise<PdfStrana> = () => Promise.resolve(laznaStrana().strana)): PdfDokument =>
  ({ numPages, getPage: vi.fn(getPage) });

/** Lažno platno: `uBlob` vraća PNG/WebP/JPEG zadatih veličina; beleži oslobađanje i tražene tipove. */
function laznoPlatno(velicine: { png?: number; webp?: number; webpTip?: string; jpeg?: number } = {}) {
  const tipovi: { tip: string; kvalitet?: number }[] = [];
  let oslobodjeno = 0;
  const napravi = vi.fn((w: number, h: number): Platno2d => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return {
      canvas,
      uBlob: async (tip, kvalitet) => {
        tipovi.push({ tip, kvalitet });
        if (tip === 'image/png') return blob(velicine.png ?? 1000, 'image/png');
        if (tip === 'image/webp') return blob(velicine.webp ?? 500, velicine.webpTip ?? 'image/webp');
        return blob(velicine.jpeg ?? 400, 'image/jpeg');
      },
      oslobodi: () => {
        oslobodjeno++;
      },
    };
  });
  return { napravi, tipovi, oslobodjeno: () => oslobodjeno };
}

async function greskaOd(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('očekivana je greška');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('putanjePdf', () => {
  it('sve četiri putanje su pod assets/pdfjs/ istog porekla i završavaju se kosom crtom', () => {
    expect(putanjePdf('https://gfs.dev.trif.rs/')).toEqual({
      standardFontDataUrl: 'https://gfs.dev.trif.rs/assets/pdfjs/standard_fonts/',
      cMapUrl: 'https://gfs.dev.trif.rs/assets/pdfjs/cmaps/',
      iccUrl: 'https://gfs.dev.trif.rs/assets/pdfjs/iccs/',
      wasmUrl: 'https://gfs.dev.trif.rs/assets/pdfjs/wasm/',
    });
  });

  it('poštuje base href (relativno, nikad /assets od korena)', () => {
    expect(putanjePdf('https://primer.test/gfs/').cMapUrl).toBe('https://primer.test/gfs/assets/pdfjs/cmaps/');
  });

  it('podrazumevano od document.baseURI', () => {
    expect(putanjePdf().iccUrl).toBe(new URL('assets/pdfjs/iccs/', document.baseURI).href);
  });
});

describe('porukaOtvaranja', () => {
  it.each([
    [{ name: 'PasswordException', message: 'No password given' }, PORUKE_PDF.lozinka],
    [{ name: 'InvalidPDFException', message: 'Invalid PDF structure.' }, PORUKE_PDF.nijePdf],
    [new Error('x'), PORUKE_PDF.neocekivano],
    [null, PORUKE_PDF.neocekivano],
    ['PasswordException', PORUKE_PDF.neocekivano],
  ])('%o -> %s', (e, poruka) => {
    expect(porukaOtvaranja(e)).toBe(poruka);
  });
});

describe('otvoriPdf: otvaranje', () => {
  it('šalje bajtove i bezbedne opcije (bez XFA, bez sistemskih fontova, lokalne putanje)', async () => {
    const { pdfjs, getDocument } = lazniPdfJs(Promise.resolve(dokument(2)));
    const bajtovi = new Uint8Array([1, 2, 3]);
    const crtac = await otvoriPdf(pdfjs, bajtovi, PUTANJE);
    expect(crtac.brojStrana).toBe(2);
    expect(getDocument).toHaveBeenCalledTimes(1);
    expect(getDocument.mock.calls[0][0]).toEqual({
      data: bajtovi, cMapPacked: true, enableXfa: false, useSystemFonts: false, ...PUTANJE,
    });
    expect(Object.keys(getDocument.mock.calls[0][0])).not.toContain('password');
  });

  it('zaključan PDF -> poruka o lozinki, nikad upit za lozinku; zadatak se gasi tačno jednom', async () => {
    const upit = vi.spyOn(window, 'prompt').mockImplementation(() => null);
    const { pdfjs, zadatak } = lazniPdfJs(Promise.reject({ name: 'PasswordException', message: 'No password given', code: 1 }));
    const e = await greskaOd(otvoriPdf(pdfjs, new Uint8Array(4), PUTANJE));
    expect(e).toBeInstanceOf(GreskaPdf);
    expect((e as GreskaPdf).message).toBe(PORUKE_PDF.lozinka);
    expect((e as GreskaPdf).name).toBe('GreskaPdf');
    expect(upit).not.toHaveBeenCalled();
    expect(zadatak.destroy).toHaveBeenCalledTimes(1);
  });

  it('neispravan PDF -> "Fajl nije ispravan PDF."; zadatak se gasi tačno jednom', async () => {
    const upozorenje = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { pdfjs, zadatak } = lazniPdfJs(Promise.reject({ name: 'InvalidPDFException', message: 'Invalid PDF structure.' }));
    const e = await greskaOd(otvoriPdf(pdfjs, new Uint8Array(4), PUTANJE));
    expect((e as GreskaPdf).message).toBe(PORUKE_PDF.nijePdf);
    expect(zadatak.destroy).toHaveBeenCalledTimes(1);
    expect(upozorenje).not.toHaveBeenCalled();
  });

  it('neočekivana greška -> opšta poruka i console.warn; zadatak se gasi tačno jednom', async () => {
    const upozorenje = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const uzrok = new Error('x');
    const { pdfjs, zadatak } = lazniPdfJs(Promise.reject(uzrok));
    const e = await greskaOd(otvoriPdf(pdfjs, new Uint8Array(4), PUTANJE));
    expect((e as GreskaPdf).message).toBe(PORUKE_PDF.neocekivano);
    expect(zadatak.destroy).toHaveBeenCalledTimes(1);
    expect(upozorenje).toHaveBeenCalledTimes(1);
    expect(upozorenje.mock.calls[0]).toContain(uzrok);
  });

  it('greška gašenja posle neuspelog otvaranja ne zamenjuje poruku za korisnika', async () => {
    const { pdfjs, zadatak } = lazniPdfJs(Promise.reject({ name: 'PasswordException' }), () => Promise.reject(new Error('destroy')));
    const e = await greskaOd(otvoriPdf(pdfjs, new Uint8Array(4), PUTANJE));
    expect((e as GreskaPdf).message).toBe(PORUKE_PDF.lozinka);
    expect(zadatak.destroy).toHaveBeenCalledTimes(1);
  });

  it('PDF veći od 100 MB -> "prevelik", pdf.js se ni ne poziva', async () => {
    const { pdfjs, getDocument } = lazniPdfJs(Promise.resolve(dokument(1)));
    const e = await greskaOd(otvoriPdf(pdfjs, { length: MAX_PDF_BAJTOVA + 1 } as Uint8Array, PUTANJE));
    expect((e as GreskaPdf).message).toBe(PORUKE_PDF.prevelik);
    expect(getDocument).not.toHaveBeenCalled();
  });

  it('tačno 100 MB se otvara', async () => {
    const { pdfjs, getDocument } = lazniPdfJs(Promise.resolve(dokument(1)));
    await otvoriPdf(pdfjs, { length: MAX_PDF_BAJTOVA } as Uint8Array, PUTANJE);
    expect(getDocument).toHaveBeenCalledTimes(1);
  });

  it('PDF bez strana -> "bezStrana", zadatak ugašen', async () => {
    const { pdfjs, zadatak } = lazniPdfJs(Promise.resolve(dokument(0)));
    const e = await greskaOd(otvoriPdf(pdfjs, new Uint8Array(4), PUTANJE));
    expect((e as GreskaPdf).message).toBe(PORUKE_PDF.bezStrana);
    expect(zadatak.destroy).toHaveBeenCalledTimes(1);
  });

  it('zatvori() gasi zadatak (dokument nema destroy) i ne baca kad gašenje odbije', async () => {
    const { pdfjs, zadatak } = lazniPdfJs(Promise.resolve(dokument(1)), () => Promise.reject(new Error('destroy')));
    const crtac = await otvoriPdf(pdfjs, new Uint8Array(4), PUTANJE);
    expect(zadatak.destroy).not.toHaveBeenCalled();
    await expect(crtac.zatvori()).resolves.toBeUndefined();
    expect(zadatak.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('otvoriPdf: nacrtaj', () => {
  it('A4 strana -> platno 764 x 1080, bela pozadina, razmera 764 / 595,28; veličina u pt; platno i strana oslobođeni', async () => {
    const { strana, pozivi } = laznaStrana();
    const dok = dokument(3, () => Promise.resolve(strana));
    const platno = laznoPlatno({ png: 1234 });
    const crtac = await otvoriPdf(lazniPdfJs(Promise.resolve(dok)).pdfjs, new Uint8Array(4), PUTANJE, platno.napravi);
    const crtez = await crtac.nacrtaj(2);

    expect(dok.getPage).toHaveBeenCalledWith(2);
    expect(platno.napravi).toHaveBeenCalledWith(764, 1080);
    expect(pozivi.render).toHaveLength(1);
    const r = pozivi.render[0];
    expect(r.background).toBe('#FFFFFF');
    expect(r.canvas).toBe(platno.napravi.mock.results[0].value.canvas);
    expect((r.viewport as { scale: number }).scale).toBeCloseTo(764 / 595.28, 10);
    expect(crtez.mime).toBe('image/png');
    expect(crtez.bajtovi).toBeInstanceOf(Uint8Array);
    expect(crtez.bajtovi.length).toBe(1234);
    expect(crtez.sirina).toBe(595.28);
    expect(crtez.visina).toBe(841.89);
    expect(platno.oslobodjeno()).toBe(1);
    expect(pozivi.cleanup).toBe(1);
  });

  it('16:9 strana -> 1920 x 1080', async () => {
    const { strana } = laznaStrana({ width: 960, height: 540 });
    const platno = laznoPlatno();
    const crtac = await otvoriPdf(lazniPdfJs(Promise.resolve(dokument(1, () => Promise.resolve(strana)))).pdfjs,
      new Uint8Array(4), PUTANJE, platno.napravi);
    await crtac.nacrtaj(1);
    expect(platno.napravi).toHaveBeenCalledWith(1920, 1080);
  });

  it('render baci -> "Strana 3 nije nacrtana.", platno i strana ipak oslobođeni', async () => {
    const upozorenje = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { strana, pozivi } = laznaStrana(A4, () => Promise.reject(new Error('render')));
    const platno = laznoPlatno();
    const crtac = await otvoriPdf(lazniPdfJs(Promise.resolve(dokument(3, () => Promise.resolve(strana)))).pdfjs,
      new Uint8Array(4), PUTANJE, platno.napravi);
    const e = await greskaOd(crtac.nacrtaj(3));
    expect(e).toBeInstanceOf(GreskaPdf);
    expect((e as GreskaPdf).message).toBe('Strana 3 nije nacrtana.');
    expect(platno.oslobodjeno()).toBe(1);
    expect(pozivi.cleanup).toBe(1);
    expect(upozorenje).toHaveBeenCalledTimes(1);
  });

  it('kodiranje odbije -> greška te strane, platno i strana oslobođeni', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { strana, pozivi } = laznaStrana();
    let oslobodjeno = 0;
    const napravi = (w: number, h: number): Platno2d => ({
      canvas: Object.assign(document.createElement('canvas'), { width: w, height: h }),
      uBlob: () => Promise.reject(new Error('Slika nije kodirana.')),
      oslobodi: () => {
        oslobodjeno++;
      },
    });
    const crtac = await otvoriPdf(lazniPdfJs(Promise.resolve(dokument(1, () => Promise.resolve(strana)))).pdfjs,
      new Uint8Array(4), PUTANJE, napravi);
    expect(((await greskaOd(crtac.nacrtaj(1))) as GreskaPdf).message).toBe(PORUKE_PDF.strana(1));
    expect(oslobodjeno).toBe(1);
    expect(pozivi.cleanup).toBe(1);
  });

  it('getPage odbije (oštećena strana) -> greška te strane, platno se ne pravi', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const platno = laznoPlatno();
    const crtac = await otvoriPdf(lazniPdfJs(Promise.resolve(dokument(2, () => Promise.reject(new Error('Bad XRef'))))).pdfjs,
      new Uint8Array(4), PUTANJE, platno.napravi);
    const e = await greskaOd(crtac.nacrtaj(2));
    expect(e).toBeInstanceOf(GreskaPdf);
    expect((e as GreskaPdf).message).toBe('Strana 2 nije nacrtana.');
    expect(platno.napravi).not.toHaveBeenCalled();
  });

  it.each([
    [{ width: 0, height: 100 }],
    [{ width: 100, height: Number.NaN }],
    [{ width: Number.POSITIVE_INFINITY, height: 100 }],
  ])('strana bez ispravne veličine %o -> greška te strane, bez platna', async (osnova) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { strana, pozivi } = laznaStrana(osnova);
    const platno = laznoPlatno();
    const crtac = await otvoriPdf(lazniPdfJs(Promise.resolve(dokument(1, () => Promise.resolve(strana)))).pdfjs,
      new Uint8Array(4), PUTANJE, platno.napravi);
    expect(((await greskaOd(crtac.nacrtaj(1))) as GreskaPdf).message).toBe(PORUKE_PDF.strana(1));
    expect(platno.napravi).not.toHaveBeenCalled();
    expect(pozivi.render).toHaveLength(0);
    expect(pozivi.cleanup).toBe(1);
  });
});

describe('otvoriPdf: zatvaranje usred crtanja ("Otkaži", F14 zatvara crtač u finally)', () => {
  /** Render koji visi dok ga test ne odbije (kao pdf.js kad `destroy` prekine crtanje). */
  function visiRender() {
    let odbij!: (e: unknown) => void;
    const render = () => new Promise<void>((_res, rej) => {
      odbij = rej;
    });
    return { render, odbij: (e: unknown) => odbij(e) };
  }

  it('RenderingCancelledException posle zatvori() -> greška strane, konzola čista, platno i strana oslobođeni', async () => {
    const upozorenje = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const greska = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const v = visiRender();
    const { strana, pozivi } = laznaStrana(A4, v.render);
    const platno = laznoPlatno();
    const { pdfjs, zadatak } = lazniPdfJs(Promise.resolve(dokument(1, () => Promise.resolve(strana))));
    const crtac = await otvoriPdf(pdfjs, new Uint8Array(4), PUTANJE, platno.napravi);
    const crtanje = crtac.nacrtaj(1);
    await vi.waitFor(() => expect(pozivi.render).toHaveLength(1));
    await crtac.zatvori();
    v.odbij({ name: 'RenderingCancelledException', message: 'Rendering cancelled, page 1' });
    const e = await greskaOd(crtanje);
    expect(e).toBeInstanceOf(GreskaPdf);
    expect(zadatak.destroy).toHaveBeenCalledTimes(1);
    expect(upozorenje).not.toHaveBeenCalled();
    expect(greska).not.toHaveBeenCalled();
    expect(platno.oslobodjeno()).toBe(1);
    expect(pozivi.cleanup).toBe(1);
  });

  it('RenderingCancelledException i bez zatvori() (pdf.js otkazao sam) -> bez upozorenja', async () => {
    const upozorenje = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { strana } = laznaStrana(A4, () => Promise.reject({ name: 'RenderingCancelledException', message: 'x' }));
    const crtac = await otvoriPdf(lazniPdfJs(Promise.resolve(dokument(1, () => Promise.resolve(strana)))).pdfjs,
      new Uint8Array(4), PUTANJE, laznoPlatno().napravi);
    expect(await greskaOd(crtac.nacrtaj(1))).toBeInstanceOf(GreskaPdf);
    expect(upozorenje).not.toHaveBeenCalled();
  });

  it('posle zatvori() bilo koja greška crtanja ("Transport destroyed", kodiranje, cleanup) ne piše u konzolu', async () => {
    const upozorenje = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const greska = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const v = visiRender();
    const { strana } = laznaStrana(A4, v.render);
    strana.cleanup = () => {
      throw new Error('cleanup posle destroy');
    };
    const { pdfjs } = lazniPdfJs(Promise.resolve(dokument(2, (n) => n === 1 ? Promise.resolve(strana) : Promise.reject(new Error('Transport destroyed')))));
    const crtac = await otvoriPdf(pdfjs, new Uint8Array(4), PUTANJE, laznoPlatno().napravi);
    const prva = crtac.nacrtaj(1);
    await crtac.zatvori();
    v.odbij(new Error('Worker was destroyed.'));
    expect(((await greskaOd(prva)) as GreskaPdf).message).toBe(PORUKE_PDF.strana(1));
    expect(((await greskaOd(crtac.nacrtaj(2))) as GreskaPdf).message).toBe(PORUKE_PDF.strana(2));
    expect(upozorenje).not.toHaveBeenCalled();
    expect(greska).not.toHaveBeenCalled();
  });

  it('pre zatvaranja greška cleanup-a ne skriva uspešno nacrtanu stranu', async () => {
    const upozorenje = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { strana } = laznaStrana();
    strana.cleanup = () => {
      throw new Error('cleanup');
    };
    const crtac = await otvoriPdf(lazniPdfJs(Promise.resolve(dokument(1, () => Promise.resolve(strana)))).pdfjs,
      new Uint8Array(4), PUTANJE, laznoPlatno().napravi);
    expect((await crtac.nacrtaj(1)).mime).toBe('image/png');
    expect(upozorenje).not.toHaveBeenCalled();
  });
});

describe('kodiraj', () => {
  const platno = (v: Parameters<typeof laznoPlatno>[0]) => {
    const p = laznoPlatno(v);
    return { p, platno: p.napravi(10, 10) };
  };

  it('PNG do 3 MB ostaje PNG (WebP se ne traži)', async () => {
    const { p, platno: pl } = platno({ png: MB });
    const r = await kodiraj(pl);
    expect(r.mime).toBe('image/png');
    expect(r.blob.size).toBe(MB);
    expect(p.tipovi.map((t) => t.tip)).toEqual(['image/png']);
  });

  it('PNG tačno 3 MB ostaje PNG', async () => {
    const { platno: pl } = platno({ png: 3 * MB });
    expect((await kodiraj(pl)).mime).toBe('image/png');
  });

  it('PNG 4 MB i pregledač ume WebP -> WebP 0,9', async () => {
    const { p, platno: pl } = platno({ png: 4 * MB, webp: 2 * MB });
    const r = await kodiraj(pl);
    expect(r.mime).toBe('image/webp');
    expect(r.blob.size).toBe(2 * MB);
    expect(p.tipovi).toEqual([{ tip: 'image/png', kvalitet: undefined }, { tip: 'image/webp', kvalitet: 0.9 }]);
  });

  it('PNG 4 MB, a "WebP" stigne kao PNG (pregledač ne ume WebP) -> JPEG 0,9', async () => {
    const { p, platno: pl } = platno({ png: 4 * MB, webpTip: 'image/png', jpeg: MB });
    const r = await kodiraj(pl);
    expect(r.mime).toBe('image/jpeg');
    expect(r.blob.size).toBe(MB);
    expect(p.tipovi.at(-1)).toEqual({ tip: 'image/jpeg', kvalitet: 0.9 });
  });
});

describe('platnoIzDokumenta', () => {
  it('pravi canvas zadate veličine, uBlob prosleđuje tip i kvalitet, oslobodi ga smanjuje na 0', async () => {
    const p = platnoIzDokumenta(764, 1080);
    expect(p.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect([p.canvas.width, p.canvas.height]).toEqual([764, 1080]);
    const b = blob(3, 'image/webp');
    const toBlob = vi.fn<HTMLCanvasElement['toBlob']>((cb) => cb(b));
    p.canvas.toBlob = toBlob;
    await expect(p.uBlob('image/webp', 0.9)).resolves.toBe(b);
    expect(toBlob.mock.calls[0].slice(1)).toEqual(['image/webp', 0.9]);
    p.oslobodi();
    expect([p.canvas.width, p.canvas.height]).toEqual([0, 0]);
  });

  it('toBlob vrati null -> uBlob odbija', async () => {
    const p = platnoIzDokumenta(2, 2);
    p.canvas.toBlob = (cb: BlobCallback) => cb(null);
    await expect(p.uBlob('image/png')).rejects.toThrow('Slika nije kodirana.');
  });
});

describe('spremanRadnik', () => {
  /** Lažni radnik: EventTarget sa `terminate`. */
  const lazniRadnik = () => Object.assign(new EventTarget(), { terminate: vi.fn() });

  it('razrešava se na prvu poruku radnika ("ready" pdf.js-a) i skida slušaoce', async () => {
    const r = lazniRadnik();
    const skini = vi.spyOn(r, 'removeEventListener');
    const p = spremanRadnik(r);
    r.dispatchEvent(new MessageEvent('message', { data: { action: 'ready' } }));
    await expect(p).resolves.toBe(r);
    expect(skini).toHaveBeenCalledWith('message', expect.any(Function));
    expect(skini).toHaveBeenCalledWith('error', expect.any(Function));
    expect(r.terminate).not.toHaveBeenCalled();
  });

  it('radnik ne krene (404, CSP, greška u modulu) -> odbija i gasi radnika, umesto da uvoz visi', async () => {
    const r = lazniRadnik();
    const p = spremanRadnik(r);
    r.dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow('Radnik za PDF nije pokrenut.');
    expect(r.terminate).toHaveBeenCalledTimes(1);
  });
});

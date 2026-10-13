import { dimenzijeSlike } from './slike-editora';

describe('dimenzijeSlike', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('čita prirodnu veličinu preko createImageBitmap i zatvara bitmapu', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve({ width: 640, height: 480, close })));
    await expect(dimenzijeSlike(new Blob(['x']))).resolves.toEqual({ sirina: 640, visina: 480 });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('bez createImageBitmap koristi <img> iz object URL-a i oslobađa adresu', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const napravi = vi.fn(() => 'blob:probna');
    const opozovi = vi.fn();
    Object.assign(URL, { createObjectURL: napravi, revokeObjectURL: opozovi });
    class LaznaSlika {
      naturalWidth = 300;
      naturalHeight = 200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', LaznaSlika);
    await expect(dimenzijeSlike(new Blob(['x']))).resolves.toEqual({ sirina: 300, visina: 200 });
    expect(opozovi).toHaveBeenCalledWith('blob:probna');
  });
});

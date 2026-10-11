import { pratiPovratak } from './povratak';

type LazniDokument = EventTarget & { visibilityState: DocumentVisibilityState };

describe('pratiPovratak', () => {
  let doc: LazniDokument;
  let win: EventTarget;
  let t: number;
  let naPovratak: ReturnType<typeof vi.fn<(skrivenoMs: number) => void>>;
  let odjavi: () => void;

  function vidljivost(stanje: DocumentVisibilityState, u: number): void {
    t = u;
    doc.visibilityState = stanje;
    doc.dispatchEvent(new Event('visibilitychange'));
  }

  function prati(): void {
    odjavi = pratiPovratak(doc as unknown as Document, win as unknown as Window, naPovratak, () => t);
  }

  beforeEach(() => {
    doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
    win = new EventTarget();
    t = 0;
    naPovratak = vi.fn<(skrivenoMs: number) => void>();
  });

  it('skrivena pa vidljiva: javlja koliko je bila skrivena', () => {
    prati();
    vidljivost('hidden', 1_000);
    expect(naPovratak).not.toHaveBeenCalled();
    vidljivost('visible', 7_000);
    expect(naPovratak).toHaveBeenCalledExactlyOnceWith(6_000);
  });

  it('vidljiva bez prethodnog skrivanja: ništa', () => {
    prati();
    vidljivost('visible', 5_000);
    expect(naPovratak).not.toHaveBeenCalled();
  });

  it('svaki povratak se meri od svog skrivanja', () => {
    prati();
    vidljivost('hidden', 1_000);
    vidljivost('visible', 2_000);
    vidljivost('visible', 3_000);
    vidljivost('hidden', 10_000);
    vidljivost('hidden', 11_000);
    vidljivost('visible', 30_000);
    expect(naPovratak.mock.calls).toEqual([[1_000], [20_000]]);
  });

  it('stranica otvorena skrivena (tab u pozadini): prvo prikazivanje je povratak', () => {
    doc.visibilityState = 'hidden';
    t = 500;
    prati();
    vidljivost('visible', 9_500);
    expect(naPovratak).toHaveBeenCalledExactlyOnceWith(9_000);
  });

  it('online: povratak sa beskonačnim trajanjem', () => {
    prati();
    win.dispatchEvent(new Event('online'));
    expect(naPovratak).toHaveBeenCalledExactlyOnceWith(Infinity);
  });

  it('posle odjave nijedan događaj ne zove', () => {
    prati();
    vidljivost('hidden', 1_000);
    odjavi();
    vidljivost('visible', 7_000);
    win.dispatchEvent(new Event('online'));
    expect(naPovratak).not.toHaveBeenCalled();
  });
});

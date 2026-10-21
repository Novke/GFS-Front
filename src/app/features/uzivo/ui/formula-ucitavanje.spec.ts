import { FONTOVI_FORMULA, PUTANJA_STILA_FORMULA, ucitajFormule, ucitajStilFormula } from './formula-ucitavanje';

const linkovi = () => [...document.head.querySelectorAll<HTMLLinkElement>('link[data-gfs="mathlive"]')];

describe('formula-ucitavanje', () => {
  let load: ReturnType<typeof vi.fn>;

  // keš obećanja i <link> čisti globalni afterEach u test-setup.ts (posle svakog testa svakog speca)
  beforeEach(() => {
    load = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
  });

  afterEach(() => {
    delete (document as Partial<Document> & { fonts?: unknown }).fonts;
    vi.useRealTimers();
  });

  describe('globalni reset (test-setup.ts)', () => {
    let prvi: Promise<void> | null = null;

    it('prvi test: obećanje stila pod lažnim tajmerom ostaje nerazrešeno, link u <head>', () => {
      vi.useFakeTimers();
      prvi = ucitajStilFormula();
      expect(linkovi().length).toBe(1);
    });

    it('drugi test: nov link i novo obećanje (keš i link prvog testa su obrisani)', () => {
      expect(linkovi().length).toBe(0);
      expect(ucitajStilFormula()).not.toBe(prvi);
      expect(linkovi().length).toBe(1);
    });
  });

  it('ucitajStilFormula dva puta -> jedan <link data-gfs="mathlive"> sa relativnom putanjom stila', async () => {
    const a = ucitajStilFormula();
    const b = ucitajStilFormula();
    expect(a).toBe(b);
    expect(linkovi().length).toBe(1);
    expect(linkovi()[0].getAttribute('href')).toBe('assets/mathlive/mathlive-static.css');
    expect(PUTANJA_STILA_FORMULA).toBe('assets/mathlive/mathlive-static.css');
    expect(linkovi()[0].rel).toBe('stylesheet');
    linkovi()[0].dispatchEvent(new Event('load'));
    await a;
  });

  it('greška linka -> obećanje se razrešava (ne odbija)', async () => {
    const p = ucitajStilFormula();
    linkovi()[0].dispatchEvent(new Event('error'));
    await expect(p).resolves.toBeUndefined();
  });

  it('posle load čeka KaTeX fontove (document.fonts.load), tek posle stila', async () => {
    let gotovo = false;
    const p = ucitajStilFormula().then(() => { gotovo = true; });
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    linkovi()[0].dispatchEvent(new Event('load'));
    await p;
    expect(gotovo).toBe(true);
    const trazeni = new Set(load.mock.calls.map(c => /"([^"]+)"/.exec(c[0] as string)![1]));
    expect([...trazeni].sort()).toEqual([...FONTOVI_FORMULA].sort());
    expect(FONTOVI_FORMULA).toEqual(['KaTeX_Main', 'KaTeX_Math', 'KaTeX_AMS', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4']);
  });

  it('link bez odgovora i fontovi bez odgovora: najviše 3 s za stil, pa najviše 3 s za fontove', async () => {
    vi.useFakeTimers();
    load.mockImplementation(() => new Promise(() => undefined));
    let gotovo = false;
    void ucitajStilFormula().then(() => { gotovo = true; });
    await vi.advanceTimersByTimeAsync(2999);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalled();
    expect(gotovo).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(gotovo).toBe(true);
  });

  it('ucitajFormule: isto obećanje (jednom), modul ima latexUMarkup', async () => {
    const a = ucitajFormule();
    expect(ucitajFormule()).toBe(a);
    const m = await a;
    expect(typeof m.latexUMarkup).toBe('function');
  });

  it('ucitajFormule: odbijeno učitavanje se ne kešira (sledeći poziv pokušava ponovo)', async () => {
    const greska = vi.fn(() => Promise.reject(new Error('mreža')));
    await expect(ucitajFormule(greska)).rejects.toThrow('mreža');
    const m = await ucitajFormule();
    expect(typeof m.latexUMarkup).toBe('function');
    expect(greska).toHaveBeenCalledTimes(1);
  });
});

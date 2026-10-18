import { HttpErrorResponse } from '@angular/common/http';
import { NEVER, Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BankaApi } from './banka.api';
import type { RenderProbaCmd, RenderProbaInfo } from './banka.models';
import {
  KASNJENJE_PREGLEDA, panelResenja, panelZadatka, Pregled, pregledUzivo, SacuvanRender, SadrzajPregleda, vazecaGreska,
} from './render-proba';

const proba = (tekst: string, resenje: string | null = null): RenderProbaCmd => ({ predmetId: 1, tekst, resenje, prilozi: [] });
/** Sadržaj forme za pregled; `sacuvan` = isti kao sačuvani render varijante. */
const cmd = (tekst: string, resenje: string | null = null, sacuvan: SacuvanRender | null = null): SadrzajPregleda =>
  ({ cmd: proba(tekst, resenje), sacuvan });
const ok = (svg: string, resenjeSvg: string | null = null): RenderProbaInfo => ({ ok: true, svg, resenjeSvg, greska: null, deo: null });
const http = (status: number, reason = 'x') => new HttpErrorResponse({ status, error: { reason } });

describe('pregledUzivo', () => {
  let izvor: Subject<SadrzajPregleda | null>;
  let odmah: Subject<void>;
  let stanja: Pregled[];
  const renderProba = vi.fn<(c: RenderProbaCmd, o: unknown) => Observable<RenderProbaInfo>>();
  const svg = vi.fn<(id: string, o: unknown) => Observable<string>>();

  function pokreni(): void {
    pregledUzivo(izvor, { renderProba, svg } as unknown as BankaApi, odmah).subscribe({
      next: p => stanja.push(p),
      error: () => stanja.push({ stanje: 'BACIO' } as unknown as Pregled),
    });
  }
  const poslednje = () => stanja.at(-1)!;

  beforeEach(() => {
    vi.useFakeTimers();
    izvor = new Subject();
    odmah = new Subject();
    stanja = [];
    renderProba.mockReset();
    renderProba.mockImplementation(c => of(ok(`<svg>${c.tekst}</svg>`)));
    svg.mockReset();
    svg.mockImplementation(id => of(`<svg>sačuvan ${id}</svg>`));
  });
  afterEach(() => vi.useRealTimers());

  it('prvo "ceka" odmah, zahtev tek posle 800 ms mira, tiho', () => {
    pokreni();
    izvor.next(cmd('a'));
    expect(poslednje().stanje).toBe('ceka');
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA - 1);
    expect(renderProba).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(renderProba).toHaveBeenCalledExactlyOnceWith(proba('a'), { tiho: true });
    expect(poslednje()).toEqual({ stanje: 'ok', svg: '<svg>a</svg>', resenjeSvg: null, greska: null, deo: null });
  });

  it('kucanje pre isteka odlaže zahtev; šalje se samo poslednji sadržaj', () => {
    pokreni();
    izvor.next(cmd('a'));
    vi.advanceTimersByTime(500);
    izvor.next(cmd('ab'));
    vi.advanceTimersByTime(500);
    expect(renderProba).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(renderProba.mock.calls.map(c => c[0].tekst)).toEqual(['ab']);
  });

  it('isti sadržaj se ne traži ponovo (ni novi objekat istog sadržaja)', () => {
    pokreni();
    izvor.next(cmd('a'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    const posle = stanja.length;
    izvor.next(cmd('a'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA * 2);
    expect(renderProba).toHaveBeenCalledTimes(1);
    expect(stanja.length).toBe(posle);
  });

  it('"ceka" zadržava poslednji uspeli SVG dok novi ne stigne', () => {
    pokreni();
    izvor.next(cmd('a', 'r'));
    renderProba.mockReturnValueOnce(of(ok('<svg>A</svg>', '<svg>R</svg>')));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    izvor.next(cmd('b', 'r'));
    expect(poslednje()).toEqual({ stanje: 'ceka', svg: '<svg>A</svg>', resenjeSvg: '<svg>R</svg>', greska: null, deo: null });
  });

  const FOO = { linija: 3, poruka: 'Undefined control sequence \\foo' };

  it('LaTeX greška u tekstu: stanje "greska" sa linijom i delom, bez SVG-a', () => {
    renderProba.mockReturnValue(of({ ok: false, svg: null, resenjeSvg: null, greska: FOO, deo: 'tekst' }));
    pokreni();
    izvor.next(cmd('x\ny\n\\foo'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(poslednje()).toEqual({ stanje: 'greska', svg: null, resenjeSvg: null, greska: FOO, deo: 'tekst' });
  });

  it('greška u rešenju: SVG zadatka iz odgovora ostaje (server ga šalje i kad padne samo rešenje)', () => {
    renderProba.mockReturnValue(of({ ok: false, svg: '<svg>zadatak</svg>', resenjeSvg: null, greska: FOO, deo: 'resenje' }));
    pokreni();
    izvor.next(cmd('a', 'x\ny\n\\foo'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(poslednje()).toEqual({ stanje: 'greska', svg: '<svg>zadatak</svg>', resenjeSvg: null, greska: FOO, deo: 'resenje' });
    // pa panel zadatka i dalje pokazuje zadatak, a rešenje grešku
    const g = vazecaGreska(poslednje(), null);
    expect(panelZadatka(poslednje(), g)).toEqual({ stanje: 'ok', svg: '<svg>zadatak</svg>', greska: null, prazno: null });
    expect(panelResenja(poslednje(), g, true, true)).toEqual({ stanje: 'greska', svg: null, greska: FOO, prazno: null });
  });

  it('greška u rešenju bez SVG-a u odgovoru: ostaje poslednji SVG zadatka', () => {
    pokreni();
    izvor.next(cmd('a', 'r'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    renderProba.mockReturnValueOnce(of({ ok: false, svg: null, resenjeSvg: null, greska: FOO, deo: 'resenje' }));
    izvor.next(cmd('a', 'r\n\\foo'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(poslednje()).toEqual({ stanje: 'greska', svg: '<svg>a</svg>', resenjeSvg: null, greska: FOO, deo: 'resenje' });
  });

  it('429 je "zauzet", 503 "nedostupan", bez bacanja, a tok radi dalje', () => {
    pokreni();
    renderProba.mockReturnValueOnce(throwError(() => http(429, 'Previše proba u isto vreme.')));
    izvor.next(cmd('a'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(poslednje().stanje).toBe('zauzet');

    renderProba.mockReturnValueOnce(throwError(() => http(503, 'Render servis nije dostupan.')));
    izvor.next(cmd('b'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(poslednje()).toEqual({ stanje: 'nedostupan', svg: null, resenjeSvg: null, greska: null, deo: null });

    izvor.next(cmd('c'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(poslednje()).toMatchObject({ stanje: 'ok', svg: '<svg>c</svg>' });
    expect(stanja.some(s => (s.stanje as string) === 'BACIO')).toBe(false);
  });

  it('bez veze sa serverom (status 0) i istek (504) su takođe "nedostupan"', () => {
    renderProba.mockReturnValue(throwError(() => http(0)));
    pokreni();
    izvor.next(cmd('a'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(poslednje().stanje).toBe('nedostupan');
    renderProba.mockReturnValue(throwError(() => http(504)));
    izvor.next(cmd('b'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(poslednje().stanje).toBe('nedostupan');
  });

  it('400 (zabranjena komanda) je "greska" bez linije, sa porukom servera', () => {
    renderProba.mockReturnValue(throwError(() => http(400, 'Komanda \\input nije dozvoljena.')));
    pokreni();
    izvor.next(cmd('\\input{x}'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(poslednje()).toEqual({
      stanje: 'greska', svg: null, resenjeSvg: null, greska: { linija: null, poruka: 'Komanda \\input nije dozvoljena.' }, deo: null,
    });
  });

  it('null je "prazno" bez zahteva i poništava zahtev u letu', () => {
    const uLetu = new Subject<RenderProbaInfo>();
    renderProba.mockReturnValue(uLetu);
    pokreni();
    izvor.next(null);
    expect(poslednje()).toEqual({ stanje: 'prazno', svg: null, resenjeSvg: null, greska: null, deo: null });
    izvor.next(cmd('a'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(uLetu.observed).toBe(true);
    izvor.next(null);
    expect(uLetu.observed).toBe(false);
    expect(poslednje().stanje).toBe('prazno');
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA * 2);
    expect(renderProba).toHaveBeenCalledTimes(1);
  });

  it('nov sadržaj otkazuje zahtev u letu (switchMap): stari odgovor nikad ne stiže', () => {
    const prvi = new Subject<RenderProbaInfo>();
    renderProba.mockReturnValueOnce(prvi);
    pokreni();
    izvor.next(cmd('a'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    izvor.next(cmd('b'));
    expect(prvi.observed).toBe(false);
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(poslednje()).toMatchObject({ stanje: 'ok', svg: '<svg>b</svg>' });
  });

  it('"odmah" renderuje trenutni sadržaj bez čekanja, i kad se nije promenio', () => {
    pokreni();
    izvor.next(cmd('a'));
    odmah.next();
    expect(renderProba).toHaveBeenCalledTimes(1);
    expect(poslednje()).toMatchObject({ stanje: 'ok', svg: '<svg>a</svg>' });
    odmah.next();
    expect(renderProba).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA * 2);
    expect(renderProba).toHaveBeenCalledTimes(2);
  });

  it('"odmah" bez sadržaja ne zove server', () => {
    pokreni();
    odmah.next();
    izvor.next(null);
    odmah.next();
    expect(renderProba).not.toHaveBeenCalled();
    expect(poslednje().stanje).toBe('prazno');
  });

  it('sačuvan render: SVG-ovi sačuvane varijante kao tekst, odmah i bez render-probe', () => {
    pokreni();
    izvor.next(cmd('a', 'r', { svgId: 's1', resenjeSvgId: 's2' }));
    expect(svg.mock.calls).toEqual([['s1', { tiho: true }], ['s2', { tiho: true }]]);
    expect(poslednje()).toEqual({ stanje: 'ok', svg: '<svg>sačuvan s1</svg>', resenjeSvg: '<svg>sačuvan s2</svg>', greska: null, deo: null });
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA * 2);
    expect(renderProba).not.toHaveBeenCalled();
    expect(stanja.map(x => x.stanje)).toEqual(['ok']);
  });

  it('sačuvan render bez rešenja učitava samo zadatak; prva izmena posle njega ide na render-probu', () => {
    pokreni();
    izvor.next(cmd('a', null, { svgId: 's1', resenjeSvgId: null }));
    expect(svg).toHaveBeenCalledExactlyOnceWith('s1', { tiho: true });
    expect(poslednje()).toMatchObject({ stanje: 'ok', svg: '<svg>sačuvan s1</svg>', resenjeSvg: null });
    izvor.next(cmd('ab'));
    expect(poslednje()).toMatchObject({ stanje: 'ceka', svg: '<svg>sačuvan s1</svg>' });
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(renderProba).toHaveBeenCalledExactlyOnceWith(proba('ab'), { tiho: true });
    // povratak na sačuvani sadržaj: opet sačuvan render, bez probe
    izvor.next(cmd('a', null, { svgId: 's1', resenjeSvgId: null }));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(renderProba).toHaveBeenCalledTimes(1);
    expect(poslednje()).toMatchObject({ stanje: 'ok', svg: '<svg>sačuvan s1</svg>' });
  });

  it('sačuvan neuspeo render: bez probe i bez SVG-a (grešku daje sačuvana varijanta)', () => {
    pokreni();
    izvor.next(cmd('\\foo', null, 'greska'));
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA * 2);
    expect(renderProba).not.toHaveBeenCalled();
    expect(svg).not.toHaveBeenCalled();
    expect(poslednje()).toEqual({ stanje: 'prazno', svg: null, resenjeSvg: null, greska: null, deo: null });
  });

  it('sačuvan SVG se ne učita: render-proba umesto njega, bez čekanja', () => {
    svg.mockReturnValue(throwError(() => http(404)));
    pokreni();
    izvor.next(cmd('a', null, { svgId: 's1', resenjeSvgId: null }));
    expect(renderProba).toHaveBeenCalledExactlyOnceWith(proba('a'), { tiho: true });
    expect(poslednje()).toMatchObject({ stanje: 'ok', svg: '<svg>a</svg>' });
  });

  it('"odmah" uz sačuvan render ipak traži render-probu', () => {
    pokreni();
    izvor.next(cmd('a', null, { svgId: 's1', resenjeSvgId: null }));
    odmah.next();
    expect(renderProba).toHaveBeenCalledExactlyOnceWith(proba('a'), { tiho: true });
    expect(poslednje()).toMatchObject({ stanje: 'ok', svg: '<svg>a</svg>' });
  });

  it('kraj izvora ne prekida zahtev koji je već krenuo', () => {
    renderProba.mockReturnValue(NEVER);
    pokreni();
    izvor.next(cmd('a'));
    izvor.complete();
    vi.advanceTimersByTime(KASNJENJE_PREGLEDA);
    expect(renderProba).toHaveBeenCalledTimes(1);
  });
});

describe('panelZadatka, panelResenja, vazecaGreska', () => {
  const p = (izmena: Partial<Pregled>): Pregled => ({ stanje: 'ok', svg: null, resenjeSvg: null, greska: null, deo: null, ...izmena });
  const G3 = { linija: 3, poruka: 'Undefined control sequence \\foo' };
  const sacuvana = { greska: G3, deo: 'tekst' as const };

  it('vazecaGreska: živi pregled ima prednost; sačuvana greška važi dok pregled nije stigao', () => {
    expect(vazecaGreska(p({ stanje: 'greska', greska: G3, deo: 'resenje' }), null)).toEqual({ greska: G3, deo: 'resenje' });
    expect(vazecaGreska(p({ stanje: 'ok', svg: '<svg/>' }), sacuvana)).toBeNull();
    expect(vazecaGreska(p({ stanje: 'ceka' }), sacuvana)).toBe(sacuvana);
    expect(vazecaGreska(p({ stanje: 'nedostupan' }), sacuvana)).toBe(sacuvana);
    expect(vazecaGreska(p({ stanje: 'zauzet' }), sacuvana)).toBe(sacuvana);
    expect(vazecaGreska(p({ stanje: 'prazno' }), sacuvana)).toBe(sacuvana);
    expect(vazecaGreska(p({ stanje: 'ceka' }), null)).toBeNull();
  });

  it('panelZadatka: greška u tekstu (ili bez dela) je greška zadatka; greška u rešenju ostavlja SVG zadatka', () => {
    expect(panelZadatka(p({ stanje: 'greska' }), { greska: G3, deo: 'tekst' })).toEqual({ stanje: 'greska', svg: null, greska: G3, prazno: null });
    expect(panelZadatka(p({ stanje: 'greska' }), { greska: G3, deo: null }).stanje).toBe('greska');
    expect(panelZadatka(p({ stanje: 'greska', svg: '<svg/>' }), { greska: G3, deo: 'resenje' })).toEqual({ stanje: 'ok', svg: '<svg/>', greska: null, prazno: null });
    expect(panelZadatka(p({ stanje: 'greska' }), { greska: G3, deo: 'resenje' })).toMatchObject({ stanje: 'prazno', prazno: 'Zadatak se prikazuje kad se ispravi greška u rešenju.' });
    expect(panelZadatka(p({ stanje: 'ceka', svg: '<svg/>' }), null)).toEqual({ stanje: 'ceka', svg: '<svg/>', greska: null, prazno: null });
  });

  it('panelResenja: bez rešenja ili teksta prazno sa razlogom; greška u rešenju; greška u tekstu', () => {
    expect(panelResenja(p({ stanje: 'ok', svg: '<svg/>' }), null, true, false)).toMatchObject({ stanje: 'prazno', prazno: 'Rešenje nije uneto.' });
    expect(panelResenja(p({ stanje: 'prazno' }), null, false, true)).toMatchObject({ stanje: 'prazno', prazno: 'Pregled rešenja stiže kad zadatak ima tekst.' });
    expect(panelResenja(p({ stanje: 'greska' }), { greska: G3, deo: 'resenje' }, true, true)).toEqual({ stanje: 'greska', svg: null, greska: G3, prazno: null });
    expect(panelResenja(p({ stanje: 'greska' }), { greska: G3, deo: 'tekst' }, true, true))
      .toMatchObject({ stanje: 'prazno', prazno: 'Rešenje se prikazuje kad se ispravi greška u zadatku.' });
    expect(panelResenja(p({ stanje: 'ok', resenjeSvg: '<svg>r</svg>' }), null, true, true)).toEqual({ stanje: 'ok', svg: '<svg>r</svg>', greska: null, prazno: null });
    expect(panelResenja(p({ stanje: 'nedostupan' }), null, true, true).stanje).toBe('nedostupan');
  });
});

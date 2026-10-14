import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { FilterDef, ListQuery, MAX_TEKST, normalizujFilter, parseListParams, toHttpParams, toQueryParams, VELICINE } from './list-params';

interface Filteri extends Record<string, string | number | boolean | null> {
  grupa: number | null;
  q: string | null;
  od: string | null;
  zavrseno: boolean | null;
}

const DEFS: Record<keyof Filteri, FilterDef> = {
  grupa: { tip: 'broj' },
  q: { tip: 'tekst' },
  od: { tip: 'datum' },
  zavrseno: { tip: 'bool' },
};

const POD: ListQuery<Filteri> = {
  filteri: { grupa: null, q: null, od: null, zavrseno: null },
  sort: 'datum,desc',
  strana: 1,
  velicina: 25,
};

const SORT_POLJA = ['datum', 'naziv'];

const parse = (p: Record<string, string>) => parseListParams<Filteri>(convertToParamMap(p), DEFS, POD, SORT_POLJA);

describe('parseListParams', () => {
  it('prazan URL daje podrazumevani upit', () => {
    expect(parse({})).toEqual(POD);
  });

  it('ispravne vrednosti se prenose sa tipom', () => {
    expect(parse({ grupa: '7', q: 'Petar', od: '2025-02-28', zavrseno: 'true', sort: 'naziv,asc', strana: '3', velicina: '50' }))
      .toEqual({
        filteri: { grupa: 7, q: 'Petar', od: '2025-02-28', zavrseno: true },
        sort: 'naziv,asc',
        strana: 3,
        velicina: 50,
      });
  });

  it('strana=abc -> 1; strana=0, -2, 1.5 -> 1', () => {
    expect(parse({ strana: 'abc' }).strana).toBe(1);
    expect(parse({ strana: '0' }).strana).toBe(1);
    expect(parse({ strana: '-2' }).strana).toBe(1);
    expect(parse({ strana: '1.5' }).strana).toBe(1);
    expect(parse({ strana: '99999999999999999999' }).strana).toBe(1);
  });

  it('velicina=1000 -> 25; dozvoljene su samo VELICINE', () => {
    expect(parse({ velicina: '1000' }).velicina).toBe(25);
    expect(parse({ velicina: '7' }).velicina).toBe(25);
    expect(parse({ velicina: 'x' }).velicina).toBe(25);
    for (const v of VELICINE) {
      expect(parse({ velicina: String(v) }).velicina).toBe(v);
    }
  });

  it('broj koji nije pozitivan ceo broj -> podrazumevano (grupa=-3, 0, 2.5, 1e3, 0x10, prazno sa razmakom)', () => {
    for (const g of ['-3', '0', '2.5', '1e3', '0x10', ' 5', 'abc', '007a', '99999999999999999999']) {
      expect(parse({ grupa: g }).filteri.grupa, g).toBeNull();
    }
  });

  it('datum mora biti YYYY-MM-DD koji postoji (2025-02-30 -> podrazumevano)', () => {
    for (const d of ['2025-02-30', '2025-13-01', '2025-2-3', '2025-02-29', '20250101', '2025-01-01T00:00', 'x']) {
      expect(parse({ od: d }).filteri.od, d).toBeNull();
    }
    expect(parse({ od: '2024-02-29' }).filteri.od).toBe('2024-02-29');
  });

  it('bool prihvata samo true/false', () => {
    expect(parse({ zavrseno: 'false' }).filteri.zavrseno).toBe(false);
    for (const b of ['1', 'TRUE', 'yes', 'da']) {
      expect(parse({ zavrseno: b }).filteri.zavrseno, b).toBeNull();
    }
  });

  it('tekst se trimuje, prazan je null, predugačak se skraćuje na MAX_TEKST', () => {
    expect(parse({ q: '  Ana ' }).filteri.q).toBe('Ana');
    expect(parse({ q: '   ' }).filteri.q).toBeNull();
    expect(parse({ q: 'a'.repeat(201) }).filteri.q).toBe('a'.repeat(MAX_TEKST));
  });

  it('sort=lozinka,asc -> podrazumevani; samo polje,(asc|desc) iz dozvoljenih', () => {
    for (const s of ['lozinka,asc', 'datum', 'datum,up', 'naziv,ASC', 'datum,asc,x', ',asc', 'naziv;asc']) {
      expect(parse({ sort: s }).sort, s).toBe('datum,desc');
    }
    expect(parse({ sort: 'datum,asc' }).sort).toBe('datum,asc');
  });

  it('bez liste dozvoljenih polja prihvata se samo polje podrazumevanog sorta', () => {
    const p = (s: string) => parseListParams<Filteri>(convertToParamMap({ sort: s }), DEFS, POD).sort;
    expect(p('datum,asc')).toBe('datum,asc');
    expect(p('naziv,asc')).toBe('datum,desc');
  });

  it('prazan parametar filtera znači eksplicitno "bez filtera" (null), i kad podrazumevana vrednost nije null', () => {
    const pod: ListQuery<Filteri> = { ...POD, filteri: { ...POD.filteri, grupa: 3 } };
    expect(parseListParams<Filteri>(convertToParamMap({ grupa: '' }), DEFS, pod).filteri.grupa).toBeNull();
    expect(parseListParams<Filteri>(convertToParamMap({}), DEFS, pod).filteri.grupa).toBe(3);
  });

  it('nepoznati parametri se ignorišu, ponovljeni parametar uzima prvu vrednost', () => {
    const q = parseListParams<Filteri>(convertToParamMap({ grupa: ['4', '9'], nesto: 'x' }), DEFS, POD, SORT_POLJA);
    expect(q.filteri.grupa).toBe(4);
    expect(Object.keys(q.filteri).sort()).toEqual(['grupa', 'od', 'q', 'zavrseno']);
  });

  it('vrednosti koje nisu string (sačuvani JSON iz localStorage-a) -> podrazumevano, bez izuzetka', () => {
    const smece = { grupa: 5, q: { a: 1 }, od: null, zavrseno: true, strana: 2, velicina: [50], sort: ['naziv,asc'] } as unknown as Record<string, string>;
    const q = parseListParams<Filteri>(convertToParamMap(smece), DEFS, POD, SORT_POLJA);
    expect(q.filteri).toEqual(POD.filteri);
    expect(q.strana).toBe(1);
    expect(q.sort).toBe('naziv,asc');
    expect(q.velicina).toBe(25);
  });

  it('nevažeći podrazumevani sort i veličina se ne prenose u rezultat kao smeće', () => {
    const q = parseListParams<Filteri>(convertToParamMap({}), DEFS, { ...POD, velicina: 33 });
    expect(q.velicina).toBe(25);
  });
});

describe('toQueryParams', () => {
  it('izostavlja vrednosti jednake podrazumevanim (čist URL)', () => {
    expect(toQueryParams(POD, POD)).toEqual({});
    const smece = parse({ strana: 'abc', velicina: '1000', grupa: '-3', od: '2025-02-30', sort: 'lozinka,asc' });
    expect(toQueryParams(smece, POD)).toEqual({});
  });

  it('okrugli put za ispravne vrednosti', () => {
    const ulaz = { grupa: '7', q: 'Petar Petrović', od: '2025-02-28', zavrseno: 'false', sort: 'naziv,asc', strana: '3', velicina: '100' };
    const q = parse(ulaz);
    expect(toQueryParams(q, POD)).toEqual(ulaz);
    expect(parse(toQueryParams(q, POD) as Record<string, string>)).toEqual(q);
  });

  it('null kad podrazumevano nije null ide kao prazan parametar, pa okrugli put važi', () => {
    const pod: ListQuery<Filteri> = { ...POD, filteri: { ...POD.filteri, grupa: 3 } };
    const q: ListQuery<Filteri> = { ...pod, filteri: { ...pod.filteri, grupa: null } };
    const params = toQueryParams(q, pod);
    expect(params).toEqual({ grupa: '' });
    expect(parseListParams<Filteri>(convertToParamMap(params), DEFS, pod)).toEqual(q);
  });
});

describe('toHttpParams', () => {
  it('strana -> page (0-based), velicina -> size, sort, filteri po mapi naziva, bez null vrednosti', () => {
    const q = parse({ grupa: '7', q: 'Ana', zavrseno: 'true', strana: '2', velicina: '50', sort: 'naziv,asc' });
    const h = toHttpParams(q, { grupa: 'grupaId' });
    expect(h.get('page')).toBe('1');
    expect(h.get('size')).toBe('50');
    expect(h.get('sort')).toBe('naziv,asc');
    expect(h.get('grupaId')).toBe('7');
    expect(h.has('grupa')).toBe(false);
    expect(h.get('q')).toBe('Ana');
    expect(h.get('zavrseno')).toBe('true');
    expect(h.has('od')).toBe(false);
  });

  it('preskače undefined i brojeve koji nisu konačni (NaN iz loše rute ne ide backendu)', () => {
    const q = { ...POD, filteri: { grupa: Number.NaN, q: undefined, od: null, zavrseno: false } } as unknown as ListQuery<Filteri>;
    const h = toHttpParams(q, {});
    expect(h.keys().sort()).toEqual(['page', 'size', 'sort', 'zavrseno']);
    expect(h.get('zavrseno')).toBe('false');
  });
});

describe('normalizujFilter', () => {
  it('primenjuje ista pravila kao URL na vrednosti iz koda', () => {
    expect(normalizujFilter(5, { tip: 'broj' })).toBe(5);
    expect(normalizujFilter(Number.NaN, { tip: 'broj' })).toBeUndefined();
    expect(normalizujFilter(2.5, { tip: 'broj' })).toBeUndefined();
    expect(normalizujFilter(undefined, { tip: 'broj' })).toBeNull();
    expect(normalizujFilter('  Ana  ', { tip: 'tekst' })).toBe('Ana');
    expect(normalizujFilter('   ', { tip: 'tekst' })).toBeNull();
    expect(normalizujFilter(true, { tip: 'bool' })).toBe(true);
    expect(normalizujFilter('2025-02-30', { tip: 'datum' })).toBeUndefined();
    expect(normalizujFilter({}, { tip: 'tekst' })).toBeUndefined();
  });
});

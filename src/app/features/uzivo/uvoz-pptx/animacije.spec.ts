import type { Efekat, Okidac, Smer, VrstaAnimacije } from '../data-access/platno.models';
import { pasusiSaAnimacijom, pretvoriAnimacije, type MapaMeta, type MetaPasusa } from './animacije';
import { GRANICE } from './granice';
import type { KodUpozorenja } from './izvestaj';
import { NS_DEKL, timing, type EfekatFabrike } from './pptx-fabrika.testing';
import { NS, dete } from './xml';

/** `p:timing` iz fabrike kao element (isti imenski prostori kao slajd). */
function tm(xml: string): Element {
  const doc = new DOMParser().parseFromString(`<p:sld ${NS_DEKL}>${xml}</p:sld>`, 'application/xml');
  return dete(doc.documentElement, NS.p, 'timing')!;
}

/** Lažna mapa meta: spid -> slojevi; pasus podrazumevano = poslednji sloj objekta (tekst iznad oblika), isti indeks. */
function mete(slojevi: Record<string, string[]>, pasus?: (spid: string, i: number) => MetaPasusa | null): MapaMeta {
  return {
    slojevi: (spid) => slojevi[spid] ?? [],
    pasus: pasus ?? ((spid, i) => {
      const s = slojevi[spid];
      return s?.length ? { slojId: s[s.length - 1], pasus: i, spojeno: false } : null;
    }),
  };
}
const SVE = mete({ '5': ['s5'], '6': ['s6'], '7': ['s7'] });

function pretvori(xml: string | null, m: MapaMeta = SVE) {
  const upozorenja: { kod: KodUpozorenja; poruka: string }[] = [];
  const r = pretvoriAnimacije(xml === null ? null : tm(xml), m, (kod, poruka) => upozorenja.push({ kod, poruka }));
  return { ...r, upozorenja, kodovi: upozorenja.map((u) => u.kod) };
}
const efekti = (lista: EfekatFabrike[], m?: MapaMeta) => pretvori(timing(lista), m);
const klik = (o: Partial<EfekatFabrike> = {}): EfekatFabrike => ({ spid: 5, klasa: 'entr', preset: 10, okidac: 'clickEffect', ...o });
const sa = (o: Partial<EfekatFabrike> = {}): EfekatFabrike => klik({ okidac: 'withEffect', ...o });
const posle = (o: Partial<EfekatFabrike> = {}): EfekatFabrike => klik({ okidac: 'afterEffect', ...o });
const okidaci = (r: { animacije: { okidac: Okidac }[] }) => r.animacije.map((a) => a.okidac);
const broj = (r: { kodovi: KodUpozorenja[] }, kod: KodUpozorenja) => r.kodovi.filter((k) => k === kod).length;

describe('pretvoriAnimacije: efekti', () => {
  type Red = [number, number, string | undefined, Efekat, Smer | null, KodUpozorenja | null];
  const redovi: Red[] = [
    [1, 0, undefined, 'POJAVI', null, null],
    [10, 0, undefined, 'FADE', null, null],
    [2, 8, undefined, 'ULET', 'LEVO', null],
    [22, 4, undefined, 'BRISANJE', 'DOLE', null],
    [16, 21, 'barn(inVertical)', 'PODELI', 'VERTIKALNO', 'PODELI_SMER'],
    [23, 0, undefined, 'ZUM', null, null],
    [53, 16, undefined, 'ZUM', null, null],
    [31, 0, undefined, 'ZUM', null, 'EFEKAT_PRIBLIZAN'],
    [6, 0, 'circle(in)', 'FADE', null, 'EFEKAT_ZAMENJEN'],
  ];
  // BRISANJE kao IZLAZ: zrcaljen smer (vidi test "BRISANJE kao IZLAZ" ispod)
  const izlaz = ([p, t, f, e, smer, k]: Red): Red => [p, t, f, e, e === 'BRISANJE' && smer === 'DOLE' ? 'GORE' : smer, k];
  const slucajevi: [...Red, 'entr' | 'exit', VrstaAnimacije][] = redovi.flatMap((r): [...Red, 'entr' | 'exit', VrstaAnimacije][] =>
    [[...r, 'entr', 'ULAZ'], [...izlaz(r), 'exit', 'IZLAZ']]);

  it.each(slucajevi)('preset %i (podtip %i, filter %s) -> %s %s, upozorenje %s (%s)', (preset, podtip, filter, efekat, smer, kod, klasa, vrsta) => {
    const r = efekti([klik({ klasa, preset, podtip, filter })]);
    expect(r.animacije).toEqual([{
      id: 'a1', slojId: 's5', pasus: null, vrsta, efekat, smer, okidac: 'KLIK',
      trajanjeMs: efekat === 'POJAVI' ? 0 : 500, kasnjenjeMs: 0,
    }]);
    expect(r.kodovi).toEqual(kod ? [kod] : []);
  });

  it('završni talas: poruka PODELI_SMER za izlaz opisuje izlaz (od sredine -> ka sredini), za ulaz ulaz', () => {
    const poruka = (klasa: 'entr' | 'exit') => efekti([klik({ klasa, preset: 16, podtip: 21, filter: 'barn(inVertical)' })]).upozorenja;
    expect(poruka('entr')).toEqual([{ kod: 'PODELI_SMER', poruka: 'Podela ka sredini se prikazuje kao podela od sredine.' }]);
    expect(poruka('exit')).toEqual([{
      kod: 'PODELI_SMER', poruka: 'Izlaz podelom od sredine se prikazuje kao izlaz podelom ka sredini.',
    }]);
  });

  it('63 (entr) je ISCRTAJ sleva; 63 kao exit je FADE uz EFEKAT_ZAMENJEN', () => {
    const ulaz = efekti([klik({ preset: 63 })]);
    expect(ulaz.animacije[0]).toMatchObject({ efekat: 'ISCRTAJ', smer: 'LEVO', vrsta: 'ULAZ' });
    expect(ulaz.kodovi).toEqual([]);
    const izlaz = efekti([klik({ preset: 63, klasa: 'exit' })]);
    expect(izlaz.animacije[0]).toMatchObject({ efekat: 'FADE', smer: null, vrsta: 'IZLAZ' });
    expect(izlaz.kodovi).toEqual(['EFEKAT_ZAMENJEN']);
    expect(izlaz.upozorenja[0].poruka).toContain('Efekat 63');
  });

  it.each([[1, 'GORE'], [2, 'DESNO'], [4, 'DOLE'], [8, 'LEVO'], [3, 'GORE'], [9, 'GORE'], [6, 'DOLE'], [12, 'DOLE'], [0, 'DOLE']] as [number, Smer][])(
    'smer ULET-a i BRISANJA iz podtipa %i -> %s', (podtip, smer) => {
      expect(efekti([klik({ preset: 2, podtip })]).animacije[0].smer).toBe(smer);
      expect(efekti([klik({ preset: 22, podtip })]).animacije[0].smer).toBe(smer);
    });

  /*
   * PowerPoint za izlaz "Wipe" (preset 22) zadržava natpise "From Bottom/Left/Right/Top" i isti podtip kao ulaz (bit strane
   * sa koje brisanje kreće): kod izlaza "From Bottom" prvo nestaje DONJI deo. Platno izlaz crta kao obrnut ulaz istog smera
   * (`kadroviAnimacije`), pa bi IZLAZ DOLE prvo sakrio gornji deo (zrcaljeno). Zato se smer izlaza obrće: "From Bottom" ->
   * GORE (obrnut ulaz odozgo: prvo nestaje donji deo). Dokaz: LibreOffice (`sd/xml/effects.xml` ooo-exit-wipe from-bottom =
   * isti barWipe kao ulaz from-bottom sa mode="out", a `transitionfactorytab.cxx` barWipe "out by subtraction").
   */
  it.each([[1, 'DOLE'], [2, 'LEVO'], [4, 'GORE'], [8, 'DESNO'], [3, 'DOLE'], [12, 'GORE'], [0, 'GORE']] as [number, Smer][])(
    'BRISANJE kao IZLAZ: podtip %i -> zrcaljen smer %s (ULET-izlaz i ulaz bez zrcaljenja)', (podtip, smer) => {
      expect(efekti([klik({ klasa: 'exit', preset: 22, podtip })]).animacije[0]).toMatchObject({ vrsta: 'IZLAZ', efekat: 'BRISANJE', smer });
      const ulaz = efekti([klik({ preset: 22, podtip })]).animacije[0].smer;
      expect(efekti([klik({ klasa: 'exit', preset: 2, podtip })]).animacije[0].smer).toBe(ulaz);
    });

  it('PODELI: barn(outHorizontal) je HORIZONTALNO bez upozorenja; nepoznat filter je VERTIKALNO', () => {
    const r = efekti([klik({ preset: 16, filter: 'barn(outHorizontal)' }), klik({ preset: 16, filter: 'nepoznat' })]);
    expect(r.animacije.map((a) => a.smer)).toEqual(['HORIZONTALNO', 'VERTIKALNO']);
    expect(r.kodovi).toEqual([]);
  });

  it('isto upozorenje se prijavljuje jednom, sa brojem ponavljanja', () => {
    const r = efekti([klik({ preset: 6 }), klik({ preset: 6, spid: 6 }), klik({ preset: 26, spid: 7 })]);
    expect(r.animacije).toHaveLength(3);
    expect(r.upozorenja.map((u) => u.poruka)).toEqual([
      'Efekat 6 nije podržan; prikazuje se kao FADE (2 puta).',
      'Efekat 26 nije podržan; prikazuje se kao FADE.',
    ]);
  });

  it('p:iterate (po rečima): cela meta odjednom + TEKST_PRIBLIZAN', () => {
    const xml = timing([klik({ pasus: 1 })]).replace('</p:stCondLst><p:childTnLst><p:set>',
      '</p:stCondLst><p:iterate type="wd"><p:tmPct val="10000"/></p:iterate><p:childTnLst><p:set>');
    const r = pretvori(xml);
    expect(r.animacije).toEqual([expect.objectContaining({ slojId: 's5', pasus: 1, efekat: 'FADE' })]);
    expect(r.kodovi).toEqual(['TEKST_PRIBLIZAN']);
  });
});

describe('pretvoriAnimacije: okidači i vreme', () => {
  it('okidaciIGrupa0: [with pre prvog klika, click, after] -> SA_PRETHODNIM, KLIK, POSLE_PRETHODNOG', () => {
    const r = efekti([sa({ spid: 5 }), klik({ spid: 6 }), posle({ spid: 7 })]);
    expect(okidaci(r)).toEqual(['SA_PRETHODNIM', 'KLIK', 'POSLE_PRETHODNOG']);
    expect(r.animacije.map((a) => [a.id, a.slojId])).toEqual([['a1', 's5'], ['a2', 's6'], ['a3', 's7']]);
    expect(r.animacije.map((a) => a.kasnjenjeMs)).toEqual([0, 0, 0]);
    expect(r.klikoviPptx).toBe(1);
    expect(r.efekataPptx).toBe(3);
    expect(r.kodovi).toEqual([]);
  });

  it('trajanjeIKasnjenje: Fade 750/250; Appear 0; trajanje i kašnjenje preko 10000 -> 10000', () => {
    expect(efekti([klik({ trajanje: 750, kasnjenje: 250 })]).animacije[0]).toMatchObject({ trajanjeMs: 750, kasnjenjeMs: 250 });
    expect(efekti([klik({ preset: 1, kasnjenje: 100 })]).animacije[0]).toMatchObject({ efekat: 'POJAVI', trajanjeMs: 0, kasnjenjeMs: 100 });
    expect(efekti([klik({ trajanje: 20000, kasnjenje: 20000 })]).animacije[0]).toMatchObject({ trajanjeMs: 10000, kasnjenjeMs: 10000 });
  });

  it('trajanje efekta je najkasniji kraj ponašanja (kašnjenje + dur deteta)', () => {
    const xml = timing([klik({ trajanje: 500 })]).replace('dur="500"/>',
      'dur="500"><p:stCondLst><p:cond delay="250"/></p:stCondLst></p:cTn>');
    expect(pretvori(xml).animacije[0].trajanjeMs).toBe(750);
  });

  it('delay="indefinite" na efektu je kašnjenje 0', () => {
    const xml = timing([klik({ kasnjenje: 300 })]).replace('nodeType="clickEffect"><p:stCondLst><p:cond delay="300"/>',
      'nodeType="clickEffect"><p:stCondLst><p:cond delay="indefinite"/>');
    expect(pretvori(xml).animacije[0].kasnjenjeMs).toBe(0);
  });

  it('Appear posle Fade-a i Fade posle Appear-a zadržavaju PowerPointovo vreme (Appear traje 0)', () => {
    const r = efekti([klik({ preset: 1 }), posle({ spid: 6, kasnjenje: 100 })]);
    expect(r.animacije.map((a) => [a.okidac, a.kasnjenjeMs])).toEqual([['KLIK', 0], ['POSLE_PRETHODNOG', 100]]);
  });
});

describe('pretvoriAnimacije: mete', () => {
  it('pasusTeksta: pRg st=2 -> pasus 2 na sloju teksta', () => {
    const r = efekti([klik({ pasus: 2 })]);
    expect(r.animacije[0]).toMatchObject({ slojId: 's5', pasus: 2 });
  });

  it('pasusTeksta: rasklopljena formula -> sloj pojasa, pasus null', () => {
    const m = mete({ '5': ['s5p0', 's5p1', 's5p2'] }, (_spid, i) => ({ slojId: `s5p${i}`, pasus: null, spojeno: false }));
    const r = efekti([klik({ pasus: 2 }), klik({ pasus: 0 })], m);
    expect(r.animacije.map((a) => [a.slojId, a.pasus])).toEqual([['s5p2', null], ['s5p0', null]]);
    expect(r.kodovi).toEqual([]);
  });

  it('pasusTeksta: spojeno -> od tri animacije pasusa ostaje prva (bez ANIMACIJA_PRESKOCENA)', () => {
    const m = mete({ '5': ['s5'] }, () => ({ slojId: 's5', pasus: null, spojeno: true }));
    const r = efekti([klik({ pasus: 0 }), sa({ pasus: 1 }), sa({ pasus: 2 })], m);
    expect(r.animacije).toEqual([expect.objectContaining({ id: 'a1', slojId: 's5', pasus: null, okidac: 'KLIK' })]);
    expect(r.kodovi).toEqual([]);
  });

  it('spojeno: preskočeni klikovi pasusa važe (KLIK_IZGUBLJEN), izlaz istog sloja ostaje', () => {
    const m = mete({ '5': ['s5'] }, () => ({ slojId: 's5', pasus: null, spojeno: true }));
    const r = efekti([klik({ pasus: 0 }), klik({ pasus: 1 }), klik({ pasus: 2 }), klik({ pasus: 0, klasa: 'exit' })], m);
    expect(r.animacije.map((a) => [a.vrsta, a.okidac])).toEqual([['ULAZ', 'KLIK'], ['IZLAZ', 'KLIK']]);
    expect(r.kodovi).toEqual(['KLIK_IZGUBLJEN', 'KLIK_IZGUBLJEN']);
  });

  it('grupa: meta sa 3 sloja, KLIK, kašnjenje 300 -> KLIK/300, SA_PRETHODNIM/300, SA_PRETHODNIM/300', () => {
    const r = efekti([klik({ kasnjenje: 300 })], mete({ '5': ['s7', 's8', 's9'] }));
    expect(r.animacije.map((a) => [a.id, a.slojId, a.okidac, a.kasnjenjeMs])).toEqual([
      ['a1', 's7', 'KLIK', 300], ['a2', 's8', 'SA_PRETHODNIM', 300], ['a3', 's9', 'SA_PRETHODNIM', 300],
    ]);
  });

  it('grupa sa POSLE_PRETHODNOG: kopije kreću zajedno sa prvom', () => {
    const r = efekti([klik({ spid: 6 }), posle({ kasnjenje: 100 })], mete({ '5': ['s7', 's8'], '6': ['s6'] }));
    expect(r.animacije.map((a) => [a.slojId, a.okidac, a.kasnjenjeMs])).toEqual([
      ['s6', 'KLIK', 0], ['s7', 'POSLE_PRETHODNOG', 100], ['s8', 'SA_PRETHODNIM', 100],
    ]);
  });

  it('dvostrukaKopija: oblik + tekst i animacija pasusa 0 -> samo TEKST sloj', () => {
    const r = efekti([klik({ pasus: 0 })], mete({ '5': ['s5', 's5t'] }));
    expect(r.animacije).toEqual([expect.objectContaining({ slojId: 's5t', pasus: 0 })]);
  });

  it('pasus koji nije uvezen -> preskočeno + ANIMACIJA_PRESKOCENA', () => {
    const r = efekti([klik({ spid: 6 }), sa({ pasus: 3 })], mete({ '5': ['s5'], '6': ['s6'] }, () => null));
    expect(r.animacije.map((a) => a.slojId)).toEqual(['s6']);
    expect(r.kodovi).toEqual(['ANIMACIJA_PRESKOCENA']);
  });
});

describe('pretvoriAnimacije: Review Focus 3', () => {
  it('metaNePostoji: spid 99 -> preskočeno + upozorenje', () => {
    const r = efekti([klik(), sa({ spid: 99 })]);
    expect(r.animacije.map((a) => a.slojId)).toEqual(['s5']);
    expect(r.kodovi).toEqual(['ANIMACIJA_PRESKOCENA']);
    expect(r.upozorenja[0].poruka).toContain('nije uvezen');
    expect(r.efekataPptx).toBe(2);
  });

  it('putanjaKaoKlik: [path click, fade with] -> fade postaje KLIK, bez KLIK_IZGUBLJEN', () => {
    const r = efekti([klik({ klasa: 'path', preset: 42 }), sa({ spid: 6 })]);
    expect(r.animacije).toEqual([expect.objectContaining({ id: 'a1', slojId: 's6', okidac: 'KLIK', kasnjenjeMs: 0 })]);
    expect(r.kodovi).toEqual(['ANIMACIJA_PRESKOCENA']);
    expect(r.klikoviPptx).toBe(1);
  });

  it('samoPutanja: [fade click, path click, fade click] -> 2 animacije, KLIK_IZGUBLJEN 1, klikoviPptx 3', () => {
    const r = efekti([klik(), klik({ klasa: 'path', preset: 42, spid: 6 }), klik({ spid: 7 })]);
    expect(okidaci(r)).toEqual(['KLIK', 'KLIK']);
    expect(broj(r, 'KLIK_IZGUBLJEN')).toBe(1);
    expect(r.upozorenja.find((u) => u.kod === 'KLIK_IZGUBLJEN')!.poruka).toContain('korak manje nego u PowerPointu');
    expect(r.klikoviPptx).toBe(3);
    expect(r.efekataPptx).toBe(3);
  });

  it('emphNaPocetku (grupa 0): preskočeno, bez KLIK_IZGUBLJEN', () => {
    const r = efekti([sa({ klasa: 'emph', preset: 32 }), klik({ spid: 6 })]);
    expect(r.animacije.map((a) => [a.slojId, a.okidac])).toEqual([['s6', 'KLIK']]);
    expect(r.kodovi).toEqual(['ANIMACIJA_PRESKOCENA']);
  });

  it('preskočen efekat ne pomera vreme sledećih: POSLE_PRETHODNOG čeka i preskočenu putanju', () => {
    // PowerPoint: A 0-500, putanja 500-2500, C posle nje od 2500. Platno: A se završava u 500, pa C dobija 2000.
    const r = efekti([klik(), posle({ klasa: 'path', preset: 42, spid: 6, trajanje: 2000 }), posle({ spid: 7 })]);
    expect(r.animacije.map((a) => [a.slojId, a.okidac, a.kasnjenjeMs])).toEqual([['s5', 'KLIK', 0], ['s7', 'POSLE_PRETHODNOG', 2000]]);
  });

  it('unapređen KLIK zadržava vreme: [path click 2000, fade after] -> fade KLIK sa kašnjenjem 2000', () => {
    const r = efekti([klik({ klasa: 'path', preset: 42, trajanje: 2000 }), posle({ spid: 6 })]);
    expect(r.animacije.map((a) => [a.slojId, a.okidac, a.kasnjenjeMs])).toEqual([['s6', 'KLIK', 2000]]);
    expect(broj(r, 'KLIK_IZGUBLJEN')).toBe(0);
  });

  it('interaktivni: 0 animacija + jedno ANIMACIJA_PRESKOCENA', () => {
    const r = pretvori(timing([klik(), klik({ spid: 6 })], true));
    expect(r.animacije).toEqual([]);
    expect(r.kodovi).toEqual(['ANIMACIJA_PRESKOCENA']);
    expect(r.upozorenja[0].poruka).toContain('okidač klikom na objekat nije podržan');
    expect(r.klikoviPptx).toBe(0);
    expect(r.efekataPptx).toBe(0);
  });

  it('bezTiminga: [] i 0 klikova', () => {
    expect(pretvori(null)).toMatchObject({ animacije: [], efekataPptx: 0, klikoviPptx: 0, kodovi: [] });
  });
});

/** Efekat Fade u zapisu kakav piše PowerPoint (sa jednim ponašanjem `animEffect`). */
const fadeXml = (spid: number, okidac: string, o: { dur?: number; kasnjenje?: number; iterate?: string } = {}) =>
  `<p:par><p:cTn id="9" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" nodeType="${okidac}">`
  + `<p:stCondLst><p:cond delay="${o.kasnjenje ?? 0}"/></p:stCondLst>${o.iterate ?? ''}<p:childTnLst>`
  + `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="9" dur="${o.dur ?? 500}"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:animEffect>`
  + '</p:childTnLst></p:cTn></p:par>';
const parXml = (kasnjenje: string, deca: string[]) =>
  `<p:par><p:cTn id="8" fill="hold"><p:stCondLst><p:cond delay="${kasnjenje}"/></p:stCondLst><p:childTnLst>${deca.join('')}</p:childTnLst></p:cTn></p:par>`;
/** `p:timing` kao kod PowerPointa: grupa klika -> unutrašnji `p:par` sa zapisanim kašnjenjem -> efekti. */
const kanonski = (grupe: [string, string[]][][]) => '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
  + '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
  + grupe.map((g) => parXml('indefinite', g.map(([d, e]) => parXml(d, e)))).join('')
  + '</p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>';
const ITERATE = '<p:iterate type="lt"><p:tmPct val="10000"/></p:iterate>';

describe('pretvoriAnimacije: zapisano vreme PowerPointa', () => {
  it('p:iterate pa afterEffect: početak iz zapisanog p:par (950 ms), ne iz rekonstrukcije (500 ms)', () => {
    // 10 slova, 10% razmaka: PowerPoint zapisuje kraj 500 + 9 x 50 = 950.
    const r = pretvori(kanonski([[['0', [fadeXml(5, 'clickEffect', { iterate: ITERATE })]], ['950', [fadeXml(6, 'afterEffect')]]]]));
    expect(r.animacije.map((a) => [a.slojId, a.okidac, a.kasnjenjeMs])).toEqual([['s5', 'KLIK', 0], ['s6', 'POSLE_PRETHODNOG', 450]]);
    expect(r.kodovi).toEqual(['TEKST_PRIBLIZAN']);
  });

  it('nebrojčano kašnjenje p:par-a -> rekonstrukcija po okidačima', () => {
    const r = pretvori(kanonski([[['0', [fadeXml(5, 'clickEffect')]], ['indefinite', [fadeXml(6, 'afterEffect', { kasnjenje: 100 })]]]]));
    expect(r.animacije.map((a) => [a.slojId, a.okidac, a.kasnjenjeMs])).toEqual([['s5', 'KLIK', 0], ['s6', 'POSLE_PRETHODNOG', 100]]);
  });

  it('kanonski lanac (posle + sa u istom p:par-u) daje isto što i okidači', () => {
    const r = pretvori(kanonski([[['0', [fadeXml(5, 'clickEffect')]], ['500', [fadeXml(6, 'afterEffect'), fadeXml(7, 'withEffect', { kasnjenje: 200 })]]]]));
    expect(r.animacije.map((a) => [a.slojId, a.okidac, a.kasnjenjeMs])).toEqual([
      ['s5', 'KLIK', 0], ['s6', 'POSLE_PRETHODNOG', 0], ['s7', 'SA_PRETHODNIM', 200],
    ]);
  });
});

describe('pretvoriAnimacije: ponavljanje', () => {
  const sa1 = (xml: string, a: string, b: string) => xml.replace(a, b);
  it.each([
    ['repeatCount="3000"', (x: string) => sa1(x, 'nodeType="clickEffect">', 'nodeType="clickEffect" repeatCount="3000">'), 1000],
    ['repeatCount="indefinite" (1 prolaz)', (x: string) => sa1(x, 'nodeType="clickEffect">', 'nodeType="clickEffect" repeatCount="indefinite">'), 0],
    ['autoRev na ponašanju', (x: string) => sa1(x, 'dur="500"/>', 'dur="500" autoRev="1"/>'), 500],
  ] as [string, (x: string) => string, number][])('%s: jedan prolaz na platnu, sledeći efekat čeka kao u PowerPointu, EFEKAT_PRIBLIZAN', (_, izmena, kasnjenje) => {
    const r = pretvori(izmena(timing([klik(), posle({ spid: 6 })])));
    expect(r.animacije.map((a) => [a.okidac, a.trajanjeMs, a.kasnjenjeMs])).toEqual([['KLIK', 500, 0], ['POSLE_PRETHODNOG', 500, kasnjenje]]);
    expect(r.kodovi).toEqual(['EFEKAT_PRIBLIZAN']);
  });

  it('repeatCount="1000" je jedan prolaz bez upozorenja; dva ponavljanja na slajdu -> jedno upozorenje', () => {
    const jedan = pretvori(timing([klik()]).replace('nodeType="clickEffect">', 'nodeType="clickEffect" repeatCount="1000">'));
    expect(jedan.kodovi).toEqual([]);
    const dva = pretvori(timing([klik(), klik({ spid: 6 })]).replaceAll('nodeType="clickEffect">', 'nodeType="clickEffect" repeatCount="2000">'));
    expect(dva.upozorenja).toEqual([{ kod: 'EFEKAT_PRIBLIZAN', poruka: 'Ponavljanje efekta se ne prenosi: efekat se pušta jednom (2 puta).' }]);
  });
});

describe('pasusiSaAnimacijom', () => {
  it('dva efekta na spid 5, pasusi 0 i 2 -> {5 -> {0, 2}}', () => {
    const m = pasusiSaAnimacijom(tm(timing([klik({ pasus: 0 }), klik({ pasus: 2 }), klik({ spid: 6 })])));
    expect(m).toEqual(new Map([['5', new Set([0, 2])]]));
  });

  it('bez timinga -> prazna mapa', () => {
    expect(pasusiSaAnimacijom(null).size).toBe(0);
  });
});

describe('pretvoriAnimacije: neprijateljski fajl (granice pre gradnje)', () => {
  // Granica vremena je labava (opterećen CI ili mašina sa više agenata: ~2,5 s izmereno), a kvadratni hod
  // (4000 efekata ~ 98 s izmereno) je i dalje daleko iznad nje.
  const mnogo = (n: number, o: Partial<EfekatFabrike> = {}) => [klik(o), ...Array.from({ length: n - 1 }, () => sa(o))];

  it('4000 efekata u jednoj grupi klika (meta nije uvezena) se obrađuje linearno: < 10 s', () => {
    const t = tm(timing(mnogo(4000, { spid: 99 })));
    const pocetak = performance.now();
    const r = pretvoriAnimacije(t, SVE, () => undefined);
    expect(performance.now() - pocetak).toBeLessThan(10_000);
    expect(r.efekataPptx).toBe(4000);
    expect(r.animacije).toEqual([]);
  });

  it('4000 efekata na uvezen objekat: gradnja staje odmah preko granice (401 animacija)', () => {
    const r = efekti(mnogo(4000));
    expect(r.animacije).toHaveLength(GRANICE.animacija + 1);
    expect(r.efekataPptx).toBe(4000);
  });

  it('grupa od 5000 slojeva x 2000 efekata ne pravi 10 miliona animacija: staje na 401, < 10 s', () => {
    const grupa = mete({ '5': Array.from({ length: 5000 }, (_, i) => `g${i}`) });
    const t = tm(timing(mnogo(2000)));
    const pocetak = performance.now();
    const r = pretvoriAnimacije(t, grupa, () => undefined);
    expect(performance.now() - pocetak).toBeLessThan(10_000);
    expect(r.animacije).toHaveLength(GRANICE.animacija + 1);
  });
});

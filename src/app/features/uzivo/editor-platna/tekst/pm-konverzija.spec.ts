import { DOMSerializer } from 'prosemirror-model';
import { pasus } from '../../data-access/platno-podaci.testing';
import type { Deo, Lista, Pasus } from '../../data-access/platno.models';
import { atributiDela, dokUPasuse, istiStil, normalizujPasuse, pasusiUDok } from './pm-konverzija';
import { type AtributiPasusa, napraviSemu, uCss } from './pm-sema';

/** Deo podrazumevanog stila (`pasus('')`: Carlito 18, crno) sa izmenama. */
function deo(tekst: string, izmene: Partial<Deo> = {}): Deo {
  return { ...pasus('').delovi[0], tekst, ...izmene };
}
function sa(izmene: Partial<Pasus>): Pasus {
  return { ...pasus('X'), ...izmene };
}
function delovi(...d: Deo[]): Pasus {
  return { ...pasus(''), delovi: d };
}
const rt = (p: readonly Pasus[]): Pasus[] => dokUPasuse(pasusiUDok(p, napraviSemu()));
const znak: Lista = { vrsta: 'ZNAK', znak: '–', boja: '#1F6F78', format: null, pocetak: null };
const broj = (format: Lista['format'], pocetak: number | null): Lista => ({ vrsta: 'BROJ', znak: null, boja: null, format, pocetak });

describe('pm-konverzija: preslikavanje bez gubitka (dokUPasuse(pasusiUDok(p)) = normalizujPasuse(p))', () => {
  const slucajevi: [string, Pasus[]][] = [
    // Atributi dela, po jedan različit od podrazumevanog.
    ['deo: font Caladea', [delovi(deo('X', { font: 'Caladea' }))]],
    ['deo: veličina 40.5', [delovi(deo('X', { velicina: 40.5 }))]],
    ['deo: boja #C00000', [delovi(deo('X', { boja: '#C00000' }))]],
    ['deo: podebljano', [delovi(deo('X', { podebljano: true }))]],
    ['deo: kurziv', [delovi(deo('X', { kurziv: true }))]],
    ['deo: podvučeno', [delovi(deo('X', { podvuceno: true }))]],
    ['deo: precrtano', [delovi(deo('X', { precrtano: true }))]],
    ['deo: položaj INDEKS', [delovi(deo('X', { polozaj: 'INDEKS' }))]],
    ['deo: položaj EKSPONENT', [delovi(deo('X', { polozaj: 'EKSPONENT' }))]],
    ['deo: tri dela različitih stilova (redosled i granice)', [
      delovi(deo('Prvi ', { podebljano: true }), deo('drugi ', { boja: '#C00000' }), deo('treći', { kurziv: true, velicina: 24 })),
    ]],
    // Atributi pasusa.
    ['pasus: poravnanje CENTAR', [sa({ poravnanje: 'CENTAR' })]],
    ['pasus: poravnanje DESNO', [sa({ poravnanje: 'DESNO' })]],
    ['pasus: poravnanje OBOSTRANO', [sa({ poravnanje: 'OBOSTRANO' })]],
    ['pasus: nivo 3', [sa({ nivo: 3 })]],
    ['pasus: lista ZNAK (znak –, boja #1F6F78)', [sa({ lista: znak })]],
    ['pasus: lista BROJ RIMSKI_MALI_TACKA od 4', [sa({ lista: broj('RIMSKI_MALI_TACKA', 4) })]],
    ['pasus: lista BROJ ARAPSKI', [sa({ lista: broj('ARAPSKI', 1) })]],
    ['pasus: uvlačenje {54, -18}', [sa({ uvlacenje: { levo: 54, prviRed: -18 } })]],
    ['pasus: razmak pre 10 i posle 6', [sa({ razmakPre: 10, razmakPosle: 6 })]],
    ['pasus: prored 85%', [sa({ proredProcenat: 85 })]],
    ['pasus: tabulatori', [sa({ tabulatori: [{ poz: 72, poravnanje: 'LEVO' }, { poz: 200, poravnanje: 'DECIMALNO' }] })]],
    // Tekst.
    ['tekst: tab', [pasus('a\tb')]],
    ['tekst: prelom u sredini', [pasus('a\nb')]],
    ['tekst: prelom na kraju', [pasus('a\n')]],
    ['tekst: samo prelom sa sopstvenim stilom između dva dela', [delovi(deo('a'), deo('\n', { velicina: 40 }), deo('b'))]],
    ['tekst: dva preloma zaredom', [pasus('a\n\nb')]],
    ['tekst: srpska slova i par surogata', [pasus('čćđšž 😀')]],
    // Prazni oblici.
    ['prazno: delovi []', [delovi()]],
    ['prazno: jedan prazan deo (32 pt)', [delovi(deo('', { velicina: 32 }))]],
    ['prazno: dva prazna dela', [delovi(deo('', { velicina: 32 }), deo('', { podebljano: true }))]],
    // Normalizacija.
    ['normalizacija: dva susedna dela istog stila', [delovi(deo('Dobar '), deo('dan'))]],
    ['normalizacija: prazan deo između dva neprazna', [delovi(deo('a'), deo('', { velicina: 60 }), deo('b', { kurziv: true }))]],
    // Više pasusa.
    ['više pasusa: lista ZNAK, nivoi 0, 1, 0', [
      sa({ lista: znak, nivo: 0, delovi: [deo('Prvi')] }),
      sa({ lista: znak, nivo: 1, uvlacenje: { levo: 54, prviRed: -18 }, delovi: [deo('Drugi')] }),
      sa({ lista: znak, nivo: 0, delovi: [deo('Treći')] }),
    ]],
  ];

  it.each(slucajevi)('%s', (_naziv, p) => {
    expect(rt(p)).toStrictEqual(normalizujPasuse(p));
  });

  it('bez normalizacije ostaje isti niz (lista od 3 pasusa i svi atributi pasusa)', () => {
    const p = slucajevi[slucajevi.length - 1][1];
    expect(rt(p)).toStrictEqual(p);
    const svi = [sa({
      poravnanje: 'OBOSTRANO', nivo: 2, lista: broj('RIMSKI_MALI_TACKA', 4), uvlacenje: { levo: 90, prviRed: -18 },
      razmakPre: 10, razmakPosle: 6, proredProcenat: 85, tabulatori: [{ poz: 72, poravnanje: 'CENTAR' }],
      delovi: [deo('a', { font: 'Tinos' }), deo('\n'), deo('b', { polozaj: 'EKSPONENT', podvuceno: true, precrtano: true })],
    })];
    expect(rt(svi)).toStrictEqual(svi);
  });

  it('prazan niz pasusa daje jedan prazan pasus podrazumevanih atributa', () => {
    expect(rt([])).toStrictEqual([{ ...pasus(''), delovi: [] }]);
  });
});

describe('pm-konverzija: normalizujPasuse', () => {
  it('spaja susedne delove istog stila u jedan deo spojenog teksta', () => {
    expect(normalizujPasuse([delovi(deo('Dobar '), deo('dan'))])[0].delovi).toEqual([deo('Dobar dan')]);
  });

  it('izostavlja prazan deo između dva neprazna (i spaja ih ako su istog stila)', () => {
    expect(normalizujPasuse([delovi(deo('a'), deo('', { velicina: 60 }), deo('b', { kurziv: true }))])[0].delovi)
      .toEqual([deo('a'), deo('b', { kurziv: true })]);
    expect(normalizujPasuse([delovi(deo('a'), deo('', { velicina: 60 }), deo('b'))])[0].delovi).toEqual([deo('ab')]);
  });

  it('prazan pasus zadržava samo prvi deo (stil praznog reda), a bez delova ostaje bez delova', () => {
    expect(normalizujPasuse([delovi(deo('', { velicina: 32 }), deo('', { podebljano: true }))])[0].delovi)
      .toEqual([deo('', { velicina: 32 })]);
    expect(normalizujPasuse([delovi()])[0].delovi).toEqual([]);
  });

  it('ne menja ulaz', () => {
    const ulaz = [delovi(deo('a'), deo('b'))];
    const kopija = structuredClone(ulaz);
    normalizujPasuse(ulaz);
    expect(ulaz).toEqual(kopija);
  });
});

describe('pm-konverzija: atributi dela', () => {
  it('atributiDela izostavlja tekst, istiStil poredi svih 8 atributa', () => {
    const a = atributiDela(deo('tekst'));
    expect(a).toEqual({
      font: 'Carlito', velicina: 18, boja: '#000000', podebljano: false, kurziv: false, podvuceno: false, precrtano: false,
      polozaj: 'OBICAN',
    });
    expect('tekst' in a).toBe(false);
    expect(istiStil(a, atributiDela(deo('drugi tekst')))).toBe(true);
    const izmene: Partial<Deo>[] = [
      { font: 'Caladea' }, { velicina: 18.5 }, { boja: '#C00000' }, { podebljano: true }, { kurziv: true },
      { podvuceno: true }, { precrtano: true }, { polozaj: 'INDEKS' },
    ];
    for (const izmena of izmene) {
      expect(istiStil(a, atributiDela(deo('x', izmena))), JSON.stringify(izmena)).toBe(false);
    }
  });
});

describe('pm-konverzija: ključevi pasusa i nepromenljivost', () => {
  const tri = () => [pasus('Prvi'), pasus(''), pasus('Treći')];

  it('pasusiUDok daje pasusima ključeve p0, p1, p2; dokUPasuse ih ne prenosi (ni prazanDeo)', () => {
    const dok = pasusiUDok(tri(), napraviSemu());
    const kljucevi: (string | null)[] = [];
    dok.forEach((c) => kljucevi.push((c.attrs as AtributiPasusa).kljuc));
    expect(kljucevi).toEqual(['p0', 'p1', 'p2']);
    for (const p of dokUPasuse(dok)) {
      expect('kljuc' in p).toBe(false);
      expect('prazanDeo' in p).toBe(false);
    }
  });

  it('prazan pasus pamti stil prvog dela u prazanDeo, neprazan nema prazanDeo', () => {
    const dok = pasusiUDok([delovi(deo('', { velicina: 32 })), pasus('a')], napraviSemu());
    expect((dok.child(0).attrs as AtributiPasusa).prazanDeo).toEqual(atributiDela(deo('', { velicina: 32 })));
    expect(dok.child(0).childCount).toBe(0);
    expect((dok.child(1).attrs as AtributiPasusa).prazanDeo).toBeNull();
  });

  it('pasusiUDok ne menja ulaz, a izmena atributa čvora ne menja ulaz (structuredClone)', () => {
    const ulaz = [sa({ uvlacenje: { levo: 18, prviRed: -18 }, lista: znak, tabulatori: [{ poz: 72, poravnanje: 'LEVO' }] })];
    const kopija = structuredClone(ulaz);
    const dok = pasusiUDok(ulaz, napraviSemu());
    expect(ulaz).toEqual(kopija);
    const attrs = dok.child(0).attrs as AtributiPasusa;
    attrs.uvlacenje.levo = 999;
    attrs.lista!.znak = '*';
    attrs.tabulatori[0].poz = 1;
    expect(ulaz).toEqual(kopija);
  });

  it('izmena rezultata dokUPasuse ne menja dokument', () => {
    const dok = pasusiUDok([sa({ uvlacenje: { levo: 18, prviRed: -18 } })], napraviSemu());
    const [p] = dokUPasuse(dok);
    p.uvlacenje.levo = 999;
    p.delovi[0].tekst = 'Y';
    expect(dokUPasuse(dok)).toEqual([sa({ uvlacenje: { levo: 18, prviRed: -18 } })]);
  });
});

describe('pm-sema', () => {
  it('uCss spaja svojstva stila', () => {
    expect(uCss({ color: '#000', 'font-size': 'calc(var(--u) * 18)' })).toBe('color: #000; font-size: calc(var(--u) * 18)');
    expect(uCss({})).toBe('');
  });

  it('mark stil u DOM-u je span.uz-pl-deo sa stilom dela (stilDela); pasus je p.uz-pl-pasus, prelom je br', () => {
    const sema = napraviSemu();
    const dok = pasusiUDok([delovi(deo('a', { podebljano: true }), deo('\n'), deo('b'))], sema);
    const div = document.createElement('div');
    div.appendChild(DOMSerializer.fromSchema(sema).serializeFragment(dok.content));
    const p = div.querySelector('p');
    expect(p?.className).toBe('uz-pl-pasus');
    const spanovi = Array.from(div.querySelectorAll<HTMLSpanElement>('span.uz-pl-deo'));
    expect(spanovi.length).toBe(2);
    expect(spanovi[0].textContent).toBe('a');
    expect(spanovi[0].style.fontWeight).toBe('700');
    expect(spanovi[0].getAttribute('style')).toContain('font-size: calc(var(--u) * 18)');
    expect(spanovi[1].querySelector('br')).not.toBeNull();
    expect(spanovi[1].style.fontWeight).toBe('400');
  });

  it('skala šeme (autofit okvira) umanjuje veličinu slova kao prikaz', () => {
    const sema = napraviSemu(0.5);
    const dok = pasusiUDok([pasus('a')], sema);
    const div = document.createElement('div');
    div.appendChild(DOMSerializer.fromSchema(sema).serializeFragment(dok.content));
    expect(div.querySelector('span')?.getAttribute('style')).toContain('font-size: calc(var(--u) * 9)');
  });
});

import type { Animacija, CrtezSloj, Deo, FormulaSloj, OblikSloj, Pasus, Platno, Sloj, TabelaSloj, TekstSloj } from './platno.models';
import { bajtovaPlatna, GRANICE, greskePlatna, prekoGranica, proveriKaoServer, zaokruziKaoServer } from './platno-provera';

const deo = (tekst: string): Deo => ({
  tekst, font: 'Carlito', velicina: 18, boja: '#000000', podebljano: false, kurziv: false, podvuceno: false, precrtano: false, polozaj: 'OBICAN',
});
const pasus = (tekst: string): Pasus => ({
  poravnanje: 'LEVO', nivo: 0, lista: null, uvlacenje: { levo: 0, prviRed: 0 }, razmakPre: 0, razmakPosle: 0, proredProcenat: 100,
  tabulatori: [], delovi: [deo(tekst)],
});
const osnova = (id: string) => ({ id, naziv: null, x: 0, y: 0, sirina: 100, visina: 50, rotacija: 0, providnost: 1, zakljucan: false, senka: null });
const tekst = (id: string, t: string): TekstSloj => ({
  ...osnova(id), tip: 'TEKST', pasusi: [pasus(t)], popuna: null, ivica: null,
  okvir: { unutraLevo: 7.2, unutraGore: 3.6, unutraDesno: 7.2, unutraDole: 3.6, sidro: 'VRH', prelom: true, skala: 1, skalaProreda: 1 },
});
const crtez = (id: string, tacaka: number): CrtezSloj => ({
  ...osnova(id), tip: 'CRTEZ', medijId: 'm', potezi: [{ boja: '#FF0000', debljina: 2.5, tacke: Array.from({ length: tacaka * 2 }, (_, i) => i % 97 + 0.25) }],
});
const platno = (slojevi: Sloj[], animacije: Animacija[] = []): Platno =>
  ({ verzija: 1, pozadina: { boja: '#FFFFFF', medijId: null }, slojevi, animacije });
const slojeviTeksta = (n: number) => Array.from({ length: n }, (_, i) => tekst(`s${i}`, 'a'));
const animacije = (n: number): Animacija[] => Array.from({ length: n }, (_, i) => ({
  id: `a${i}`, slojId: 's0', pasus: null, vrsta: 'ULAZ', efekat: 'FADE', smer: null, okidac: 'KLIK', trajanjeMs: 500, kasnjenjeMs: 0,
}));

describe('bajtovaPlatna', () => {
  it('računa UTF-8 bajtove, ne UTF-16 jedinice', () => {
    const a = bajtovaPlatna(platno([tekst('a', 'x')]));
    expect(bajtovaPlatna(platno([tekst('a', 'š')]))).toBe(a + 1);
    expect(bajtovaPlatna(platno([tekst('a', '😀')]))).toBe(a + 3);
  });

  it('ceo broj u Double polju je za 2 bajta duži (server piše 100.0), a Integer polje nije', () => {
    const a = bajtovaPlatna(platno([tekst('a', 'x')]));
    const p = platno([{ ...tekst('a', 'x'), sirina: 100.5 }]); // 100 -> 100.5: +0 (isti broj cifara + ".5" umesto ".0")
    expect(bajtovaPlatna(p)).toBe(a - 2 + 2);
    const sa = platno([{ ...tekst('a', 'x'), sirina: 100.25 }]);
    expect(bajtovaPlatna(sa)).toBe(a - 2 + 3); // celi 100 gubi ".0" (2), 100.25 ima ".25" (3)
  });

  it('zaokružuje kao server (iz decimalnog zapisa, od nule) pre merenja', () => {
    const duga = platno([{ ...tekst('a', 'x'), sirina: 100.123456789 }]);
    const kratka = platno([{ ...tekst('a', 'x'), sirina: 100.12 }]);
    expect(bajtovaPlatna(duga)).toBe(bajtovaPlatna(kratka));
  });

  it('ključ medija (gen:1, pptx:…) meri kao UUID od 36 znakova koji ga zamenjuje pri slanju (sva četiri mesta)', () => {
    const uuid = '0b1e5c2a-9d4f-4c55-8a6e-3f2d1c0b9a87';
    const sa = (k: string): Platno => ({
      verzija: 1, pozadina: { boja: '#FFFFFF', medijId: k },
      slojevi: [
        { ...osnova('a'), tip: 'SLIKA', medijId: k, isecak: { levo: 0, gore: 0, desno: 0, dole: 0 } },
        { ...crtez('b', 1), medijId: k },
        { ...osnova('c'), tip: 'FORMULA', latex: 'x', boja: '#000000', velicina: 20, poravnanje: 'LEVO', slikaIzvora: k } as FormulaSloj,
      ],
      animacije: [],
    });
    const meraUuid = bajtovaPlatna(sa(uuid));
    expect(bajtovaPlatna(sa('gen:1'))).toBe(meraUuid);
    expect(bajtovaPlatna(sa('pptx:ppt/media/image3.png'))).toBe(meraUuid);
    expect(bajtovaPlatna(sa('pptx:ppt/media/vrlo-dugacko-ime-slike-iz-prezentacije.jpeg'))).toBe(meraUuid);
  });

  it('proveriKaoServer odbija slajd koji je ispod 1 MB samo dok nosi kratke ključeve medija', () => {
    const uuid = '0b1e5c2a-9d4f-4c55-8a6e-3f2d1c0b9a87';
    // 300 crteža; veličinu daju tačke poteza (svaka tačka "1.5,1.5," = 8 bajtova, najviše 20 000 po crtežu)
    const sa = (k: string, tacaka: number): Platno => platno(Array.from({ length: 300 }, (_, i): Sloj => {
      const n = Math.max(0, Math.min(GRANICE.tacakaPoCrtezu, tacaka - i * GRANICE.tacakaPoCrtezu));
      return { ...crtez(`s${i}`, 0), medijId: k, potezi: [{ boja: '#FF0000', debljina: 2.5, tacke: new Array(n * 2).fill(1.5) }] };
    }));
    const osnovno = bajtovaPlatna(sa(uuid, 0));
    const d = sa('gen:1', Math.ceil((GRANICE.bajtova + 4000 - osnovno) / 8));
    const razlika = 300 * (36 - 'gen:1'.length);
    const kaoServer = bajtovaPlatna(sa(uuid, Math.ceil((GRANICE.bajtova + 4000 - osnovno) / 8)));
    expect(kaoServer).toBeGreaterThan(GRANICE.bajtova);
    expect(kaoServer - razlika).toBeLessThanOrEqual(GRANICE.bajtova); // sa ključevima kakvi jesu, dokument bi prošao
    expect(bajtovaPlatna(d)).toBe(kaoServer);
    expect(proveriKaoServer(d)).toBe('Dokument platna je prevelik (najviše 1 MB).');
  });
});

describe('bajtovaPlatna: tačan broj bajtova servera', () => {
  // Izmišljen dokument sa svim tipovima slojeva, zaokruživanjem (12,345 -> 12,35; 1,005 -> 1,01), celim Double poljima,
  // linijom bez krajeva, podrazumevanim smerom, POJAVI sa trajanjem i ključevima medija uvoza (gen:, pptx:).
  const DOKUMENT = {
  "verzija": 1,
  "pozadina": { "boja": "#FFFFFF", "medijId": "gen:1" },
  "slojevi": [
    {
      "id": "s1", "tip": "TEKST", "naziv": "Naslov čćž 😀", "x": 12.345, "y": 100, "sirina": 200.5, "visina": 50.125,
      "rotacija": 0, "providnost": 0.5, "zakljucan": false,
      "senka": { "boja": "#000000", "pomerajX": 1.005, "pomerajY": -2, "zamucenje": 4.4449 },
      "pasusi": [{
        "poravnanje": "LEVO", "nivo": 1,
        "lista": { "vrsta": "BROJ", "znak": null, "boja": "#1F4E79", "format": "ARAPSKI_TACKA", "pocetak": 3 },
        "uvlacenje": { "levo": 27, "prviRed": -13.5 }, "razmakPre": 0, "razmakPosle": 6.005, "proredProcenat": 90,
        "tabulatori": [{ "poz": 36, "poravnanje": "LEVO" }],
        "delovi": [
          { "tekst": "Izmišljen tekst ž 😀", "font": "Carlito", "velicina": 18, "boja": "#000000", "podebljano": true, "kurziv": false, "podvuceno": false, "precrtano": false, "polozaj": "OBICAN" },
          { "tekst": "2", "font": "Carlito", "velicina": 10.8, "boja": "#C00000", "podebljano": false, "kurziv": false, "podvuceno": false, "precrtano": false, "polozaj": "EKSPONENT" }
        ]
      }],
      "okvir": { "unutraLevo": 7.2, "unutraGore": 3.6, "unutraDesno": 7.2, "unutraDole": 3.6, "sidro": "VRH", "prelom": true, "skala": 1, "skalaProreda": 1 },
      "popuna": null, "ivica": { "boja": "#4472C4", "debljina": 0.75, "crtica": "PUNA" }
    },
    {
      "id": "s2", "tip": "OBLIK", "naziv": null, "x": 10, "y": 20, "sirina": 100, "visina": 3,
      "rotacija": 0, "providnost": 1, "zakljucan": false, "senka": null,
      "oblik": "STRELICA", "popuna": null, "ivica": { "boja": "#000000", "debljina": 2, "crtica": "ISPREKIDANA" }, "od": null, "do": null
    },
    {
      "id": "s3", "tip": "SLIKA", "naziv": "Slika 3", "x": 300, "y": 200, "sirina": 144, "visina": 72,
      "rotacija": 15.5, "providnost": 1, "zakljucan": false, "senka": null,
      "medijId": "pptx:ppt/media/image1.png", "isecak": { "levo": 0.1, "gore": 0, "desno": 0.25, "dole": 0 }
    },
    {
      "id": "s4", "tip": "FORMULA", "naziv": null, "x": 100, "y": 50, "sirina": 220, "visina": 100,
      "rotacija": 0, "providnost": 1, "zakljucan": false, "senka": null,
      "latex": "\\frac{a}{b}", "boja": "#000000", "velicina": 28, "poravnanje": "CENTAR", "slikaIzvora": "gen:2"
    },
    {
      "id": "s5", "tip": "TABELA", "naziv": "Tabela 5", "x": 50, "y": 300, "sirina": 200, "visina": 40,
      "rotacija": 0, "providnost": 1, "zakljucan": false, "senka": null,
      "kolone": [100, 100], "redovi": [40],
      "celije": [[
        { "pasusi": [], "popuna": "#E7E6E6", "ivice": { "gore": { "boja": "#FFFFFF", "debljina": 1, "crtica": "PUNA" }, "dole": null, "levo": null, "desno": null },
          "spojDesno": 1, "spojDole": 0, "pokrivena": false, "sidro": "SREDINA" },
        { "pasusi": [], "popuna": null, "ivice": { "gore": null, "dole": null, "levo": null, "desno": null },
          "spojDesno": 0, "spojDole": 0, "pokrivena": true, "sidro": "VRH" }
      ]]
    },
    {
      "id": "s6", "tip": "CRTEZ", "naziv": null, "x": 400, "y": 100, "sirina": 80, "visina": 40,
      "rotacija": 0, "providnost": 0.5, "zakljucan": false, "senka": null,
      "medijId": "gen:3", "potezi": [{ "boja": "#FF0000", "debljina": 2.5, "tacke": [0.1, 1, 2.25, 3, 10, 12.5] }]
    }
  ],
  "animacije": [
    { "id": "a1", "slojId": "s1", "pasus": 0, "vrsta": "ULAZ", "efekat": "ULET", "smer": null, "okidac": "KLIK", "trajanjeMs": 500, "kasnjenjeMs": 0 },
    { "id": "a2", "slojId": "s3", "pasus": null, "vrsta": "ULAZ", "efekat": "POJAVI", "smer": null, "okidac": "SA_PRETHODNIM", "trajanjeMs": 500, "kasnjenjeMs": 250 },
    { "id": "a3", "slojId": "s4", "pasus": null, "vrsta": "IZLAZ", "efekat": "PODELI", "smer": null, "okidac": "POSLE_PRETHODNOG", "trajanjeMs": 750, "kasnjenjeMs": 0 },
    { "id": "a4", "slojId": "s6", "pasus": null, "vrsta": "ULAZ", "efekat": "FADE", "smer": null, "okidac": "KLIK", "trajanjeMs": 10000, "kasnjenjeMs": 10000 }
  ]
} as Platno;

  it('3421 bajt, kao server', () => {
    // Broj je iz serverove serijalizacije: isti dokument (ključevi medija zamenjeni UUID-ima od 36 znakova) kroz
    // `PlatnoJson.procitaj` -> `PlatnoPP.normalizuj` -> `PlatnoPP.proveri` -> `PlatnoJson.velicinaBajtova` u GFSSystem-u.
    expect(proveriKaoServer(DOKUMENT)).toBeNull();
    expect(bajtovaPlatna(DOKUMENT)).toBe(3421);
  });
});

describe('zaokruziKaoServer (BigDecimal.valueOf(d).setScale(2, HALF_UP))', () => {
  it.each([
    [1.005, 1.01], [-0.125, -0.13], [2.675, 2.68], [0.995, 1], [1.115, 1.12], [-1.005, -1.01], [0.125, 0.13],
    [100, 100], [0.1, 0.1], [12.344999, 12.34], [-0.001, 0], [0.004, 0], [0.005, 0.01], [1234567.891, 1234567.89],
  ])('%s -> %s', (ulaz, izlaz) => {
    expect(zaokruziKaoServer(ulaz)).toBe(izlaz);
  });

  it('nikad -0', () => {
    expect(Object.is(zaokruziKaoServer(-0.001), 0)).toBe(true);
    expect(Object.is(zaokruziKaoServer(-0), 0)).toBe(true);
  });
});

describe('bajtovaPlatna: oblik koji server vidi', () => {
  const osnovniDokument = (): Platno => {
    const linija: OblikSloj = {
      ...osnova('l1'), x: 50, y: 400, sirina: 300, visina: 61, tip: 'OBLIK', oblik: 'STRELICA', popuna: null,
      ivica: { boja: '#333333', debljina: 1, crtica: 'PUNA' }, od: null, do: null,
    };
    const t = { ...tekst('t1', 'Prvi pasus'), naziv: 'Naslov', x: 40, y: 30, sirina: 880, visina: 120, pasusi: [pasus('Prvi pasus'), pasus('Drugi pasus')] };
    return platno([t, linija], [
      { id: 'a1', slojId: 't1', pasus: 0, vrsta: 'ULAZ', efekat: 'POJAVI', smer: null, okidac: 'KLIK', trajanjeMs: 500, kasnjenjeMs: 0 },
      { id: 'a3', slojId: 'l1', pasus: null, vrsta: 'ULAZ', efekat: 'ULET', smer: null, okidac: 'POSLE_PRETHODNOG', trajanjeMs: 500, kasnjenjeMs: 100 },
    ]);
  };

  it('linija bez od/do se meri sa krajevima (0, visina/2) i (sirina, visina/2)', () => {
    const p = osnovniDokument();
    const sa = osnovniDokument();
    (sa.slojevi[1] as OblikSloj).od = { x: 0, y: 30.5 };
    (sa.slojevi[1] as OblikSloj).do = { x: 300, y: 30.5 };
    expect(bajtovaPlatna(p)).toBe(bajtovaPlatna(sa));
  });

  it('smer koji nedostaje: ULET -> DOLE, PODELI -> VERTIKALNO, BRISANJE/ISCRTAJ -> LEVO', () => {
    const a = (efekat: Animacija['efekat'], smer: Animacija['smer']): Platno =>
      platno(slojeviTeksta(1), [{ ...animacije(1)[0], efekat, smer }]);
    expect(bajtovaPlatna(a('ULET', null))).toBe(bajtovaPlatna(a('ULET', 'DOLE')));
    expect(bajtovaPlatna(a('PODELI', null))).toBe(bajtovaPlatna(a('PODELI', 'VERTIKALNO')));
    expect(bajtovaPlatna(a('BRISANJE', null))).toBe(bajtovaPlatna(a('BRISANJE', 'LEVO')));
    expect(bajtovaPlatna(a('ISCRTAJ', null))).toBe(bajtovaPlatna(a('ISCRTAJ', 'LEVO')));
  });

  it('Integer polja (trajanjeMs, kasnjenjeMs, pasus) ne dobijaju ".0": animacija košta tačno koliko JSON.stringify; ceo Double je +2', () => {
    const an: Animacija = { id: 'a0', slojId: 'a', pasus: 0, vrsta: 'ULAZ', efekat: 'FADE', smer: null, okidac: 'KLIK', trajanjeMs: 500, kasnjenjeMs: 0 };
    const sloj = { ...tekst('a', 'x'), sirina: 100.5 };
    const bez = bajtovaPlatna(platno([sloj]));
    expect(bajtovaPlatna(platno([sloj], [an]))).toBe(bez + new TextEncoder().encode(JSON.stringify(an)).length);
    expect(bajtovaPlatna(platno([{ ...sloj, sirina: 100 }]))).toBe(bajtovaPlatna(platno([{ ...sloj, sirina: 100.5 }])));
  });

  it('naučni zapis Jacksona (|x| >= 1e7): 12345678.9 -> 1.23456789E7, 1e7 -> 1.0E7 (nedostižno za import, ali izmereno)', () => {
    const a = (sirina: number) => bajtovaPlatna(platno([{ ...tekst('a', 'x'), sirina }]));
    expect(a(12345678.9)).toBe(a(100.5) + '1.23456789E7'.length - '100.5'.length);
    expect(a(10000000)).toBe(a(100.5) + '1.0E7'.length - '100.5'.length);
  });

});

describe('proveriKaoServer (ogledalo PlatnoPP.proveri posle normalizuj)', () => {
  const formula = (id: string, latex: string): FormulaSloj => ({
    ...osnova(id), tip: 'FORMULA', latex, boja: '#000000', velicina: 18, poravnanje: 'LEVO', slikaIzvora: null,
  });
  const linija = (o: Partial<OblikSloj>): OblikSloj => ({
    ...osnova('s1'), tip: 'OBLIK', oblik: 'LINIJA', popuna: null, ivica: null, od: null, do: null, ...o,
  });
  const tabela = (spojDesno: number): TabelaSloj => ({
    ...osnova('s1'), tip: 'TABELA', kolone: [50, 50], redovi: [50],
    celije: [[0, 1].map((k) => ({
      pasusi: [], popuna: null, ivice: { gore: null, dole: null, levo: null, desno: null }, spojDesno: k === 0 ? spojDesno : 0,
      spojDole: 0, pokrivena: k === 1 && spojDesno === 1, sidro: 'VRH' as const,
    }))],
  });
  const animacija = (o: Partial<Animacija>): Animacija => ({ ...animacije(1)[0], slojId: 's0', ...o });

  it('ispravan dokument prolazi (i boje malim slovima: server ih prevodi u velika)', () => {
    expect(proveriKaoServer(platno([tekst('s0', 'a')], [animacija({ pasus: 0 })]))).toBeNull();
    expect(proveriKaoServer({ ...platno([]), pozadina: { boja: '#ffffff', medijId: null } })).toBeNull();
  });

  it.each<[string, Platno, string]>([
    ['id duži od 12 znakova', platno([tekst('s1234567890ab', 'a')]), 'Id sloja ili animacije nije ispravan.'],
    ['id sa nedozvoljenim znakom', platno([tekst('s 1', 'a')]), 'Id sloja ili animacije nije ispravan.'],
    ['isti id sloja i animacije', platno([tekst('a0', 'a')], [animacija({ slojId: 'a0' })]), 'Id-jevi slojeva i animacija moraju biti jedinstveni.'],
    ['font van kataloga', platno([{ ...tekst('s0', 'a'), pasusi: [{ ...pasus('a'), delovi: [{ ...deo('a'), font: 'Calibri' }] }] }]), 'Font nije podržan: Calibri.'],
    ['boja bez #', platno([{ ...tekst('s0', 'a'), popuna: 'FF0000' }]), 'Boja nije ispravna (#RRGGBB).'],
    ['x 1920,005 se zaokružuje na 1920,01', platno([{ ...tekst('s0', 'a'), x: 1920.005 }]), 'Položaj ili veličina sloja nije ispravna.'],
    ['visina 0,004 se zaokružuje na 0', platno([{ ...tekst('s0', 'a'), visina: 0.004 }]), 'Položaj ili veličina sloja nije ispravna.'],
    ['širina preko 2880', platno([{ ...tekst('s0', 'a'), sirina: 2880.01 }]), 'Položaj ili veličina sloja nije ispravna.'],
    ['animacija cilja nepostojeći sloj', platno([tekst('s0', 'a')], [animacija({ slojId: 's9' })]), 'Animacija cilja sloj koji ne postoji.'],
    ['animacija cilja nepostojeći pasus', platno([tekst('s0', 'a')], [animacija({ pasus: 1 })]), 'Animacija cilja pasus koji ne postoji.'],
    ['pasus na sloju koji nije TEKST', platno([formula('s0', 'x')], [animacija({ pasus: 0 })]), 'Animacija cilja pasus koji ne postoji.'],
    ['smer koji efekat ne prima', platno([tekst('s0', 'a')], [animacija({ efekat: 'PODELI', smer: 'LEVO' })]), 'Smer animacije nije ispravan.'],
    ['kašnjenje preko 10000 ms', platno([tekst('s0', 'a')], [animacija({ kasnjenjeMs: 10001 })]), 'Trajanje i kašnjenje animacije su od 0 do 10000 ms.'],
    ['prazna formula', platno([formula('s0', '')]), 'Formula nije ispravna.'],
    ['spajanje preko ivice tabele', platno([tabela(2)]), 'Tabela nije ispravna.'],
    ['linija sa krajem van ±2880', platno([linija({ do: { x: 2881, y: 0 } })]), 'Linija mora imati početak i kraj.'],
    ['crtež sa neparnim brojem koordinata', platno([{ ...crtez('s0', 1), potezi: [{ boja: '#000000', debljina: 1, tacke: [1, 2, 3] }] }]), 'Crtež nije ispravan.'],
    ['isečak slike 0,5 + 0,5', platno([{ ...osnova('s0'), tip: 'SLIKA', medijId: 'm', isecak: { levo: 0.495, gore: 0, desno: 0.5, dole: 0 } }]), 'Isečak slike nije ispravan.'],
    ['naziv sloja duži od 60 znakova (code point-i)', platno([{ ...tekst('s0', 'a'), naziv: '\u{1F600}'.repeat(61) }]), 'Naziv sloja može imati najviše 60 znakova.'],
    ['senka sa zamućenjem preko 100', platno([{ ...tekst('s0', 'a'), senka: { boja: '#000000', pomerajX: 2, pomerajY: 2, zamucenje: 100.01 } }]), 'Senka nije ispravna.'],
    ['okvir teksta sa skalom ispod 0,25', platno([{ ...tekst('s0', 'a'), okvir: { ...tekst('s0', 'a').okvir, skala: 0.24 } }]), 'Okvir teksta nije ispravan.'],
    ['pasus sa proredom ispod 50%', platno([{ ...tekst('s0', 'a'), pasusi: [{ ...pasus('a'), proredProcenat: 49.99 }] }]), 'Pasus nije ispravan.'],
    ['lista ZNAK bez znaka', platno([{ ...tekst('s0', 'a'), pasusi: [{ ...pasus('a'), lista: { vrsta: 'ZNAK', znak: '', boja: null, format: null, pocetak: null } }] }]), 'Lista nije ispravna.'],
    ['ivica tanja od 0,25', platno([{ ...tekst('s0', 'a'), ivica: { boja: '#000000', debljina: 0.24, crtica: 'PUNA' } }]), 'Debljina ivice mora biti od 0,25 do 20.'],
    ['providnost preko 1', platno([{ ...tekst('s0', 'a'), providnost: 1.01 }]), 'Rotacija ili providnost sloja nije ispravna.'],
    ['rotacija preko 360', platno([{ ...tekst('s0', 'a'), rotacija: 360.01 }]), 'Rotacija ili providnost sloja nije ispravna.'],
    ['veličina slova preko 400', platno([{ ...tekst('s0', 'a'), pasusi: [{ ...pasus('a'), delovi: [{ ...deo('a'), velicina: 400.01 }] }] }]), 'Veličina slova mora biti od 1 do 400.'],
    ['oblik bez vrste', platno([linija({ oblik: null as never })]), 'Oblik sloja nije ispravan.'],
    ['latex formule duži od 5000 znakova', platno([formula('s0', 'x'.repeat(5001))]), 'Formula nije ispravna.'],
  ])('%s', (_, p, poruka) => {
    expect(proveriKaoServer(p)).toBe(poruka);
  });

  it('granice ovih pravila prolaze: naziv od 60 znakova, latex od 5000, skala 0,25, ivica 0,25, providnost 1, rotacija -360', () => {
    expect(proveriKaoServer(platno([{ ...tekst('s0', 'a'), naziv: '\u{1F600}'.repeat(60), providnost: 1, rotacija: -360,
      ivica: { boja: '#000000', debljina: 0.25, crtica: 'PUNA' }, okvir: { ...tekst('s0', 'a').okvir, skala: 0.25 } }]))).toBeNull();
    expect(proveriKaoServer(platno([formula('s0', 'x'.repeat(5000))]))).toBeNull();
  });

  it('podrazumevani smer i trajanje POJAVI se ne odbijaju; tabela sa ispravnim spajanjem i linija bez krajeva prolaze', () => {
    expect(proveriKaoServer(platno([tekst('s0', 'a')], [animacija({ efekat: 'ULET', smer: null }), { ...animacija({ efekat: 'POJAVI' }), id: 'a1', trajanjeMs: 99999 }]))).toBeNull();
    expect(proveriKaoServer(platno([tabela(1)]))).toBeNull();
    expect(proveriKaoServer(platno([linija({})]))).toBeNull();
    expect(proveriKaoServer(platno([{ ...tekst('s0', 'a'), x: 1920.004, y: -960.004 }]))).toBeNull();   // zaokružuje se pre provere
  });

  it.each<[string, Platno, string]>([
    ['nivo pasusa nije ceo broj', platno([{ ...tekst('s0', 'a'), pasusi: [{ ...pasus('a'), nivo: 1.5 }] }]), 'slojevi[0].pasusi[0].nivo'],
    ['početak liste nije ceo broj', platno([{ ...tekst('s0', 'a'), pasusi: [{ ...pasus('a'), lista: { vrsta: 'BROJ', znak: null, boja: null, format: 'ARAPSKI', pocetak: 2.5 } }] }]), 'slojevi[0].pasusi[0].lista.pocetak'],
    ['trajanje animacije nije ceo broj', platno([tekst('s0', 'a')], [animacija({ trajanjeMs: 500.5 })]), 'animacije[0].trajanjeMs'],
    ['spajanje ćelije nije ceo broj', platno([{ ...tabela(0), celije: [[{ ...tabela(0).celije[0][0], spojDesno: 0.5 }, tabela(0).celije[0][1]]] }]), 'slojevi[0].celije[0][0].spojDesno'],
    ['nepoznato poravnanje', platno([{ ...tekst('s0', 'a'), pasusi: [{ ...pasus('a'), poravnanje: 'SREDINA' as never }] }]), 'slojevi[0].pasusi[0].poravnanje'],
    ['nepoznat položaj dela', platno([{ ...tekst('s0', 'a'), pasusi: [{ ...pasus('a'), delovi: [{ ...deo('a'), polozaj: 'GORE' as never }] }] }]), 'slojevi[0].pasusi[0].delovi[0].polozaj'],
    ['nepoznat efekat', platno([tekst('s0', 'a')], [animacija({ efekat: 'TREPNI' as never })]), 'animacije[0].efekat'],
    ['nepoznata vrsta oblika', platno([linija({ oblik: 'ZVEZDA' as never })]), 'slojevi[0].oblik'],
  ])('JSON sloj servera: %s -> pogrešan tip vrednosti', (_, p, putanja) => {
    expect(proveriKaoServer(p)).toBe(`Neispravan dokument platna: pogrešan tip vrednosti (${putanja}).`);
  });

  it('JSON sloj servera: nepoznat tip sloja', () => {
    expect(proveriKaoServer(platno([{ ...tekst('s0', 'a'), tip: 'VIDEO' as never }]))).toBe('Neispravan dokument platna: nepoznat tip sloja (slojevi[0]).');
  });

  it('beli znaci kao Java strip()/isBlank(): NBSP i U+FEFF ostaju (odbijeno), U+001F i razmak se skidaju', () => {
    const sa = (boja: string) => proveriKaoServer({ ...platno([]), pozadina: { boja, medijId: null } });
    expect(sa('\u00A0#FF0000')).toBe('Boja nije ispravna (#RRGGBB).');
    expect(sa('#FF0000\uFEFF')).toBe('Boja nije ispravna (#RRGGBB).');
    expect(sa(' #ff0000\u001F')).toBeNull();
    const slika = (medijId: string) => proveriKaoServer(platno([{ ...osnova('s0'), tip: 'SLIKA', medijId, isecak: { levo: 0, gore: 0, desno: 0, dole: 0 } }]));
    expect(slika('\u00A0')).toBeNull();   // Java isBlank: NBSP nije beli znak
    expect(slika(' \t')).toBe('Sloj slike mora imati sliku.');
  });

  it('dokument veći od 1 MB', () => {
    const p = platno(Array.from({ length: 5 }, (_, i) => crtez(`s${i}`, 19_999)));
    expect(bajtovaPlatna(p)).toBeGreaterThan(GRANICE.bajtova);
    expect(proveriKaoServer(p)).toBe('Dokument platna je prevelik (najviše 1 MB).');
  });
});

describe('prekoGranica (samo brojevi, za svaku radnju editora)', () => {
  const formula = (id: string, latex: string): FormulaSloj => ({
    ...osnova(id), tip: 'FORMULA', latex, boja: '#000000', velicina: 18, poravnanje: 'LEVO', slikaIzvora: null,
  });

  it('300 slojeva prolazi, 301 ne', () => {
    expect(prekoGranica(platno(slojeviTeksta(300)))).toBeNull();
    expect(prekoGranica(platno(slojeviTeksta(301)))).toBe('Slajd može imati najviše 300 slojeva.');
  });

  it('400 animacija prolazi, 401 ne', () => {
    expect(prekoGranica(platno(slojeviTeksta(1), animacije(400)))).toBeNull();
    expect(prekoGranica(platno(slojeviTeksta(1), animacije(401)))).toBe('Slajd može imati najviše 400 animacija.');
  });

  it('50 000 znakova prolazi, 50 001 ne (TEKST sloj sa jednim delom i latex formule)', () => {
    expect(prekoGranica(platno([tekst('s0', 'x'.repeat(50_000))]))).toBeNull();
    expect(prekoGranica(platno([tekst('s0', 'x'.repeat(50_001))]))).toBe('Slajd može imati najviše 50000 znakova teksta.');
    expect(prekoGranica(platno([formula('s0', 'x'.repeat(50_001))]))).toBe('Slajd može imati najviše 50000 znakova teksta.');
  });

  it('ne serijalizuje dokument (JSON.stringify se ne zove)', () => {
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      prekoGranica(platno(slojeviTeksta(10), animacije(3)));
      expect(stringify).not.toHaveBeenCalled();
    } finally {
      stringify.mockRestore();
    }
  });
});

describe('greskePlatna (proveriKaoServer sa kešom po objektu)', () => {
  it('vraća isto što i proveriKaoServer', () => {
    const ispravan = platno([tekst('s0', 'a')]);
    const neispravan = { ...platno([]), pozadina: { boja: '#ggg', medijId: null } };
    expect(greskePlatna(ispravan)).toBe(proveriKaoServer(ispravan));
    expect(greskePlatna(ispravan)).toBeNull();
    expect(greskePlatna(neispravan)).toBe(proveriKaoServer(neispravan));
    expect(greskePlatna(neispravan)).toBe('Boja nije ispravna (#RRGGBB).');
  });

  it('za isti objekat drugi put ne proverava ponovo (jedna serijalizacija za dva poziva), za nov objekat proverava', () => {
    const p = platno([tekst('s0', 'kes')]);
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      expect(greskePlatna(p)).toBeNull();
      expect(greskePlatna(p)).toBeNull();
      expect(stringify).toHaveBeenCalledTimes(1);
      greskePlatna({ ...p });
      expect(stringify).toHaveBeenCalledTimes(2);
    } finally {
      stringify.mockRestore();
    }
  });
});

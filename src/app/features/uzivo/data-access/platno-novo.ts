// Fabrike novih slojeva i novog PLATNO dokumenta (editor platna, "Nov slajd > Platno"). Novi slojevi uzimaju fontove i
// boje teme prezentacije, razrešene u eksplicitne vrednosti (model nosi boje i fontove, kao i uvoz), i uvek prolaze
// proveru servera (`proveriKaoServer`). Čiste funkcije bez Angular-a i bez biblioteka.
import type {
  Celija, Crtica, Deo, FormulaSloj, OblikSloj, Okvir, Pasus, Platno, SlikaSloj, TabelaSloj, Tacka, Tema, TekstSloj, VrstaOblika,
} from './platno.models';
import { TEME } from '../ui/teme';
import { zaokruziKaoServer as z } from './platno-provera';

export type RasporedNovogPlatna = 'PRAZNO' | 'NASLOV_I_TEKST';
export type UlogaTeksta = 'naslov' | 'telo';
export const OKVIR_NOVOG: Okvir = {
  unutraLevo: 7.2, unutraGore: 3.6, unutraDesno: 7.2, unutraDole: 3.6, sidro: 'VRH', prelom: true, skala: 1, skalaProreda: 1,
};
export const ZNAK_LISTE = '•';
const LINIJSKI: ReadonlySet<VrstaOblika> = new Set(['LINIJA', 'STRELICA', 'DVOSTRUKA_STRELICA']);

/** Deo teksta u fontu i boji teme: naslov uzima font i boju naslova, telo font i boju teksta. */
export function deoTeme(tema: Tema, uloga: UlogaTeksta, velicina: number, tekst = ''): Deo {
  const t = TEME[tema];
  return {
    tekst, font: uloga === 'naslov' ? t.fontNaslova : t.fontTela, velicina, boja: uloga === 'naslov' ? t.naslov : t.tekst,
    podebljano: false, kurziv: false, podvuceno: false, precrtano: false, polozaj: 'OBICAN',
  };
}

/** Pasus sa jednim delom i podrazumevanim atributima (levo, bez liste, prored 100 %), uz date izmene. */
export function pasusSa(deo: Deo, izmene: Partial<Omit<Pasus, 'delovi'>> = {}): Pasus {
  return {
    poravnanje: 'LEVO', nivo: 0, lista: null, uvlacenje: { levo: 0, prviRed: 0 }, razmakPre: 0, razmakPosle: 0,
    proredProcenat: 100, tabulatori: [], ...izmene, delovi: [deo],
  };
}

/** Gornji levi ugao kutije date veličine centrirane na platnu 960 x 540. */
export function uSredini(sirina: number, visina: number): { x: number; y: number } {
  return { x: z((960 - sirina) / 2), y: z((540 - visina) / 2) };
}

const osnova = (id: string, x: number, y: number, sirina: number, visina: number) => ({
  id, naziv: null, x: z(x), y: z(y), sirina: z(sirina), visina: z(visina), rotacija: 0, providnost: 1, zakljucan: false, senka: null,
});

/** Prazan tekst (jedan prazan pasus sa jednim praznim delom: nosi font i veličinu praznog reda, odluka 9 faze 1). */
export function noviTekst(id: string, tema: Tema, k: { x: number; y: number; sirina: number; visina: number },
                          uloga: UlogaTeksta = 'telo', velicina = 24): TekstSloj {
  return {
    ...osnova(id, k.x, k.y, k.sirina, k.visina), tip: 'TEKST', pasusi: [pasusSa(deoTeme(tema, uloga, velicina))],
    okvir: { ...OKVIR_NOVOG, sidro: uloga === 'naslov' ? 'SREDINA' : 'VRH' }, popuna: null, ivica: null,
  };
}

/** Oblik u centru platna, boje prvog akcenta teme; linije (bez popune) imaju krajeve na sredini visine. */
export function noviOblik(id: string, tema: Tema, vrsta: VrstaOblika, crtica: Crtica = 'PUNA'): OblikSloj {
  const akcent = TEME[tema].akcenti[0];
  if (LINIJSKI.has(vrsta)) {
    const { x, y } = uSredini(240, 24);
    return {
      ...osnova(id, x, y, 240, 24), tip: 'OBLIK', oblik: vrsta, popuna: null,
      ivica: { boja: akcent, debljina: 3, crtica }, od: { x: 0, y: 12 }, do: { x: 240, y: 12 },
    };
  }
  const { x, y } = uSredini(200, 120);
  return {
    ...osnova(id, x, y, 200, 120), tip: 'OBLIK', oblik: vrsta, popuna: akcent,
    ivica: { boja: akcent, debljina: 1, crtica }, od: null, do: null,
  };
}

/** Krug: ELIPSA 140 x 140 u centru platna. */
export function noviKrug(id: string, tema: Tema): OblikSloj {
  const { x, y } = uSredini(140, 140);
  return { ...noviOblik(id, tema, 'ELIPSA'), x, y, sirina: 140, visina: 140 };
}

/** Slika staje u 480 x 270 (manja ostaje u prirodnoj veličini, 1 px = 1 jedinica), centrirana na `centar` ili na platno. */
export function novaSlika(id: string, medijId: string, prirodnaSirina: number, prirodnaVisina: number, centar?: Tacka): SlikaSloj {
  const w0 = Math.max(1, prirodnaSirina);
  const h0 = Math.max(1, prirodnaVisina);
  const f = Math.min(1, 480 / w0, 270 / h0);
  const sirina = Math.max(1, z(w0 * f));
  const visina = Math.max(1, z(h0 * f));
  const c = centar ?? { x: 480, y: 270 };
  const x = Math.min(1920, Math.max(-960, c.x - sirina / 2));
  const y = Math.min(1920, Math.max(-960, c.y - visina / 2));
  return { ...osnova(id, x, y, sirina, visina), tip: 'SLIKA', medijId, isecak: { levo: 0, gore: 0, desno: 0, dole: 0 } };
}

/** Tabela iz teme: zaglavlje (popuna i podebljan tekst), neparni redovi podataka u traci, ivice boje pozadine od 1 pt. */
export function novaTabela(id: string, tema: Tema, redova: number, kolona: number): TabelaSloj {
  const t = TEME[tema];
  const sirinaKolone = z(640 / kolona);
  // poslednja kolona uzima ostatak, pa je zbir tačno 640 i posle zaokruživanja
  const kolone = Array.from({ length: kolona }, (_, k) => (k === kolona - 1 ? z(640 - sirinaKolone * (kolona - 1)) : sirinaKolone));
  const redovi = Array.from({ length: redova }, () => 40);
  const ivica = { boja: t.pozadina, debljina: 1, crtica: 'PUNA' as const };
  const celija = (r: number): Celija => {
    const zaglavlje = r === 0;
    const deo = { ...deoTeme(tema, 'telo', 18), boja: zaglavlje ? t.tabelaZaglavljeTekst : t.tekst, podebljano: zaglavlje };
    return {
      pasusi: [pasusSa(deo)], popuna: zaglavlje ? t.tabelaZaglavlje : r % 2 === 1 ? t.tabelaTraka : null,
      ivice: { gore: ivica, dole: ivica, levo: ivica, desno: ivica }, spojDesno: 0, spojDole: 0, pokrivena: false, sidro: 'SREDINA',
    };
  };
  const { x, y } = uSredini(640, 40 * redova);
  return {
    ...osnova(id, x, y, 640, 40 * redova), tip: 'TABELA', kolone, redovi,
    celije: Array.from({ length: redova }, (_, r) => Array.from({ length: kolona }, () => celija(r))),
  };
}

/** Formula u boji teksta teme, 28 pt, centrirana, bez slike izvora. */
export function novaFormula(id: string, tema: Tema, latex: string): FormulaSloj {
  const { x, y } = uSredini(320, 80);
  return {
    ...osnova(id, x, y, 320, 80), tip: 'FORMULA', latex, boja: TEME[tema].tekst, velicina: 28, poravnanje: 'CENTAR',
    slikaIzvora: null,
  };
}

/** Nov PLATNO slajd: pozadina teme; "Naslov i tekst" = naslov (40 pt, font i boja naslova) i telo sa listom (28 pt). */
export function novoPlatno(tema: Tema, raspored: RasporedNovogPlatna): Platno {
  const p: Platno = { verzija: 1, pozadina: { boja: TEME[tema].pozadina, medijId: null }, slojevi: [], animacije: [] };
  if (raspored === 'PRAZNO') return p;
  const naslov = noviTekst('s1', tema, { x: 48, y: 28, sirina: 864, visina: 92 }, 'naslov', 40);
  const telo = noviTekst('s2', tema, { x: 48, y: 140, sirina: 864, visina: 360 }, 'telo', 28);
  telo.pasusi = [pasusSa(deoTeme(tema, 'telo', 28), {
    lista: { vrsta: 'ZNAK', znak: ZNAK_LISTE, boja: null, format: null, pocetak: null },
    uvlacenje: { levo: 18, prviRed: -18 }, razmakPre: 10,
  })];
  return { ...p, slojevi: [naslov, telo] };
}

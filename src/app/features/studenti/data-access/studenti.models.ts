import type {
  GrupaStudentInfo,
  StudentPregledAktivnostInfo,
  StudentPregledDetails,
  StudentPregledDomaciInfo,
  StudentPregledTestInfo,
  StudentiPretraga,
} from '../../../core/api/studenti.api';
import { parseDatum } from '../../../shared/util/datum.pipe';
import { ListQuery } from '../../../shared/store/list-params';
import { brojStudenataTekst } from '../../../shared/util/mnozina';
import type { NazivIkone } from '../../../core/layout/icons';
import type { TipAktivnosti } from '../../../core/api/predavanja.models';

/** Filteri liste studenata; ime filtera je ime query parametra. `stariji` je id grupe (`starijiOdGrupe`). */
export interface StudentiFilteri extends Record<string, string | number | boolean | null> {
  grupa: number | null;
  q: string | null;
  stariji: number | null;
}

/** Polja sorta koja backend prihvata za `studenti/pretraga` (`StudentService.SORT_POLJA`). */
export const STUDENTI_SORT_POLJA = ['prezime', 'ime', 'indeks', 'godina'];

/** Upit liste u parametre `GET studenti/pretraga`: `grupa` -> `grupaId`, `stariji` -> `starijiOdGrupe`, strana je 0-based. */
export function pretragaZaUpit(q: ListQuery<StudentiFilteri>): StudentiPretraga {
  return {
    grupaId: q.filteri.grupa,
    starijiOdGrupe: q.filteri.stariji,
    q: q.filteri.q,
    page: q.strana - 1,
    size: q.velicina,
    sort: q.sort,
  };
}

export { brojStudenataTekst };

/** `Ana Radić`; student bez imena i prezimena je `—`. */
export function punoIme(s: { ime?: string | null; prezime?: string | null }): string {
  return [s.ime, s.prezime].map(d => d?.trim()).filter(Boolean).join(' ') || '—';
}

/** Broj sa zarezom i najviše `decimale` decimala (`72,6`, `7`); neispravan ili nedostajući broj je `—`. */
export function formatBroj(n: number | null | undefined, decimale = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) {
    return '—';
  }
  return String(Math.round(n * 10 ** decimale) / 10 ** decimale).replace('.', ',');
}

/** `mailto:` link; student bez emaila (ili sa praznim) nema link (`null`), pa se prikazuje `—`. */
export function mailtoHref(email: string | null | undefined): string | null {
  const e = email?.trim();
  return e ? `mailto:${e}` : null;
}

/** `tel:` link bez razmaka, crtica i zagrada; bez ijedne cifre nema linka (`null`). */
export function telHref(telefon: string | null | undefined): string | null {
  const t = telefon?.trim();
  if (!t || !/\d/.test(t)) {
    return null;
  }
  return `tel:${t.replace(/[^\d+]/g, '')}`;
}

// ---- Hronologija (S3) ----

export type TipStavke = 'aktivnost' | 'domaci' | 'test';

/** Stavka hronologije: jedna aktivnost, jedan urađeni domaći ili jedno polaganje. `link` vodi na predavanje, domaći ili test. */
export interface StavkaHronologije {
  kljuc: string;
  tip: TipStavke;
  oznaka: string;
  ikona: NazivIkone;
  datum: string | null;
  naslov: string;
  detalj: string;
  link: (string | number)[] | null;
  /** Id stavke na serveru, za stabilan redosled istog dana. */
  redni: number;
}

const TIP_AKTIVNOSTI: Record<TipAktivnosti, string> = {
  PRISUSTVO: 'Prisustvo',
  ZADATAK: 'Zadatak',
  SA_ZVEZDICOM: 'Zvezdica',
};

/** Najviše bodova za domaći (isto kao u evidentiranju domaćeg). */
const MAX_BODOVA_DOMACI = 10;

const spoji = (...delovi: (string | null | undefined | false)[]): string => delovi.filter(Boolean).join(' · ');

export function tipAktivnostiTekst(tip: TipAktivnosti | null | undefined): string {
  return (tip && TIP_AKTIVNOSTI[tip]) || TIP_AKTIVNOSTI.PRISUSTVO;
}

function izAktivnosti(a: StudentPregledAktivnostInfo): StavkaHronologije {
  return {
    kljuc: `a${a.id}`,
    tip: 'aktivnost',
    oznaka: 'Predavanje',
    ikona: 'co_present',
    datum: a.datum,
    naslov: a.tema?.trim() || 'Predavanje bez teme',
    detalj: spoji(tipAktivnostiTekst(a.tip), a.napomene?.trim()),
    link: a.predavanjeId ? ['/predavanja', a.predavanjeId] : null,
    redni: a.id,
  };
}

function izDomaceg(d: StudentPregledDomaciInfo): StavkaHronologije {
  const bodovi = d.oslobodjen ? 'Oslobođen' : d.bodovi === null ? 'Bez bodova' : `${formatBroj(d.bodovi)} / ${MAX_BODOVA_DOMACI} bodova`;
  return {
    kljuc: `d${d.id}`,
    tip: 'domaci',
    oznaka: 'Domaći',
    ikona: 'assignment',
    datum: d.datum,
    naslov: d.naslov?.trim() || 'Domaći bez naslova',
    detalj: spoji(bodovi, d.prepisivanje && 'prepisivao', d.napomene?.trim()),
    link: d.domaciId ? ['/domaci', d.domaciId] : null,
    redni: d.id,
  };
}

/** Prolaz polaganja u pregledu studenta. */
export type ProlazPolaganja = 'bez-praga' | 'nije-upisano' | 'polozio' | 'pao';

/**
 * Prolaz iz odgovora servera (`pragProlaza`, `polozeno`; pravilo prolaza je samo na serveru, front ga ne ponavlja): test
 * bez praga nema prolaznost; prag bez upisanih poena je "nije upisano", nikad "pao". `null` samo za nedosledan odgovor.
 */
export function prolazPolaganja(p: Pick<StudentPregledTestInfo, 'pragProlaza' | 'polozeno' | 'ostvareniPoeni'>): ProlazPolaganja | null {
  if (p.pragProlaza === null) return 'bez-praga';
  if (p.ostvareniPoeni === null) return 'nije-upisano';
  return p.polozeno === true ? 'polozio' : p.polozeno === false ? 'pao' : null;
}

/** Kolona "Položio" u tabeli polaganja. */
export function polozioKolona(p: StudentPregledTestInfo): string {
  const prolaz = prolazPolaganja(p);
  return prolaz === 'polozio' ? 'Da' : prolaz === 'pao' ? 'Ne' : prolaz === 'nije-upisano' ? 'nije upisano' : '—';
}

/** Reč o prolazu uz poene (`položio`, `nije položio`); bez praga i bez poena ništa (poeni već kažu "Bez poena"). */
export function prolazTekst(p: StudentPregledTestInfo): string | null {
  const prolaz = prolazPolaganja(p);
  return prolaz === 'polozio' ? 'položio' : prolaz === 'pao' ? 'nije položio' : null;
}

/** Rezultat polaganja za prikaz: `45,5 poena · položio` ili `Bez poena`. */
export function rezultatPolaganja(p: StudentPregledTestInfo): string {
  const poeni = p.ostvareniPoeni === null ? 'Bez poena' : `${formatBroj(p.ostvareniPoeni)} poena`;
  return spoji(poeni, prolazTekst(p), p.prepisivao && 'prepisivao');
}

function izPolaganja(p: StudentPregledTestInfo): StavkaHronologije {
  return {
    kljuc: `t${p.id}`,
    tip: 'test',
    oznaka: 'Test',
    ikona: 'description',
    datum: p.datum,
    naslov: p.tipTesta?.naziv?.trim() || 'Test',
    detalj: spoji(rezultatPolaganja(p), p.napomene?.trim()),
    link: p.testId ? ['/testovi', p.testId] : null,
    redni: p.id,
  };
}

const vreme = (datum: string | null): number => parseDatum(datum)?.getTime() ?? Number.NEGATIVE_INFINITY;
const REDOSLED_TIPA: Record<TipStavke, number> = { test: 0, domaci: 1, aktivnost: 2 };

/**
 * Hronologija studenta (S3): aktivnosti na predavanjima, urađeni domaći i polaganja u jednoj listi, najnovije prvo.
 * Stavke bez ispravnog datuma idu na kraj. Isti dan: test, pa domaći, pa aktivnost, pa veći id prvi, da redosled
 * ne zavisi od redosleda koji server vrati (polaganja stižu iz skupa bez redosleda).
 */
export function hronologija(d: Pick<StudentPregledDetails, 'aktivnosti' | 'uradjeniDomaci' | 'polaganja'>): StavkaHronologije[] {
  return [
    ...(d.aktivnosti ?? []).map(izAktivnosti),
    ...(d.uradjeniDomaci ?? []).map(izDomaceg),
    ...(d.polaganja ?? []).map(izPolaganja),
  ].sort(
    (a, b) =>
      vreme(b.datum) - vreme(a.datum) ||
      REDOSLED_TIPA[a.tip] - REDOSLED_TIPA[b.tip] ||
      b.redni - a.redni,
  );
}

/** Polaganja, najnovije prvo, istog dana veći id prvi (redosled sa servera nije određen). */
export function sortirajPolaganja(polaganja: readonly StudentPregledTestInfo[]): StudentPregledTestInfo[] {
  return [...polaganja].sort((a, b) => vreme(b.datum) - vreme(a.datum) || b.id - a.id);
}

/** Aktivnosti ili domaći, najnovije prvo, istog dana veći id prvi. */
export function sortirajPoDatumu<T extends { id: number; datum: string | null }>(stavke: readonly T[]): T[] {
  return [...stavke].sort((a, b) => vreme(b.datum) - vreme(a.datum) || b.id - a.id);
}

// ---- Prethodni / sledeći u grupi (S5) ----

/** Broj na kraju indeksa (`GD12` -> 12), kao `Utility.index2int` na serveru; bez broja ide na kraj. */
export function brojIzIndeksa(indeks: string | null | undefined): number {
  const m = /(\d+)$/.exec(indeks?.trim() ?? '');
  const n = m ? Number(m[1]) : Number.NaN;
  return Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
}

/** Redosled studenata grupe: po broju iz indeksa, pa po indeksu, pa po id-u. */
export function redosledStudenata<T extends Pick<GrupaStudentInfo, 'id' | 'indeks'>>(studenti: readonly T[]): T[] {
  return [...studenti].sort(
    (a, b) =>
      brojIzIndeksa(a.indeks) - brojIzIndeksa(b.indeks) ||
      (a.indeks ?? '').localeCompare(b.indeks ?? '') ||
      a.id - b.id,
  );
}

export interface SusediUGrupi {
  /** `null` na početku liste: dugme je onemogućeno. */
  prethodni: number | null;
  /** `null` na kraju liste: dugme je onemogućeno. */
  sledeci: number | null;
  /** 1-based mesto u grupi; `null` kad studenta nema u grupi. */
  mesto: number | null;
  ukupno: number;
}

/** Prethodni i sledeći student u redosledu grupe; na krajevima (i van grupe) je odgovarajući `null`. */
export function susedi(redosled: readonly { id: number }[], id: number): SusediUGrupi {
  const i = redosled.findIndex(s => s.id === id);
  if (i < 0) {
    return { prethodni: null, sledeci: null, mesto: null, ukupno: redosled.length };
  }
  return {
    prethodni: i > 0 ? redosled[i - 1].id : null,
    sledeci: i < redosled.length - 1 ? redosled[i + 1].id : null,
    mesto: i + 1,
    ukupno: redosled.length,
  };
}

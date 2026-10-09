import type { StubacHistograma } from '../../../shared/ui/histogram';

/** Student u redu predloga; ogleda backend `dto/student/StudentInfo` (deo koji ocene prikazuju). */
export interface OceneStudentInfo {
  id: number;
  ime: string | null;
  prezime: string | null;
  indeks: string | null;
  /** Godina upisa; `int` na serveru, pa student bez nje stiže kao `0`. */
  godina: number | null;
}

/** Ogleda `TipTestaInfo` (u predlogu ocena). */
export interface OceneTipTesta {
  id: number;
  naziv: string | null;
  aktivan?: boolean | null;
}

/** Ogleda `KoeficijentTipTestaInfo`: `maxPoena` je broj poena na koji se tip normalizuje; `null` = originalni poeni. */
export interface KoeficijentTipTestaInfo {
  tipTestaId: number;
  tipTestaNaziv: string | null;
  maxPoena: number | null;
}

/**
 * Ogleda `KoeficijentiInfo` (`GET ocenjivanje/predmet/{id}/koeficijenti`). Server pravi podrazumevane koeficijente kad
 * predmet još nema svoje. `koeficijentiTipova` su sačuvani redovi (i za tipove koji su u međuvremenu isključeni) plus
 * aktivni tipovi bez reda (`maxPoena: null`). `maxAktivnost` / `maxDomaci` `null` = bez normalizacije.
 */
export interface KoeficijentiInfo {
  id: number | null;
  predmetId: number;
  koefPrisustvo: number | null;
  koefZadatak: number | null;
  koefZvezdica: number | null;
  domaciFlat: number | null;
  domaciVarijansa: number | null;
  koristiMaxRezultat: boolean | null;
  prikaziZbirno: boolean | null;
  maxAktivnost: number | null;
  maxDomaci: number | null;
  koeficijentiTipova: KoeficijentTipTestaInfo[] | null;
}

/** Ogleda `KoeficijentTipTestaCmd`. */
export interface KoeficijentTipTestaCmd {
  tipTestaId: number;
  maxPoena: number | null;
}

/**
 * Ogleda `SaveKoeficijentiCmd` (`POST ocenjivanje/predmet/{id}/koeficijenti`). Tipovi kojih nema u listi gube svoj
 * sačuvani `maxPoena`, zato forma uvek šalje sve tipove.
 */
export interface SaveKoeficijentiCmd {
  koefPrisustvo: number;
  koefZadatak: number;
  koefZvezdica: number;
  domaciFlat: number;
  domaciVarijansa: number;
  koristiMaxRezultat: boolean;
  prikaziZbirno: boolean;
  maxAktivnost: number | null;
  maxDomaci: number | null;
  koeficijentiTipova: KoeficijentTipTestaCmd[];
}

/** Podrazumevane vrednosti (iste kao entitet `KoeficijentiOcenjivanja` i `SaveKoeficijentiCmd` na serveru). */
export const PODRAZUMEVANI_KOEFICIJENTI: SaveKoeficijentiCmd = {
  koefPrisustvo: 1,
  koefZadatak: 2,
  koefZvezdica: 4,
  domaciFlat: 4,
  domaciVarijansa: 6,
  koristiMaxRezultat: true,
  prikaziZbirno: false,
  maxAktivnost: null,
  maxDomaci: null,
  koeficijentiTipova: [],
};

/** Ogleda `MaxPoeniStudentaNaTestuInfo`: najbolji ili poslednji rezultat po tipu (već normalizovan na serveru). */
export interface PoeniPoTipu {
  tipTesta: OceneTipTesta | null;
  ostvarenoPoena: number | null;
}

/**
 * Ogleda `RezultatiStudentaInfo` (`POST ocenjivanje/predmet/{id}/rezultati`). Sve računa server (`OcenjivanjeService`,
 * pragovi u `OcenaPragovi`); front samo prikazuje. `predlogOcene` `null` = nije položio.
 */
export interface RezultatiStudentaInfo {
  studentInfo: OceneStudentInfo | null;
  rezultati: PoeniPoTipu[] | null;
  poeniDomaci: number | null;
  poeniAktivnost: number | null;
  poeniPredispitne: number | null;
  ukupno: number | null;
  predlogOcene: number | null;
}

// ---------------------------------------------------------------------------------------------- pravila prikaza

export const NIJE_POLOZIO = 'nije položio';

/**
 * Kategorije histograma (H2): ocene 5-10, gde je 5 "nije položio" (server tada šalje `null`). Kratke labele staju i u
 * usku kolonu na telefonu; ekran ispod grafikona piše "5 = nije položio".
 */
export const KATEGORIJE_OCENA: readonly string[] = ['5', '6', '7', '8', '9', '10'];

/**
 * Raspodela predloga ocena za histogram. `null` (nije položio; i 5, ako bi je server ikad vratio) ide u kategoriju 5;
 * ocene 6-10 svaka u svoju; neočekivana vrednost (ispod 5, preko 10, necela) se ne broji.
 */
export function raspodelaOcena(redovi: readonly Pick<RezultatiStudentaInfo, 'predlogOcene'>[]): StubacHistograma[] {
  const brojevi = new Map<string, number>(KATEGORIJE_OCENA.map(k => [k, 0]));
  for (const r of redovi) {
    const o = r?.predlogOcene;
    const kljuc = o === null || o === undefined || o === 5 ? '5' : Number.isInteger(o) && o >= 6 && o <= 10 ? String(o) : null;
    if (kljuc !== null) {
      brojevi.set(kljuc, (brojevi.get(kljuc) ?? 0) + 1);
    }
  }
  return KATEGORIJE_OCENA.map(labela => ({ labela, broj: brojevi.get(labela) ?? 0 }));
}

/** Ocena za prikaz: `8` ili `nije položio`. */
export function ocenaTekst(o: number | null | undefined): string {
  return typeof o === 'number' && o >= 6 ? String(o) : NIJE_POLOZIO;
}

export type SmerSorta = 'asc' | 'desc';

/** Broj za poređenje: nedostaje ili nije konačan -> najmanje. */
function ukupnoZaSort(r: Pick<RezultatiStudentaInfo, 'ukupno'>): number {
  return typeof r?.ukupno === 'number' && Number.isFinite(r.ukupno) ? r.ukupno : Number.NEGATIVE_INFINITY;
}

/** Po ukupnom broju poena (podrazumevano od najvećeg), pa po prezimenu i imenu; ne menja ulaz. */
export function sortirajPoUkupnom(redovi: readonly RezultatiStudentaInfo[], smer: SmerSorta = 'desc'): RezultatiStudentaInfo[] {
  const ime = (r: RezultatiStudentaInfo) => `${r.studentInfo?.prezime ?? ''} ${r.studentInfo?.ime ?? ''}`.trim();
  return [...redovi].sort((a, b) => {
    const razlika = ukupnoZaSort(a) - ukupnoZaSort(b);
    if (razlika !== 0 && !Number.isNaN(razlika)) {
      return smer === 'asc' ? razlika : -razlika;
    }
    return ime(a).localeCompare(ime(b), 'sr');
  });
}

export interface KolonaTipa {
  id: number;
  naziv: string;
}

/**
 * Kolone tipova testa u tabeli predloga: tipovi koje server računa (u `rezultati`, aktivni tipovi), redom kao u
 * koeficijentima, pa ostali. Bez studenata kolone su tipovi iz koeficijenata. Tip bez naziva je `Tip <id>`.
 */
export function koloneTipova(koef: Pick<KoeficijentiInfo, 'koeficijentiTipova'> | null | undefined, redovi: readonly RezultatiStudentaInfo[]): KolonaTipa[] {
  const nazivi = new Map<number, string>();
  const izRezultata: number[] = [];
  for (const r of redovi) {
    for (const p of r?.rezultati ?? []) {
      const id = p?.tipTesta?.id;
      if (typeof id === 'number' && !nazivi.has(id)) {
        nazivi.set(id, p.tipTesta?.naziv?.trim() || `Tip ${id}`);
        izRezultata.push(id);
      }
    }
  }
  const koefTipovi = (koef?.koeficijentiTipova ?? []).filter(k => typeof k?.tipTestaId === 'number');
  const redosled = redovi.length === 0 ? koefTipovi.map(k => k.tipTestaId) : koefTipovi.map(k => k.tipTestaId).filter(id => nazivi.has(id));
  for (const id of izRezultata) {
    if (!redosled.includes(id)) {
      redosled.push(id);
    }
  }
  return [...new Set(redosled)].map(id => ({
    id,
    naziv: nazivi.get(id) ?? (koefTipovi.find(k => k.tipTestaId === id)?.tipTestaNaziv?.trim() || `Tip ${id}`),
  }));
}

/** Poeni studenta za tip testa; tip koji server nije vratio je `null` (prikaz `—`). */
export function poeniZaTip(r: RezultatiStudentaInfo, tipId: number): number | null {
  const p = (r?.rezultati ?? []).find(x => x?.tipTesta?.id === tipId);
  return typeof p?.ostvarenoPoena === 'number' && Number.isFinite(p.ostvarenoPoena) ? p.ostvarenoPoena : null;
}

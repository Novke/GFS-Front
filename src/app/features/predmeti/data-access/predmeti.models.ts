import type { GrupaInfo, PredmetInfo, TipTestaInfo } from '../../../core/api/reference.api';
import type { NazivIkone } from '../../../core/layout/icons';
import { JE_ID } from '../../../core/route-matchers';
import { parseDatum } from '../../../shared/util/datum.pipe';
import { tekucaSkolskaGodina } from '../../../shared/util/skolska-godina';
import type { DomaciListItem } from '../../../core/api/domaci.models';
import type { PredavanjeListItem } from '../../../core/api/predavanja.models';
import type { TestListItem } from '../../../core/api/testovi.models';

export type { GrupaInfo, PredmetInfo, TipTestaInfo } from '../../../core/api/reference.api';

/** `CreatePredmetCmd` (`POST predmeti`). */
export interface CreatePredmetCmd {
  naziv: string;
}

/** `CreateTipTestaCmd` (`POST test/tip`): naziv bar 2 znaka; nov tip je aktivan. */
export interface CreateTipTestaCmd {
  naziv: string;
  predmetId: number;
}

/** `UpdateTipTestaCmd` (`PUT test/tip/{id}`): naziv 1-60 znakova (obavezan), `aktivan` obavezan. */
export interface UpdateTipTestaCmd {
  naziv: string;
  aktivan: boolean;
}

/** Nastava predmeta u jednoj školskoj godini (sve grupe): izvor za H1, H3, birač grupe i tab Studenti. */
export interface NastavaGodine {
  predavanja: readonly PredavanjeListItem[];
  domaci: readonly DomaciListItem[];
  testovi: readonly TestListItem[];
}

export type TipStavkeLinije = 'predavanje' | 'domaci' | 'test';

/** Stavka vremenske linije (H1). */
export interface StavkaLinije {
  tip: TipStavkeLinije;
  id: number;
  datum: string | null;
  naslov: string;
  grupa: GrupaInfo | null;
  url: (string | number)[];
  ikona: NazivIkone;
}

const REDOSLED_TIPA: Record<TipStavkeLinije, number> = { predavanje: 0, domaci: 1, test: 2 };

/** Vreme za sort; bez datuma (ili neispravan) na kraj. */
function vreme(datum: string | null | undefined): number {
  return parseDatum(datum)?.getTime() ?? Number.POSITIVE_INFINITY;
}

/**
 * H1: predavanja (sa temom), domaći i testovi predmeta spojeni po datumu (najstarije prvo, kao semestar); isti dan:
 * predavanje, domaći, test; bez datuma na kraju. Sa `grupaId` samo stavke te grupe (domaći bez grupe tada ne ulazi).
 */
export function vremenskaLinija(n: NastavaGodine, grupaId: number | null): StavkaLinije[] {
  const uGrupi = (g: GrupaInfo | null | undefined) => grupaId === null || g?.id === grupaId;
  const stavke: StavkaLinije[] = [
    ...n.predavanja.filter(p => uGrupi(p.grupa)).map((p): StavkaLinije => ({
      tip: 'predavanje',
      id: p.id,
      datum: p.datum,
      naslov: [`Predavanje ${p.rb ?? ''}`.trim(), p.tema?.trim()].filter(Boolean).join(' · '),
      grupa: p.grupa ?? null,
      url: ['/predavanja', p.id],
      ikona: 'co_present',
    })),
    ...n.domaci.filter(d => uGrupi(d.grupa)).map((d): StavkaLinije => ({
      tip: 'domaci',
      id: d.id,
      datum: d.datum,
      naslov: d.naslov?.trim() || 'Domaći',
      grupa: d.grupa ?? null,
      url: ['/domaci', d.id],
      ikona: 'description',
    })),
    ...n.testovi.filter(t => uGrupi(t.grupa)).map((t): StavkaLinije => ({
      tip: 'test',
      id: t.id,
      datum: t.datum,
      naslov: t.tipTesta?.naziv?.trim() || 'Test',
      grupa: t.grupa ?? null,
      url: ['/testovi', t.id],
      ikona: 'assignment',
    })),
  ];
  return stavke.sort((a, b) => {
    const va = vreme(a.datum);
    const vb = vreme(b.datum);
    if (va !== vb) {
      return va < vb ? -1 : 1;
    }
    return REDOSLED_TIPA[a.tip] - REDOSLED_TIPA[b.tip] || a.id - b.id;
  });
}

/** Grupe koje imaju bilo kakvu nastavu iz predmeta u godini (birač grupe u hubu), po nazivu, bez duplikata. */
export function grupeSaNastavom(n: NastavaGodine): GrupaInfo[] {
  const grupe = new Map<number, GrupaInfo>();
  for (const g of [...n.predavanja, ...n.domaci, ...n.testovi].map(x => x.grupa)) {
    if (g && typeof g.id === 'number' && !grupe.has(g.id)) {
      grupe.set(g.id, g);
    }
  }
  return [...grupe.values()].sort((a, b) => (a.naziv ?? '').localeCompare(b.naziv ?? '', 'sr'));
}

/** Id-jevi grupa koje imaju predavanja iz predmeta u godini (tab Studenti). */
export function grupeSaPredavanjima(n: Pick<NastavaGodine, 'predavanja'>): number[] {
  return [...new Set(n.predavanja.map(p => p.grupa?.id).filter((id): id is number => typeof id === 'number'))];
}

// ---------------------------------------------------------------------------------------------- query parametri huba

/** `?godina=` huba: školska godina 2000-2100, sve ostalo (zastareo ili ručno izmenjen link) je tekuća, bez navigacije. */
export function parseGodinaHuba(v: unknown, sada: Date = new Date()): number {
  if (typeof v === 'string' && /^\d{4}$/.test(v)) {
    const g = Number(v);
    if (g >= 2000 && g <= 2100) {
      return g;
    }
  }
  return tekucaSkolskaGodina(sada);
}

/** `?grupa=` huba: id grupe ili `null` (sve grupe). */
export function parseGrupaHuba(v: unknown): number | null {
  return typeof v === 'string' && JE_ID.test(v) ? Number(v) : null;
}

// ---------------------------------------------------------------------------------------------- H3

export interface TackaProseka {
  id: number;
  datum: string;
  /** Prosek u procentima od max poena testa (testovi istog tipa mogu imati različit max). */
  procenat: number;
  prosek: number;
  maxPoena: number;
  grupa: string | null;
}

export interface SerijaProseka {
  tip: Pick<TipTestaInfo, 'id' | 'naziv'>;
  tacke: TackaProseka[];
}

/**
 * H3: prosek testova po tipu kroz vreme (`TestListItem.prosek`), u % od max poena testa. Test bez proseka, datuma,
 * tipa ili max poena se preskače. Serije po nazivu tipa, tačke po datumu.
 */
export function serijeProsekaPoTipu(testovi: readonly TestListItem[]): SerijaProseka[] {
  const serije = new Map<number, SerijaProseka>();
  for (const t of testovi) {
    const tip = t.tipTesta;
    if (!tip || typeof t.prosek !== 'number' || !Number.isFinite(t.prosek) || !t.maxPoena || t.maxPoena <= 0 || !parseDatum(t.datum)) {
      continue;
    }
    const s = serije.get(tip.id) ?? { tip: { id: tip.id, naziv: tip.naziv?.trim() || `Tip ${tip.id}` }, tacke: [] };
    s.tacke.push({
      id: t.id,
      datum: t.datum as string,
      procenat: Math.round((t.prosek / t.maxPoena) * 1000) / 10,
      prosek: t.prosek,
      maxPoena: t.maxPoena,
      grupa: t.grupa?.naziv ?? null,
    });
    serije.set(tip.id, s);
  }
  return [...serije.values()]
    .map(s => ({ ...s, tacke: s.tacke.sort((a, b) => vreme(a.datum) - vreme(b.datum) || a.id - b.id) }))
    .sort((a, b) => a.tip.naziv.localeCompare(b.tip.naziv, 'sr'));
}

// ---------------------------------------------------------------------------------------------- lista predmeta

export interface StatistikaPredmeta {
  predavanja: number;
  testovi: number;
  /** Nazivi grupa sa predavanjima ili testovima, po nazivu. */
  grupe: string[];
}

/** Lista predmeta: broj predavanja, testova i grupa po predmetu (iz lista jedne školske godine). */
export function statistikaPredmeta(
  predavanja: readonly Pick<PredavanjeListItem, 'predmet' | 'grupa'>[],
  testovi: readonly Pick<TestListItem, 'predmet' | 'grupa'>[],
): Map<number, StatistikaPredmeta> {
  const radna = new Map<number, { predavanja: number; testovi: number; grupe: Set<string> }>();
  const zapis = (p: PredmetInfo | null | undefined) => {
    if (!p || typeof p.id !== 'number') {
      return null;
    }
    let z = radna.get(p.id);
    if (!z) {
      z = { predavanja: 0, testovi: 0, grupe: new Set() };
      radna.set(p.id, z);
    }
    return z;
  };
  for (const p of predavanja) {
    const z = zapis(p.predmet);
    if (z) {
      z.predavanja++;
      if (p.grupa?.naziv) {
        z.grupe.add(p.grupa.naziv);
      }
    }
  }
  for (const t of testovi) {
    const z = zapis(t.predmet);
    if (z) {
      z.testovi++;
      if (t.grupa?.naziv) {
        z.grupe.add(t.grupa.naziv);
      }
    }
  }
  return new Map(
    [...radna].map(([id, z]) => [id, { predavanja: z.predavanja, testovi: z.testovi, grupe: [...z.grupe].sort((a, b) => a.localeCompare(b, 'sr')) }]),
  );
}

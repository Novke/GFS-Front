import type { OtvorenoZaGrupu, StatistikaTipa } from '../src/app/features/banka/data-access/banka.models';
import type {
  MojZadatak, OcenaStudenta, PoljeZadatka, PredmetStudenta, PregledPrezentacije, PrezentacijaStudenta, PrisustvoStudenta,
  TemaVezbanja, ZadatakVezbanja,
} from '../src/app/features/nalog/data-access/portal.models';

/*
 * Mok naloga studenta, faze 2 i 3 (`api/public/nalog/{predmeti,prezentacije,vezbanje}*`) i nastavničkih dodataka (panel
 * „Za vežbanje“ u banci, statistika vežbanja). Izmišljeni podaci, isti u svakom testu (nova instanca po testu). Pravila kao
 * na serveru, samo koliko e2e proverava: bez kolačića studenta 401 `Potrebna je prijava.`, tuđ ili nepoznat predmet,
 * prezentacija i pokušaj 404 `Nije pronađeno.`, nivo bez zadataka 409. Tačan odgovor nikad ne ide uz izvučen zadatak, nego tek
 * uz `resenje`. Rute registruje `mock-api.ts`.
 */

interface Odgovor { status?: number; telo?: unknown }
type Get = (sablon: string, h: (z: { telo: unknown; query: URLSearchParams }, p: Record<string, string>) => Odgovor) => void;

const ok = (telo: unknown): Odgovor => ({ telo });
const greska = (status: number, reason: string): Odgovor => ({ status, telo: { reason, time: new Date().toISOString() } });
const NEMA = () => greska(404, 'Nije pronađeno.');

/** Predmet sa časovima, otvorenim tipovima i neobjavljenom ocenom; drugi predmet ima objavljenu ocenu. */
export const PREDMET = 1;
export const PREDMET_OCENA = 2;
export const PREZENTACIJA = 7;
/** Tip sa poljem broja (★ 1, ★★ 2, ★★★ 0); drugi je rad na papiru. */
export const TIP = 2;
export const TIP_PAPIR = 3;
/** Tačan dekadni zapis svakog zadatka tipa {@link TIP} (izmišljeno: "1101 u dekadni"). */
export const TACNO = '13';

const POLJE_BROJA: PoljeZadatka = {
  kljuc: 'a', oznaka: 'Dekadni zapis', tip: 'BROJ', odstupanje: null, odstupanjeTip: null, jedinica: null, zanemariVelicinu: null,
  zanemariRazmake: null, opcije: null,
};

function predmeti(): PredmetStudenta[] {
  return [
    { id: PREDMET, naziv: 'Programiranje u građevinarstvu', prisutan: 2, predavanja: 3, tipovaZaVezbanje: 2, ocenaObjavljena: false },
    { id: PREDMET_OCENA, naziv: 'Primenjena informatika', prisutan: 1, predavanja: 1, tipovaZaVezbanje: 0, ocenaObjavljena: true },
  ];
}

function prisustvo(predmet: number): PrisustvoStudenta {
  if (predmet === PREDMET_OCENA) {
    return {
      prisutan: 1, ukupno: 1, predavanja: [
        { id: 21, datum: '2026-10-07', redniBroj: 1, tema: 'Tabele', grupa: 'GD-2025', svojaGrupa: true, aktivnost: 'PRISUSTVO', cekiranU: null },
      ],
    };
  }
  return {
    prisutan: 2, ukupno: 3, predavanja: [
      { id: 3, datum: '2026-10-20', redniBroj: 3, tema: 'Razlomljeni brojevi', grupa: 'GD-2025', svojaGrupa: true, aktivnost: 'ZADATAK', cekiranU: '2026-10-20T10:03:00' },
      { id: 2, datum: '2026-10-13', redniBroj: 2, tema: 'Heksadekadni sistem', grupa: 'GD-2025', svojaGrupa: true, aktivnost: null, cekiranU: null },
      { id: 1, datum: '2026-10-06', redniBroj: 1, tema: 'Brojni sistemi', grupa: 'GD-2025', svojaGrupa: true, aktivnost: 'PRISUSTVO', cekiranU: '2026-10-06T10:01:00' },
    ],
  };
}

function vezbanje(predmet: number, ucinak: { provereno: number; tacno: number }): TemaVezbanja[] {
  if (predmet !== PREDMET) {
    return [];
  }
  return [{
    naziv: 'Konverzije brojeva', tipovi: [
      { tipId: TIP, naziv: '2 → 10', putanja: ['Konverzije brojeva'], poNivou: [1, 2, 0], ukupno: 3, papir: false, ...ucinak },
      { tipId: TIP_PAPIR, naziv: '16 → 2', putanja: ['Konverzije brojeva'], poNivou: [0, 1, 0], ukupno: 1, papir: true, provereno: 0, tacno: 0 },
    ],
  }];
}

function mojiZadaci(predmet: number): MojZadatak[] {
  if (predmet !== PREDMET) {
    return [];
  }
  return [{
    rundaId: 31, vreme: '2026-10-20T10:20:00', prezentacijaId: PREZENTACIJA, prezentacija: 'Konverzije – vežbe', slajdId: 73,
    slajd: 'Binarni u dekadni', tip: '2 → 10', svgId: 'portal-svg-cas', resenjeSvgId: 'portal-svg-cas-resenje', polja: [POLJE_BROJA],
    uneto: { a: '11' }, ishod: { a: false }, tacno: false,
    tacneVrednosti: { a: { broj: 13, prihvatljivi: null, tacna: null, tacne: null } }, tipId: TIP, vezbanjeOtvoreno: true,
  }];
}

function prezentacije(predmet: number): PrezentacijaStudenta[] {
  return predmet === PREDMET ? [{ id: PREZENTACIJA, naziv: 'Konverzije – vežbe', odrzana: '2026-10-20T10:00:00', slajdova: 3 }] : [];
}

function pregled(): PregledPrezentacije {
  return {
    id: PREZENTACIJA, naziv: 'Konverzije – vežbe', tema: 'NACRT', predmetId: PREDMET, slajdovi: [
      {
        id: 71, rb: 1, tip: 'INFO', naslov: 'Pozicioni brojni sistemi', sadrzaj: 'Vrednost cifre zavisi od **mesta**.', slika: null,
        pitanje: null, platno: null, zadatak: null, mojOdgovor: null, tacanPoznat: false,
      },
      {
        id: 72, rb: 2, tip: 'PITANJE', naslov: null, sadrzaj: null, slika: null, platno: null, zadatak: null,
        pitanje: {
          id: 81, tip: 'JEDAN_TACAN', tekst: 'Koja je osnova heksadekadnog sistema?', slika: null, vremeSekunde: 30,
          opcije: [{ id: 1, rb: 1, tekst: '8', tacna: false }, { id: 2, rb: 2, tekst: '16', tacna: true }],
          brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null, prihvatljiviOdgovori: null,
          skalaMinOznaka: null, skalaMaxOznaka: null,
        },
        mojOdgovor: { tekst: '8', tacno: false },
        tacanPoznat: true,
      },
      {
        id: 73, rb: 3, tip: 'ZADATAK', naslov: 'Binarni u dekadni', sadrzaj: null, slika: null, pitanje: null, platno: null,
        zadatak: { naziv: '2 → 10', moji: mojiZadaci(PREDMET), tipovi: [{ tipId: TIP, naziv: '2 → 10' }] }, mojOdgovor: null,
        tacanPoznat: false,
      },
    ],
  };
}

function ocena(predmet: number): OcenaStudenta {
  if (predmet !== PREDMET_OCENA) {
    return { objavljeno: false, objavljenoU: null, ocena: null };
  }
  return {
    objavljeno: true, objavljenoU: '2026-10-28T12:00:00', ocena: {
      predlogOcene: 8, ukupno: 74.5, poeniPredispitne: 34.5, poeniAktivnost: 6, poeniDomaci: 8.5,
      testovi: [{ naziv: 'Kolokvijum 1', poeni: 40 }],
    },
  };
}

export class MockPortal {
  /** Učinak studenta na tipu {@link TIP} (prva provera svakog izvučenog zadatka). */
  readonly ucinak = { provereno: 1, tacno: 1 };
  /** Izvučeni zadaci u ovom testu (id -> tip); pokušaj van ove mape je tuđ ili nepostojeći (404). */
  readonly pokusaji = new Map<number, { tipId: number; nivo: number | null; provereno: boolean; resenje: boolean; zadatak: ZadatakVezbanja }>();
  /** Podešavanja naloga (tab Ja); PUT ih menja. */
  readonly podesavanja = { mejlOtkazanCas: true };
  /** Stanje panela „Za vežbanje“ po čvoru banke (nastavnik); bez unosa: podrazumevano za predmet čvora. */
  readonly otvoreno = new Map<number, OtvorenoZaGrupu[]>();
  private sledeci = 500;

  constructor(private readonly studentPrijavljen: () => boolean, private readonly cvorPredavanja: (id: number) => boolean) {}

  /** Studentske rute (`public/nalog/...`). */
  studentskeRute(get: Get, post: Get, put: Get): void {
    const student = (h: (z: { telo: unknown; query: URLSearchParams }, p: Record<string, string>) => Odgovor) =>
      (z: { telo: unknown; query: URLSearchParams }, p: Record<string, string>): Odgovor =>
        this.studentPrijavljen() ? h(z, p) : greska(401, 'Potrebna je prijava.');
    const predmet = (p: Record<string, string>) => {
      const id = Number(p['id']);
      return id === PREDMET || id === PREDMET_OCENA ? id : null;
    };
    const zaPredmet = (f: (id: number) => unknown) => student((_z, p) => {
      const id = predmet(p);
      return id === null ? NEMA() : ok(f(id));
    });

    get('public/nalog/predmeti', student(() => ok(predmeti())));
    get('public/nalog/predmeti/:id/prisustvo', zaPredmet(prisustvo));
    get('public/nalog/predmeti/:id/vezbanje', zaPredmet(id => vezbanje(id, this.ucinak)));
    get('public/nalog/predmeti/:id/moji-zadaci', zaPredmet(mojiZadaci));
    get('public/nalog/predmeti/:id/prezentacije', zaPredmet(prezentacije));
    get('public/nalog/predmeti/:id/ocena', zaPredmet(ocena));
    get('public/nalog/prezentacije/:id', student((_z, p) => (Number(p['id']) === PREZENTACIJA ? ok(pregled()) : NEMA())));

    get('public/nalog/podesavanja', student(() => ok({ ...this.podesavanja })));
    put('public/nalog/podesavanja', student(z => {
      const v = (z.telo as { mejlOtkazanCas?: unknown } | null)?.mejlOtkazanCas;
      if (typeof v !== 'boolean') {
        return greska(400, 'Izaberi da li želiš mejl.');
      }
      this.podesavanja.mejlOtkazanCas = v;
      return ok({ ...this.podesavanja });
    }));

    post('public/nalog/vezbanje', student(z => {
      const telo = z.telo as { tipId?: unknown; nivo?: unknown; novi?: unknown } | null;
      const tip = vezbanje(PREDMET, this.ucinak)[0].tipovi.find(t => t.tipId === telo?.tipId);
      if (!tip) {
        return NEMA();
      }
      const nivo = typeof telo?.nivo === 'number' ? telo.nivo : null;
      if (nivo !== null && tip.poNivou[nivo - 1] === 0) {
        return greska(409, 'Za ovaj nivo nema zadataka.');
      }
      // kao server: bez "Novi zadatak" vraća poslednji netaknut zadatak istog tipa i nivoa
      const netaknut = telo?.novi === true ? undefined : [...this.pokusaji.values()].reverse()
        .find(x => x.tipId === tip.tipId && x.nivo === nivo && !x.provereno && !x.resenje);
      if (netaknut) {
        return ok(netaknut.zadatak);
      }
      const pokusajId = this.sledeci++;
      const zadatak: ZadatakVezbanja = {
        pokusajId, tipId: tip.tipId, tip: tip.naziv, tema: 'Konverzije brojeva', nivo: nivo ?? 1, svgId: `portal-svg-${pokusajId}`,
        polja: tip.papir ? [] : [POLJE_BROJA],
      };
      this.pokusaji.set(pokusajId, { tipId: tip.tipId, nivo, provereno: false, resenje: false, zadatak });
      return ok(zadatak);
    }));
    post('public/nalog/vezbanje/:id/provera', student((z, p) => {
      const pokusaj = this.pokusaji.get(Number(p['id']));
      if (!pokusaj) {
        return NEMA();
      }
      const uneto = String((z.telo as { polja?: Record<string, unknown> } | null)?.polja?.['a'] ?? '').replace(/\s/g, '');
      const tacno = uneto === TACNO;
      if (!pokusaj.provereno && !pokusaj.resenje) {
        pokusaj.provereno = true;
        this.ucinak.provereno++;
        if (tacno) {
          this.ucinak.tacno++;
        }
      }
      return ok({ tacno, ishod: { a: tacno } });
    }));
    post('public/nalog/vezbanje/:id/resenje', student((_z, p) => {
      const pokusaj = this.pokusaji.get(Number(p['id']));
      if (pokusaj) {
        pokusaj.resenje = true;
      }
      return pokusaj
        ? ok({ resenjeSvgId: `portal-svg-${p['id']}-resenje`, tacneVrednosti: { a: { broj: Number(TACNO), prihvatljivi: null, tacna: null, tacne: null } } })
        : NEMA();
    }));
  }

  /** Nastavničke rute (iza sesije nastavnika; mok ih proverava pre ovih rukovalaca). */
  nastavnickeRute(get: Get, put: Get, del: Get): void {
    const stanje = (id: number): OtvorenoZaGrupu[] => {
      if (!this.otvoreno.has(id)) {
        this.otvoreno.set(id, [
          { grupaId: 1, naziv: 'GD-2025', godinaUpisa: 2025, stanje: 'OTVORENO', izvor: 'CAS', prviPut: '2026-10-20T11:30:00', tema: null, otvorenihListova: 1, listova: 1 },
          { grupaId: 2, naziv: 'AR-2025', godinaUpisa: 2025, stanje: 'ZATVORENO', izvor: null, prviPut: null, tema: null, otvorenihListova: 0, listova: 1 },
        ]);
      }
      return this.otvoreno.get(id)!;
    };
    const cvor = (p: Record<string, string>) => {
      const id = Number(p['id']);
      return this.cvorPredavanja(id) ? id : null;
    };
    const promeni = (otvori: boolean) => (_z: unknown, p: Record<string, string>): Odgovor => {
      const id = cvor(p);
      const red = id === null ? undefined : stanje(id).find(g => g.grupaId === Number(p['g']));
      if (id === null || !red) {
        return greska(404, id === null ? 'Tip nije u banci za predavanja.' : 'Grupa ne postoji.');
      }
      Object.assign(red, otvori
        ? { stanje: 'OTVORENO', izvor: red.izvor ?? 'RUCNO', prviPut: red.prviPut ?? '2026-10-29T09:00:00', otvorenihListova: red.listova }
        : { stanje: 'ZATVORENO', izvor: null, prviPut: null, otvorenihListova: 0 });
      return ok(stanje(id));
    };
    get('banka/grupe/:id/otvoreno', (_z, p) => {
      const id = cvor(p);
      return id === null ? greska(404, 'Tip nije u banci za predavanja.') : ok(stanje(id));
    });
    put('banka/grupe/:id/otvoreno/:g', promeni(true));
    del('banka/grupe/:id/otvoreno/:g', promeni(false));
    get('predmeti/:id/vezbanje/statistika', (_z, p) => {
      const redovi: StatistikaTipa[] = Number(p['id']) === PREDMET
        ? [
          { tipId: TIP, naziv: '2 → 10', putanja: ['Konverzije brojeva'], studenata: 14, pokusaja: 52, provereno: 40, prvaTacno: 29, resenjeBezTacne: 6 },
          { tipId: TIP_PAPIR, naziv: '16 → 2', putanja: ['Konverzije brojeva'], studenata: 3, pokusaja: 4, provereno: 0, prvaTacno: 0, resenjeBezTacne: 2 },
        ]
        : [];
      return ok(redovi);
    });
  }
}

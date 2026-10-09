import { IzvodjenjeInfo, NastavnickoStanje, PitanjeDetails, TipKomande } from './uzivo.models';

const UVEK: readonly TipKomande[] = ['TELEFON_PRIKAZ', 'DETALJI', 'EKRAN_CRN', 'EKRAN_BEO', 'QR', 'ZAVRSI'];

/** Da li pitanje ima tačan odgovor (isto kao `PitanjeSnimak.imaTacanOdgovor` na serveru). */
export function imaTacanOdgovor(p: PitanjeDetails | null | undefined): boolean {
  if (!p) return false;
  switch (p.tip) {
    case 'JEDAN_TACAN': case 'VISE_TACNIH': case 'TACNO_NETACNO': return true;
    case 'BROJ': return p.brojTacno !== null;
    case 'KRATAK_TEKST': return !!p.prihvatljiviOdgovori?.length;
    default: return false;
  }
}

/**
 * Komande koje server u ovom stanju prihvata (ista pravila kao `IzvodjenjeService`, spec 2.3 i 4.5); ostale vraćaju
 * 409 (410 kad je izvođenje završeno). Konzola po ovome onemogućava dugmad, a publika tiho preskače prečice.
 * `SLEDECI` na kraju i `PRETHODNI` na prijavi server prima bez promene; ovde su isključene jer ništa ne rade.
 */
export function dozvoljeneKomande(s: NastavnickoStanje | null): ReadonlySet<TipKomande> {
  const d = new Set<TipKomande>();
  if (!s || s.izvodjenje.status !== 'AKTIVNO') return d;
  UVEK.forEach(k => d.add(k));
  d.add('IDI_NA');
  if (s.prikaz !== 'KRAJ') d.add('SLEDECI');
  if (s.prikaz !== 'PRIJAVA') d.add('PRETHODNI');

  const pitanje = s.prikaz === 'SLAJD' && s.trenutniSlajd?.tip === 'PITANJE' ? s.trenutniSlajd.pitanje : null;
  const faza = s.faza ?? 'CEKA';
  if (pitanje) {
    d.add('OTVORI_ZATVORI');
    if (faza !== 'CEKA') d.add('PONOVI');
  }
  if (s.rezultatiPrikazani || (pitanje && s.runda && (faza === 'OTVORENO' || faza === 'ZATVORENO'))) d.add('REZULTATI');
  if (s.tacanPrikazan || (pitanje && faza === 'ZATVORENO' && imaTacanOdgovor(pitanje))) d.add('TACAN');
  if (s.takmicenje || s.rangListaPrikazana) d.add('RANG_LISTA');
  if (pitanje && faza === 'OTVORENO' && s.runda) {
    d.add('TAJMER');
    if (s.runda.rokMs !== null || s.runda.preostaloMs !== null) {
      d.add('TAJMER_PLUS');
      d.add('TAJMER_MINUS');
    }
  }
  return d;
}

/** `IDI_NA` je ispravan za -1 (prijava) do `brojSlajdova` (kraj). */
export function ispravanIndeks(vrednost: number | undefined, brojSlajdova: number): boolean {
  return vrednost !== undefined && Number.isInteger(vrednost) && vrednost >= -1 && vrednost <= brojSlajdova;
}

/**
 * "Odgovorili x/y" u konzoli: imenilac su učesnici koji su povezani **ili** su već odgovorili u ovoj rundi (student koji
 * je odgovorio pa izgubio vezu se i dalje broji), pa nikad nema 31/30, a "svi odgovorili" ne pali pre vremena.
 */
export function odgovorili(s: NastavnickoStanje): { broj: number; od: number; svi: boolean } {
  const aktivni = s.ucesnici.filter(u => u.povezan || u.odgovorio).length;
  const od = Math.max(aktivni, s.brojPovezanih, s.brojOdgovora);
  return { broj: s.brojOdgovora, od, svi: od > 0 && s.brojOdgovora >= od };
}

/** Šta radi `→` u ovom trenutku (oznaka glavnog dugmeta u konzoli). */
export function oznakaDalje(s: NastavnickoStanje): string {
  if (s.prikaz === 'PRIJAVA') return 'Počni';
  if (s.prikaz === 'KRAJ') return 'Kraj';
  const sl = s.trenutniSlajd;
  if (sl?.tip === 'PITANJE') {
    const faza = s.faza ?? 'CEKA';
    if (faza === 'CEKA') return 'Otvori pitanje';
    if (faza === 'OTVORENO') return 'Zatvori pitanje';
  }
  if (sl?.tip === 'INFO' && s.korak < s.brojStavki) return 'Sledeća stavka';
  return s.indeks + 1 >= s.brojSlajdova ? 'Na kraj' : 'Sledeći slajd';
}

/** Oznaka za `O`: otvara ili zatvara pitanje. */
export function oznakaOtvoriZatvori(s: NastavnickoStanje): string {
  return s.faza === 'OTVORENO' ? 'Zatvori' : 'Otvori';
}

/** Oznaka za `T`. */
export function oznakaTajmera(s: NastavnickoStanje): string {
  const r = s.faza === 'OTVORENO' ? s.runda : null;
  if (r?.rokMs != null && r.preostaloMs === null) return 'Pauziraj tajmer';
  if (r?.preostaloMs != null) return 'Nastavi tajmer';
  return 'Pokreni tajmer 30 s';
}

/** Gde je izvođenje: "Prijava", "Slajd 3/12" ili "Kraj". */
export function oznakaPolozaja(s: NastavnickoStanje): string {
  if (s.prikaz === 'PRIJAVA') return 'Prijava';
  if (s.prikaz === 'KRAJ') return 'Kraj';
  return `Slajd ${s.indeks + 1}/${s.brojSlajdova}`;
}

/** "7.10.2026." iz ISO datuma ili datuma-vremena; nepoznat oblik se vraća nepromenjen. */
export function datumKratko(iso: string | null | undefined): string {
  const [g, m, d] = (iso ?? '').slice(0, 10).split('-').map(Number);
  return g && m && d ? `${d}.${m}.${g}.` : (iso ?? '');
}

/**
 * Za šta je izvođenje vezano: "GD-2025 · 3. predavanje (7.10.2026.) · Statika" (predavanje nosi svoju grupu, pa se grupa
 * ne ponavlja kad je ista). Bez predavanja i bez grupe: "Bez grupe".
 */
export function opisVeze(i: Pick<IzvodjenjeInfo, 'grupa' | 'predavanje'>): string {
  const delovi: string[] = [];
  if (i.grupa) delovi.push(i.grupa.naziv);
  if (i.predavanje) {
    delovi.push(`${i.predavanje.rb}. predavanje (${datumKratko(i.predavanje.datum)})`);
    if (i.predavanje.tema) delovi.push(i.predavanje.tema);
  }
  return delovi.length ? delovi.join(' · ') : 'Bez grupe';
}

/** Završeno izvođenje bez čuvanja nema ni učesnike ni pitanja (server ih briše na "Završi"), pa se brojevi ne prikazuju. */
export function imaBrojeve(i: Pick<IzvodjenjeInfo, 'cuvanje' | 'status'>): boolean {
  return i.cuvanje || i.status === 'AKTIVNO';
}

/** Pregled je moguć samo za završeno izvođenje koje je čuvalo rezultate. */
export function mozePregled(i: Pick<IzvodjenjeInfo, 'cuvanje' | 'status'>): boolean {
  return i.cuvanje && i.status === 'ZAVRSENO';
}

import { IzvodjenjeInfo, NastavnickiZadatak, NastavnickoStanje, PitanjeDetails, SlajdDetails, TipKomande } from './uzivo.models';

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
 * Da li Zadatak runda ima tačan odgovor: bar jedna izvučena varijanta ima polje (isto kao `ZadatakSnimak.imaTacanOdgovor`);
 * šema bez polja je rad na papiru. Bez runde nema rezultata, pa ni tačnog.
 */
export function imaTacanOdgovorZadatka(z: NastavnickiZadatak | null | undefined): boolean {
  return !!z?.rezultat?.varijante.some(v => v.polja.length > 0);
}

/** Slajd sa rundama (server `TokIzvodjenja.saRundama`): PITANJE sa pitanjem ili ZADATAK. */
function saRundama(sl: SlajdDetails | null | undefined): boolean {
  return (sl?.tip === 'PITANJE' && !!sl.pitanje) || sl?.tip === 'ZADATAK';
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

  const sl = s.prikaz === 'SLAJD' ? s.trenutniSlajd : null;
  const pitanje = sl?.tip === 'PITANJE' ? sl.pitanje : null;
  const zadatak = sl?.tip === 'ZADATAK';
  // Zadatak slajd ima runde kao pitanje: otvori/zatvori, ponovi, rezultati i tajmer važe isto
  const runde = saRundama(sl);
  const faza = s.faza ?? 'CEKA';
  if (runde) {
    d.add('OTVORI_ZATVORI');
    if (faza !== 'CEKA') d.add('PONOVI');
  }
  if (s.rezultatiPrikazani || (runde && s.runda && (faza === 'OTVORENO' || faza === 'ZATVORENO'))) d.add('REZULTATI');
  const tacan = pitanje ? imaTacanOdgovor(pitanje) : zadatak && imaTacanOdgovorZadatka(s.zadatak);
  if (s.tacanPrikazan || (runde && faza === 'ZATVORENO' && tacan)) d.add('TACAN');
  // RESENJE je prekidač: isključenje uvek, uključenje na zatvorenoj rundi kad bar jedna izvučena varijanta ima rešenje
  if (s.zadatak?.resenjePrikazano || (zadatak && faza === 'ZATVORENO' && !!s.zadatak?.varijante?.some(v => v.resenjeSvgId))) {
    d.add('RESENJE');
  }
  // broj različitih važi za sledeće otvaranje (i PONOVI), pa samo pre otvaranja
  if (zadatak && faza === 'CEKA') d.add('BROJ_VARIJANTI');
  // rang tačnosti izvođenja uvek (u takmičenju je to rang po poenima); rang predavanja kad predavanje ima još izvođenja
  d.add('RANG_LISTA');
  if (s.imaRangPredavanja || s.rangPrikaz === 'PREDAVANJE') d.add('RANG_PREDAVANJA');
  if (runde && faza === 'OTVORENO' && s.runda) {
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
 * "Odgovorili x/y" u konzoli: imenilac su svi neizbačeni učesnici izvođenja (server izbačene ne šalje), povezani ili ne,
 * a za izvođenje sa predavanja i čekirani studenti koji još nisu ušli (`brojOcekivanih` sa servera; stari backend ga nema).
 * Telefon u pozadini (kalkulator, zaključan ekran) gubi vezu, ali student i dalje radi, pa "svi odgovorili" ne pali dok
 * neko ko je ušao još nije predao; ko je stvarno otišao, Novica ga "Izbaci". `povezan` je samo oznaka u panelu učesnika.
 * `od` nikad nije manji od broja odgovora, pa nema 31/30.
 */
export function odgovorili(s: NastavnickoStanje): { broj: number; od: number; svi: boolean } {
  const od = Math.max(s.brojOcekivanih ?? s.ucesnici.length, s.brojOdgovora);
  return { broj: s.brojOdgovora, od, svi: od > 0 && s.brojOdgovora >= od };
}

/** Šta radi `→` u ovom trenutku (oznaka glavnog dugmeta u konzoli). */
export function oznakaDalje(s: NastavnickoStanje): string {
  if (s.prikaz === 'PRIJAVA') return 'Počni';
  if (s.prikaz === 'KRAJ') return 'Kraj';
  const sl = s.trenutniSlajd;
  if (sl?.tip === 'PITANJE' || sl?.tip === 'ZADATAK') {
    const sta = sl.tip === 'PITANJE' ? 'pitanje' : 'zadatak';
    const faza = s.faza ?? 'CEKA';
    if (faza === 'CEKA') return `Otvori ${sta}`;
    if (faza === 'OTVORENO') return `Zatvori ${sta}`;
  }
  if (sl?.tip === 'INFO' && s.korak < s.brojStavki) return 'Sledeća stavka';
  // `brojStavki` je za PLATNO broj koraka (KLIK animacija).
  if (sl?.tip === 'PLATNO' && s.korak < s.brojStavki) return 'Sledeći korak';
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

/** Gde je izvođenje: "Prijava", "Kraj", "Slajd 12/48" ili "Slajd 12/48 · korak 3/6" (korak samo kad slajd ima korake). */
export function oznakaPolozaja(s: NastavnickoStanje): string {
  if (s.prikaz === 'PRIJAVA') return 'Prijava';
  if (s.prikaz === 'KRAJ') return 'Kraj';
  const osnova = `Slajd ${s.indeks + 1}/${s.brojSlajdova}`;
  return s.brojStavki > 0 ? `${osnova} · korak ${s.korak}/${s.brojStavki}` : osnova;
}

/** Isto, kratko za telefon: "Prijava", "Kraj", "12/48" ili "12/48 · 3/6". */
export function oznakaPolozajaKratko(s: NastavnickoStanje): string {
  if (s.prikaz === 'PRIJAVA') return 'Prijava';
  if (s.prikaz === 'KRAJ') return 'Kraj';
  const osnova = `${s.indeks + 1}/${s.brojSlajdova}`;
  return s.brojStavki > 0 ? `${osnova} · ${s.korak}/${s.brojStavki}` : osnova;
}

export type SledeciKlik =
  | { vrsta: 'KORAK'; slajd: SlajdDetails; indeks: number; korak: number; brojKoraka: number }
  | { vrsta: 'SLAJD'; slajd: SlajdDetails; indeks: number }
  | { vrsta: 'PITANJE'; radnja: 'OTVARA' | 'ZATVARA'; potom: SlajdDetails | null; indeksPotom: number }
  | { vrsta: 'KRAJ' }
  | { vrsta: 'NISTA' };

/**
 * Šta pokazuje sledeći `SLEDECI`: isti slajd na koraku k+1, sledeći slajd na koraku 0, radnja pitanja (i Zadatak slajda) ili kraj.
 */
export function sledeciKlik(s: NastavnickoStanje): SledeciKlik {
  if (s.prikaz === 'KRAJ') return { vrsta: 'NISTA' };
  const posle = (): SledeciKlik =>
    s.sledeciSlajd ? { vrsta: 'SLAJD', slajd: s.sledeciSlajd, indeks: s.indeks + 1 } : { vrsta: 'KRAJ' };
  if (s.prikaz === 'PRIJAVA') return posle();
  const sl = s.trenutniSlajd;
  if (sl?.tip === 'PITANJE' || sl?.tip === 'ZADATAK') {
    const faza = s.faza ?? 'CEKA';
    if (faza !== 'ZATVORENO') {
      return { vrsta: 'PITANJE', radnja: faza === 'CEKA' ? 'OTVARA' : 'ZATVARA', potom: s.sledeciSlajd, indeksPotom: s.indeks + 1 };
    }
    return posle();
  }
  if (sl && s.korak < s.brojStavki) {
    return { vrsta: 'KORAK', slajd: sl, indeks: s.indeks, korak: s.korak + 1, brojKoraka: s.brojStavki };
  }
  return posle();
}

/** Naslov panela "Sledeće" za dati klik. */
export function naslovSledeceg(k: SledeciKlik, brojSlajdova: number): string {
  switch (k.vrsta) {
    case 'KORAK': return `Sledeće · korak ${k.korak}/${k.brojKoraka}`;
    case 'SLAJD': return `Sledeće · slajd ${k.indeks + 1}/${brojSlajdova}`;
    case 'PITANJE': return 'Sledeće';
    case 'KRAJ': return 'Sledeće · kraj prezentacije';
    default: return 'Sledeće';
  }
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

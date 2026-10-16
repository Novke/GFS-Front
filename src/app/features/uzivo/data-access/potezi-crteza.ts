// Potezi crteža do projektora i konzole (plan faze 5, odluka 8): snimak izvođenja ide i do 4 puta u sekundi i ne nosi
// poteze (`CrtezSloj.potezi = null`), pa ih prozor traži posebno, jednom po slajdu i crtežu, i čuva u svom kešu.
import { Injectable, inject, signal } from '@angular/core';
import type { CrtezSloj, Potez } from './platno.models';
import { PrezentacijeApi } from './prezentacije.api';
import type { PoteziSloja, SlajdDetails } from './uzivo.models';

/**
 * Posle greške zahtev za iste slojeve ide tek posle ovoliko (ne u petlji, Review Focus 3): tada `ucitaj` sam pokreće ponovo
 * efekat koji ga zove (signal pauze), jedan pokušaj po pauzi, pa projektor u sali bez komandi ipak dobije vektor.
 */
export const PONOVI_POSLE_MS = 10_000;

const naDesetinu = (v: number) => Math.round(v * 10) / 10;
/** Ključ unosa: isti sloj sa drugim `medijId` (paste drugog crteža na isti id) je drugi crtež. */
const kljucSloja = (s: { id?: string; slojId?: string; medijId: string }) => `${s.slojId ?? s.id}|${s.medijId}`;

/** Tačke za novu veličinu sloja (linearno, kao `postaviKutiju` faze 4); ista veličina -> isti niz. */
export function skalirajPoteze(potezi: Potez[], iz: { sirina: number; visina: number }, u: { sirina: number; visina: number }): Potez[] {
  if (iz.sirina === u.sirina && iz.visina === u.visina) return potezi;
  const kx = iz.sirina > 0 ? u.sirina / iz.sirina : 1;
  const ky = iz.visina > 0 ? u.visina / iz.visina : 1;
  return potezi.map((p) => ({ ...p, tacke: p.tacke.map((v, i) => naDesetinu(v * (i % 2 === 0 ? kx : ky))) }));
}

/**
 * Skalirani potezi unosa za veličinu sloja, zapamćeni za poslednju veličinu po unosu: snimak (do 4/s) je uvek nov JSON, a
 * isti niz poteza znači da prikaz ne računa putanje ponovo (`putanjeCrteza` kešira po nizu).
 */
const skalirani = new WeakMap<PoteziSloja, { sirina: number; visina: number; potezi: Potez[] }>();
function skaliraniPotezi(e: PoteziSloja, izvor: Potez[], u: { sirina: number; visina: number }): Potez[] {
  const z = skalirani.get(e);
  if (z && z.sirina === u.sirina && z.visina === u.visina) return z.potezi;
  const potezi = skalirajPoteze(izvor, e, u);
  skalirani.set(e, { sirina: u.sirina, visina: u.visina, potezi });
  return potezi;
}

/**
 * Slajd iz snimka sa potezima iz keša: CRTEZ bez poteza dobija poteze unosa istog `slojId` i `medijId` (drugi crtež na
 * istom id-ju ne dobija tuđe poteze), skalirane na veličinu sloja iz snimka. Ništa za dodati -> isti objekat.
 */
export function primeniPoteze(s: SlajdDetails, kes: ReadonlyMap<string, PoteziSloja> | undefined): SlajdDetails {
  const p = s.platno;
  if (s.tip !== 'PLATNO' || !p || !kes) return s;
  let promena = false;
  const slojevi = p.slojevi.map((sl) => {
    if (sl.tip !== 'CRTEZ' || sl.potezi) return sl;
    const e = kes.get(kljucSloja(sl));
    if (!e?.potezi) return sl;
    promena = true;
    return { ...sl, potezi: skaliraniPotezi(e, e.potezi, sl) };
  });
  return promena ? { ...s, platno: { ...p, slojevi } } : s;
}

/**
 * Keš poteza po prozoru (publika, konzola): jedan zahtev po slajdu i skupu crteža, greška -> slika i pauza. Unos se
 * pamti i kad odgovor nema traženi sloj (obrisan dok je zahtev trajao): taj sloj ostaje slika, bez novog zahteva.
 */
@Injectable({ providedIn: 'root' })
export class PoteziCrteza {
  private readonly api = inject(PrezentacijeApi);
  private readonly kes = signal<ReadonlyMap<number, ReadonlyMap<string, PoteziSloja>>>(new Map());
  /** `slajdId:slojId|medijId` za koje je zahtev poslat ili uspeo. */
  private readonly trazeno = new Set<string>();
  /** Raste kad istekne pauza posle greške: `ucitaj` ga čita, pa efekat koji ga zove (scena) radi ponovo jednom. */
  private readonly krajPauze = signal(0);

  /**
   * Traži poteze kad CRTEZ sloj bez poteza (id + `medijId`) još nije tražen; INFO, PITANJE i `null` ništa. Pozvan iz
   * efekta, efekat se ponovo pokreće kad istekne pauza posle greške (`PONOVI_POSLE_MS`): najviše jedan pokušaj po pauzi,
   * a nova greška daje novu pauzu (bez petlje). Posle uspeha signal se više ne menja.
   */
  ucitaj(s: SlajdDetails | null): void {
    this.krajPauze();
    if (!s || s.tip !== 'PLATNO' || !s.platno) return;
    const fale = s.platno.slojevi
      .filter((sl): sl is CrtezSloj => sl.tip === 'CRTEZ' && !sl.potezi)
      .map((sl) => `${s.id}:${kljucSloja(sl)}`)
      .filter((k) => !this.trazeno.has(k));
    if (fale.length === 0) return;
    fale.forEach((k) => this.trazeno.add(k));
    this.api.potezi(s.id).subscribe({
      next: (lista) => this.kes.update((m) => {
        const slajd = new Map(m.get(s.id) ?? []);
        for (const e of lista) slajd.set(kljucSloja(e), e);
        return new Map(m).set(s.id, slajd);
      }),
      error: (e: unknown) => {
        console.warn('Potezi crteža nisu učitani; crta se slika.', e);
        setTimeout(() => {
          fale.forEach((k) => this.trazeno.delete(k));
          this.krajPauze.update((n) => n + 1);
        }, PONOVI_POSLE_MS);
      },
    });
  }

  /** Slajd sa potezima iz keša (čita signal keša, pa se koristi u `computed`). */
  saPotezima(s: SlajdDetails | null): SlajdDetails | null {
    return s ? primeniPoteze(s, this.kes().get(s.id)) : null;
  }
}

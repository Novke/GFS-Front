import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PoljeZadatka, ZadatakVezbanja } from '../data-access/portal.models';
import { VezbanjeUnos } from './vezbanje-unos.component';

const polje = (p: Partial<PoljeZadatka> & Pick<PoljeZadatka, 'kljuc' | 'oznaka' | 'tip'>): PoljeZadatka => ({
  odstupanje: null, odstupanjeTip: null, jedinica: null, zanemariVelicinu: null, zanemariRazmake: null, opcije: null, ...p,
});

const ZADATAK: ZadatakVezbanja = {
  pokusajId: 41, tipId: 5, tip: 'Binarni u dekadni', tema: 'Konverzije', nivo: 2, svgId: 'svg-41',
  polja: [
    polje({ kljuc: 'a', oznaka: 'a) dekadna vrednost', tip: 'BROJ', jedinica: 'm' }),
    polje({ kljuc: 'b', oznaka: 'b) izbor', tip: 'JEDAN_TACAN', opcije: [{ id: 1, tekst: 'prvi' }, { id: 2, tekst: 'drugi' }] }),
  ],
};

/** Jedan zadatak za vežbanje: polja kao na času, provera više puta, rešenje tek na zahtev. */
describe('VezbanjeUnos', () => {
  let fixture: ComponentFixture<VezbanjeUnos>;
  let provereno: Record<string, unknown>[];
  let resenja: number;
  let sledeci: number;

  const el = () => fixture.nativeElement as HTMLElement;
  const dugme = (sel: string) => el().querySelector<HTMLButtonElement>(sel)!;
  const unos = (kljuc: string) => el().querySelector<HTMLInputElement>(`input[data-polje="${kljuc}"]`)!;
  const opcija = (tekst: string) =>
    [...el().querySelectorAll<HTMLButtonElement>('button.opcija')].find(b => b.getAttribute('aria-label') === tekst)!;

  function upisi(kljuc: string, v: string): void {
    unos(kljuc).value = v;
    unos(kljuc).dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    provereno = [];
    resenja = 0;
    sledeci = 0;
    fixture = TestBed.createComponent(VezbanjeUnos);
    fixture.componentRef.setInput('zadatak', ZADATAK);
    fixture.componentInstance.proveri.subscribe(v => provereno.push(v));
    fixture.componentInstance.prikaziResenje.subscribe(() => resenja++);
    fixture.componentInstance.sledeci.subscribe(() => sledeci++);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('slika zadatka iz javnog medija; bez tačnih odgovora pre rešenja', () => {
    expect(el().querySelector('img[data-svg="zadatak"]')?.getAttribute('src')).toBe('api/public/mediji/svg-41');
    expect(el().querySelector('[data-tacno]')).toBeNull();
    expect(el().textContent).toContain('a) dekadna vrednost');
  });

  it('"Proveri" tek kad su sva polja popunjena; broj se normalizuje, neispravan broj ostaje kod studenta', () => {
    expect(dugme('[data-proveri]').disabled).toBe(true);
    upisi('a', '1 2,5');
    opcija('drugi').click();
    fixture.detectChanges();
    expect(dugme('[data-proveri]').disabled).toBe(false);
    dugme('[data-proveri]').click();
    expect(provereno).toEqual([{ a: '12,5', b: [2] }]);
    upisi('a', 'x');
    dugme('[data-proveri]').click();
    fixture.detectChanges();
    expect(provereno.length).toBe(1);
    expect(el().textContent).toContain('Unesi broj.');
  });

  it('ishod po polju posle provere; izmena polja skida njegov stari ishod', () => {
    upisi('a', '12');
    opcija('prvi').click();
    fixture.componentRef.setInput('provera', { tacno: false, ishod: { a: true, b: false } });
    fixture.detectChanges();
    const ishodi = [...el().querySelectorAll('[data-ishod]')].map(x => x.textContent?.trim());
    expect(ishodi).toEqual(['Tačno', 'Netačno']);
    expect(el().querySelector('[data-zbir]')?.textContent).toContain('Nije sve tačno');
    upisi('a', '13');
    expect([...el().querySelectorAll('[data-ishod]')].map(x => x.textContent?.trim())).toEqual(['Netačno']);
  });

  it('"Prikaži rešenje" javlja roditelju; rešenje crta tačne vrednosti i sliku rešenja', () => {
    dugme('[data-resenje]').click();
    expect(resenja).toBe(1);
    fixture.componentRef.setInput('resenje', {
      resenjeSvgId: 'res-41',
      tacneVrednosti: { a: { broj: 12.5, prihvatljivi: null, tacna: null, tacne: null }, b: { broj: null, prihvatljivi: null, tacna: 2, tacne: null } },
    });
    fixture.detectChanges();
    const tacno = [...el().querySelectorAll('[data-tacno]')].map(x => x.textContent?.replace(/\s+/g, ' ').trim());
    expect(tacno[0]).toBe('Tačno: 12,5 m');
    expect(tacno[1]).toContain('drugi');
    expect(el().querySelector('img[data-svg="resenje"]')?.getAttribute('src')).toBe('api/public/mediji/res-41');
    expect(el().querySelector('[data-resenje]')).toBeNull();
  });

  it('novi pokušaj briše unete vrednosti; "Sledeći zadatak" javlja roditelju', () => {
    upisi('a', '12');
    fixture.componentRef.setInput('zadatak', { ...ZADATAK, pokusajId: 42 });
    fixture.detectChanges();
    expect(unos('a').value).toBe('');
    dugme('[data-sledeci]').click();
    expect(sledeci).toBe(1);
  });

  it('rad na papiru: bez polja i "Proveri", ostaju rešenje i sledeći', () => {
    fixture.componentRef.setInput('zadatak', { ...ZADATAK, polja: [] });
    fixture.detectChanges();
    expect(el().querySelector('[data-papir]')).not.toBeNull();
    expect(el().querySelector('[data-proveri]')).toBeNull();
    expect(el().querySelector('[data-resenje]')).not.toBeNull();
  });
});

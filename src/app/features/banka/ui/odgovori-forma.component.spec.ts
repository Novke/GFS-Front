import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OdgovorPolja, Polje } from '../data-access/banka.models';
import { novoPolje } from '../data-access/polja';
import { OdgovoriFormaComponent } from './odgovori-forma.component';

const OPCIJE = [{ id: 1, tekst: '4' }, { id: 2, tekst: '8' }, { id: 3, tekst: '12' }];
const BROJ: Polje = { ...novoPolje('BROJ', []), kljuc: 'a', oznaka: 'Vrednost', jedinica: 'cm' };
const TEKST: Polje = { ...novoPolje('TEKST', []), kljuc: 'b', oznaka: 'Binarni zapis' };
const JEDAN: Polje = { ...novoPolje('JEDAN_TACAN', []), kljuc: 'c', oznaka: 'Broj cifara', opcije: OPCIJE };
const VISE: Polje = { ...novoPolje('VISE_TACNIH', []), kljuc: 'd', oznaka: 'Parni', opcije: OPCIJE };

const prazno = { broj: null, prihvatljivi: null, tacna: null, tacne: null };

/** Kontrolisana upotreba, kao na stranici: emitovani odgovori se vraćaju kao nov ulaz. */
@Component({
  imports: [OdgovoriFormaComponent],
  template: `<app-odgovori-forma [polja]="polja()" [odgovori]="odgovori()" [onemoguceno]="onemoguceno()" (odgovoriPromena)="promena($event)" />`,
})
class Host {
  polja = signal<Polje[]>([BROJ, TEKST, JEDAN, VISE]);
  odgovori = signal<Record<string, OdgovorPolja>>({});
  onemoguceno = signal(false);
  emitovano: Record<string, OdgovorPolja>[] = [];
  promena(o: Record<string, OdgovorPolja>): void {
    this.emitovano.push(o);
    this.odgovori.set(o);
  }
}

describe('OdgovoriFormaComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
  });
  afterEach(() => document.body.replaceChildren());

  async function napravi(polja?: Polje[], odgovori?: Record<string, OdgovorPolja>) {
    const f = TestBed.createComponent(Host);
    const h = f.componentInstance;
    if (polja) h.polja.set(polja);
    if (odgovori) h.odgovori.set(odgovori);
    document.body.appendChild(f.nativeElement);
    const stabilno = async () => {
      await f.whenStable();
      await new Promise(r => setTimeout(r));
      await f.whenStable();
    };
    await stabilno();
    const el = f.nativeElement as HTMLElement;
    const polje = (k: string) => el.querySelector<HTMLElement>(`[data-polje="${k}"]`)!;
    const bedz = (k: string) => polje(k).querySelector('[data-bedz]')!.textContent!.trim();
    const unesi = async (input: HTMLInputElement, vrednost: string) => {
      input.value = vrednost;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await stabilno();
    };
    const enter = async (input: HTMLInputElement, vrednost: string, keyCode = 13, key = 'Enter') => {
      input.value = vrednost;
      input.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
      await stabilno();
    };
    const poslednje = () => h.emitovano.at(-1)!;
    return { f, h, el, polje, bedz, unesi, enter, stabilno, poslednje };
  }

  it('grupa bez polja: objašnjenje, ništa za unos', async () => {
    const { el } = await napravi([]);
    expect(el.textContent).toContain('Grupa nema polja odgovora');
    expect(el.querySelectorAll('input').length).toBe(0);
  });

  it('svako polje je grupa sa oznakom i ključem, bedž "Nedostaje" dok odgovor nije popunjen', async () => {
    const { polje, bedz } = await napravi();
    expect(polje('a').querySelector('legend')!.textContent).toContain('Vrednost');
    expect(polje('a').querySelector('legend')!.textContent).toContain('a');
    expect(['a', 'b', 'c', 'd'].map(bedz)).toEqual(['Nedostaje', 'Nedostaje', 'Nedostaje', 'Nedostaje']);
  });

  it('BROJ: broj (i decimalni zarez) emituje {broj}, ostala svojstva null; neispravan unos ostaje "Nedostaje" sa porukom', async () => {
    const { polje, unesi, poslednje, bedz, el } = await napravi();
    const input = polje('a').querySelector<HTMLInputElement>('input')!;
    expect(polje('a').textContent).toContain('cm');
    await unesi(input, '45');
    expect(poslednje()['a']).toEqual({ ...prazno, broj: 45 });
    expect(bedz('a')).toBe('Popunjeno');

    await unesi(input, '1,5');
    expect(poslednje()['a']).toEqual({ ...prazno, broj: 1.5 });
    // prikaz zadržava otkucano
    expect(input.value).toBe('1,5');

    await unesi(input, '1,5x');
    expect(Number.isNaN(poslednje()['a'].broj)).toBe(true);
    expect(bedz('a')).toBe('Nedostaje');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('mat-error')!.textContent).toContain('Unesi broj');

    await unesi(input, '');
    expect(poslednje()['a']).toEqual(prazno);
  });

  it('emituje odgovore za svako polje šeme (prazne za nepopunjena), ne i ključeve van šeme', async () => {
    const { polje, unesi, poslednje } = await napravi(undefined, { z: { ...prazno, broj: 1 } });
    await unesi(polje('a').querySelector<HTMLInputElement>('input')!, '7');
    expect(Object.keys(poslednje())).toEqual(['a', 'b', 'c', 'd']);
    expect(poslednje()['b']).toEqual({ ...prazno, prihvatljivi: [] });
    expect(poslednje()['d']).toEqual({ ...prazno, tacne: [] });
  });

  it('TEKST: Enter dodaje čip (bez razmaka na krajevima, bez duplikata), x ga uklanja', async () => {
    const { polje, enter, poslednje, bedz, stabilno } = await napravi();
    const input = polje('b').querySelector<HTMLInputElement>('input[data-prihvatljiv]')!;
    await enter(input, ' 1011 ');
    expect(poslednje()['b']).toEqual({ ...prazno, prihvatljivi: ['1011'] });
    expect(input.value).toBe('');
    await enter(input, '0b1011');
    await enter(input, '1011');
    expect(poslednje()['b'].prihvatljivi).toEqual(['1011', '0b1011']);
    expect(bedz('b')).toBe('Popunjeno');
    expect([...polje('b').querySelectorAll('mat-chip-row')].map(c => c.textContent!.trim())).toEqual(['1011', '0b1011']);

    polje('b').querySelector<HTMLButtonElement>('button[aria-label="Ukloni 1011"]')!.click();
    await stabilno();
    expect(poslednje()['b'].prihvatljivi).toEqual(['0b1011']);
  });

  it('TEKST: zarez je deo odgovora ((1,0), "q0, q1"), ne razdvaja čipove; uputstvo kaže "Enter dodaje"', async () => {
    const { polje, enter, poslednje } = await napravi();
    const input = polje('b').querySelector<HTMLInputElement>('input[data-prihvatljiv]')!;
    expect(polje('b').querySelector('mat-hint')!.textContent).toContain('Enter dodaje');
    expect(polje('b').querySelector('mat-hint')!.textContent).not.toContain('zarez');
    // zarez kao taster ne pravi čip
    await enter(input, '(1', 188, ',');
    expect(poslednje()).toBeUndefined();
    await enter(input, '(1,0)');
    await enter(input, 'q0, q1');
    expect(poslednje()['b'].prihvatljivi).toEqual(['(1,0)', 'q0, q1']);
    expect([...polje('b').querySelectorAll('mat-chip-row')].map(c => c.textContent!.trim())).toEqual(['(1,0)', 'q0, q1']);
  });

  it('TEKST: najviše 10 odgovora i 200 znakova po odgovoru', async () => {
    const deset = Array.from({ length: 10 }, (_, i) => `o${i}`);
    const { polje, enter, h, el, stabilno } = await napravi([TEKST], { b: { ...prazno, prihvatljivi: deset } });
    const input = polje('b').querySelector<HTMLInputElement>('input[data-prihvatljiv]')!;
    await enter(input, 'jedanaesti');
    expect(h.emitovano).toEqual([]);
    expect(el.textContent).toContain('Najviše 10');

    h.odgovori.set({ b: { ...prazno, prihvatljivi: [] } });
    await stabilno();
    await enter(input, 'x'.repeat(201));
    expect(h.emitovano).toEqual([]);
    expect(el.textContent).toContain('200 znakova');
    expect(input.value).toBe('x'.repeat(201));
  });

  it('JEDAN_TACAN: radio nad opcijama emituje {tacna: id}', async () => {
    const { polje, poslednje, bedz, stabilno } = await napravi();
    const radio = [...polje('c').querySelectorAll<HTMLInputElement>('input[type=radio]')];
    expect(radio.length).toBe(3);
    radio[1].click();
    await stabilno();
    expect(poslednje()['c']).toEqual({ ...prazno, tacna: 2 });
    expect(bedz('c')).toBe('Popunjeno');
  });

  it('VISE_TACNIH: kvačice emituju {tacne} redom opcija; skidanje poslednje vraća "Nedostaje"', async () => {
    const { polje, poslednje, bedz, stabilno } = await napravi();
    const kvacice = () => [...polje('d').querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
    kvacice()[2].click();
    await stabilno();
    kvacice()[0].click();
    await stabilno();
    expect(poslednje()['d']).toEqual({ ...prazno, tacne: [1, 3] });
    expect(bedz('d')).toBe('Popunjeno');
    kvacice()[0].click();
    await stabilno();
    kvacice()[2].click();
    await stabilno();
    expect(poslednje()['d']).toEqual({ ...prazno, tacne: [] });
    expect(bedz('d')).toBe('Nedostaje');
  });

  it('postojeći odgovori se prikazuju', async () => {
    const { polje, bedz } = await napravi(undefined, {
      a: { ...prazno, broj: 2.5 }, b: { ...prazno, prihvatljivi: ['x'] }, c: { ...prazno, tacna: 3 }, d: { ...prazno, tacne: [2] },
    });
    expect(polje('a').querySelector<HTMLInputElement>('input')!.value).toBe('2,5');
    expect(polje('b').querySelectorAll('mat-chip-row').length).toBe(1);
    expect(polje('c').querySelectorAll<HTMLInputElement>('input[type=radio]')[2].checked).toBe(true);
    expect(polje('d').querySelectorAll<HTMLInputElement>('input[type=checkbox]')[1].checked).toBe(true);
    expect(['a', 'b', 'c', 'd'].map(bedz)).toEqual(['Popunjeno', 'Popunjeno', 'Popunjeno', 'Popunjeno']);
  });

  it('onemogućeno: polja se ne menjaju', async () => {
    const { polje, h, stabilno } = await napravi();
    h.onemoguceno.set(true);
    await stabilno();
    expect(polje('a').querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
    expect(polje('c').querySelector<HTMLInputElement>('input[type=radio]')!.disabled).toBe(true);
    expect(polje('d').querySelector<HTMLInputElement>('input[type=checkbox]')!.disabled).toBe(true);
  });
});

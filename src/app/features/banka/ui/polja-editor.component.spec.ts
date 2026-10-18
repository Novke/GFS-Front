import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Polje } from '../data-access/banka.models';
import { novoPolje } from '../data-access/polja';
import { PoljaEditorComponent } from './polja-editor.component';

const broj = (kljuc: string, oznaka = `Rezultat ${kljuc}`): Polje => ({ ...novoPolje('BROJ', []), kljuc, oznaka });
const izbor = (kljuc: string): Polje => ({
  ...novoPolje('JEDAN_TACAN', []), kljuc, oznaka: 'Koliko cifara?', opcije: [{ id: 1, tekst: '4' }, { id: 2, tekst: '8' }],
});

/** Kontrolisana upotreba, kao na stranici: svaka emitovana lista se vraća kao nov ulaz. */
@Component({
  imports: [PoljaEditorComponent],
  template: `<app-polja-editor [polja]="polja()" [sacuvanaPolja]="sacuvana()" [tipZakljucan]="zakljucan()" (poljaPromena)="promena($event)" />`,
})
class Host {
  polja = signal<Polje[]>([broj('a')]);
  sacuvana = signal<Polje[]>([broj('a')]);
  zakljucan = signal(false);
  emitovano: Polje[][] = [];
  promena(p: Polje[]): void {
    this.emitovano.push(p);
    this.polja.set(p);
  }
}

describe('PoljaEditorComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
  });
  afterEach(() => document.body.replaceChildren());

  async function napravi(pocetna?: Partial<{ polja: Polje[]; sacuvana: Polje[]; zakljucan: boolean }>) {
    const f = TestBed.createComponent(Host);
    const h = f.componentInstance;
    if (pocetna?.polja) h.polja.set(pocetna.polja);
    if (pocetna?.sacuvana) h.sacuvana.set(pocetna.sacuvana);
    if (pocetna?.zakljucan !== undefined) h.zakljucan.set(pocetna.zakljucan);
    document.body.appendChild(f.nativeElement);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const stabilno = async () => {
      await f.whenStable();
      await new Promise(r => setTimeout(r));
      await f.whenStable();
    };
    const red = (k: string) => el.querySelector<HTMLElement>(`[data-polje="${k}"]`)!;
    const klik = async (e: HTMLElement) => {
      e.click();
      await stabilno();
    };
    const unesi = async (input: HTMLInputElement, vrednost: string) => {
      input.value = vrednost;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await stabilno();
    };
    /** Bira tip polja `k` kroz mat-select. */
    const izaberiTip = async (k: string, naziv: string) => {
      red(k).querySelector<HTMLElement>('[data-tip] .mat-mdc-select-trigger')!.click();
      await stabilno();
      [...document.querySelectorAll<HTMLElement>('mat-option')].find(o => o.textContent!.trim() === naziv)!.click();
      await stabilno();
    };
    const poruka = () => el.querySelector<HTMLElement>('[data-greska-polja]');
    return { f, h, el, red, klik, unesi, izaberiTip, poruka, stabilno };
  }

  it('prikazuje ključ samo za čitanje, oznaku i tip svakog polja', async () => {
    const { red } = await napravi({ polja: [broj('a'), izbor('b')] });
    expect(red('a').querySelector('[data-kljuc]')!.textContent).toContain('a');
    expect(red('a').querySelector('input[data-kljuc]')).toBeNull();
    expect(red('a').querySelector<HTMLInputElement>('input[data-oznaka]')!.value).toBe('Rezultat a');
    expect(red('a').querySelector('[data-tip]')!.textContent).toContain('Broj');
    expect(red('b').querySelector('[data-tip]')!.textContent).toContain('Jedan tačan');
    expect(red('b').querySelectorAll('input[data-opcija]')).toHaveLength(2);
    expect(red('a').querySelectorAll('input[data-opcija]')).toHaveLength(0);
  });

  it('"+ polje" dodaje polje sa sledećim slobodnim ključem (ni ključ sačuvanog obrisanog polja), fokus na njegovu oznaku', async () => {
    const { h, el, klik, red } = await napravi({ polja: [broj('b')], sacuvana: [broj('a'), broj('b')] });
    await klik(el.querySelector<HTMLElement>('[data-dodaj-polje]')!);
    expect(h.polja().map(p => p.kljuc)).toEqual(['b', 'c']);
    expect(h.polja()[1]).toMatchObject({ tip: 'BROJ', oznaka: '' });
    expect(document.activeElement).toBe(red('c').querySelector('input[data-oznaka]'));
  });

  it('"+ polje" je onemogućeno na 10 polja', async () => {
    const deset = 'abcdefghij'.split('').map(k => broj(k));
    const { h, el, klik } = await napravi({ polja: deset });
    const dugme = el.querySelector<HTMLButtonElement>('[data-dodaj-polje]')!;
    expect(dugme.getAttribute('aria-disabled') === 'true' || dugme.disabled).toBe(true);
    await klik(dugme);
    expect(h.emitovano).toHaveLength(0);
  });

  it('izmena oznake emituje novu listu sa novom oznakom', async () => {
    const { h, red, unesi } = await napravi();
    await unesi(red('a').querySelector<HTMLInputElement>('input[data-oznaka]')!, 'Vrednost');
    expect(h.emitovano.at(-1)).toEqual([{ ...broj('a'), oznaka: 'Vrednost' }]);
  });

  it('tip JEDAN_TACAN pokazuje dve prazne opcije; nazad na BROJ ih uklanja', async () => {
    const { h, red, izaberiTip } = await napravi();
    expect(red('a').querySelector('[data-odstupanje]')).not.toBeNull();
    await izaberiTip('a', 'Jedan tačan');
    expect(h.polja()[0].tip).toBe('JEDAN_TACAN');
    expect(h.polja()[0].opcije).toEqual([{ id: 1, tekst: '' }, { id: 2, tekst: '' }]);
    expect(red('a').querySelectorAll('input[data-opcija]')).toHaveLength(2);
    expect(red('a').querySelector('[data-odstupanje]')).toBeNull();
    await izaberiTip('a', 'Broj');
    expect(h.polja()[0].opcije).toBeNull();
    expect(red('a').querySelectorAll('input[data-opcija]')).toHaveLength(0);
  });

  it('opcije: "+ opcija" dodaje novu sa sledećim id-jem (najviše 6), brisanje je blokirano na 2', async () => {
    const { h, red, klik, unesi } = await napravi({ polja: [izbor('a')] });
    const obrisi = () => [...red('a').querySelectorAll<HTMLButtonElement>('[data-obrisi-opciju]')];
    expect(obrisi().every(b => b.getAttribute('aria-disabled') === 'true' || b.disabled)).toBe(true);
    await klik(obrisi()[0]);
    expect(h.emitovano).toHaveLength(0);

    await klik(red('a').querySelector<HTMLElement>('[data-dodaj-opciju]')!);
    expect(h.polja()[0].opcije).toEqual([{ id: 1, tekst: '4' }, { id: 2, tekst: '8' }, { id: 3, tekst: '' }]);
    expect(document.activeElement).toBe(red('a').querySelectorAll('input[data-opcija]')[2]);
    await unesi(red('a').querySelectorAll<HTMLInputElement>('input[data-opcija]')[2], '12');
    expect(h.polja()[0].opcije![2]).toEqual({ id: 3, tekst: '12' });

    await klik(obrisi()[0]);
    expect(h.polja()[0].opcije).toEqual([{ id: 2, tekst: '8' }, { id: 3, tekst: '12' }]);

    for (let i = 0; i < 4; i++) await klik(red('a').querySelector<HTMLElement>('[data-dodaj-opciju]')!);
    expect(h.polja()[0].opcije).toHaveLength(6);
    const dodaj = red('a').querySelector<HTMLButtonElement>('[data-dodaj-opciju]')!;
    expect(dodaj.getAttribute('aria-disabled') === 'true' || dodaj.disabled).toBe(true);
  });

  it('id nove opcije je iznad svakog id-ja sačuvanog polja: obrisana sačuvana opcija se ne vraća pod istim id-jem', async () => {
    const sacuvano: Polje = { ...izbor('a'), opcije: [{ id: 1, tekst: '4' }, { id: 2, tekst: '8' }, { id: 3, tekst: '12' }] };
    const { h, red, klik } = await napravi({ polja: [sacuvano], sacuvana: [sacuvano] });
    await klik(red('a').querySelectorAll<HTMLElement>('[data-obrisi-opciju]')[2]);
    expect(h.polja()[0].opcije!.map(o => o.id)).toEqual([1, 2]);
    await klik(red('a').querySelector<HTMLElement>('[data-dodaj-opciju]')!);
    expect(h.polja()[0].opcije).toEqual([{ id: 1, tekst: '4' }, { id: 2, tekst: '8' }, { id: 4, tekst: '' }]);
  });

  it('tip tamo-nazad (izbor -> BROJ -> izbor) daje sveže id-jeve opcija, ne 1 i 2 sačuvanog polja', async () => {
    const sacuvano: Polje = { ...izbor('a'), opcije: [{ id: 1, tekst: '4' }, { id: 2, tekst: '8' }, { id: 3, tekst: '12' }] };
    const { h, izaberiTip } = await napravi({ polja: [sacuvano], sacuvana: [sacuvano] });
    await izaberiTip('a', 'Broj');
    expect(h.polja()[0].opcije).toBeNull();
    await izaberiTip('a', 'Više tačnih');
    expect(h.polja()[0].opcije).toEqual([{ id: 4, tekst: '' }, { id: 5, tekst: '' }]);
  });

  it('TEKST: prekidači velikih slova i razmaka', async () => {
    const { h, red, izaberiTip, klik } = await napravi();
    await izaberiTip('a', 'Tekst');
    const velika = red('a').querySelector<HTMLInputElement>('[data-zanemari-velicinu] input')!;
    expect(velika.checked).toBe(true);
    await klik(velika);
    expect(h.polja()[0]).toMatchObject({ tip: 'TEKST', zanemariVelicinu: false, zanemariRazmake: true });
  });

  it('BROJ: odstupanje prima decimalni zarez, tip odstupanja i jedinicu', async () => {
    const { h, red, unesi } = await napravi();
    const odstupanje = red('a').querySelector<HTMLInputElement>('input[data-odstupanje]')!;
    await unesi(odstupanje, '0,5');
    expect(h.polja()[0].odstupanje).toBe(0.5);
    expect(odstupanje.value).toBe('0,5');
    await unesi(red('a').querySelector<HTMLInputElement>('input[data-jedinica]')!, 'kN');
    expect(h.polja()[0].jedinica).toBe('kN');
    await unesi(odstupanje, 'abc');
    expect(Number.isNaN(h.polja()[0].odstupanje)).toBe(true);
    // neispravan unos ostaje u polju (ne briše se dok korisnik kuca)
    expect(odstupanje.value).toBe('abc');
  });

  it('brisanje polja i pomeranje gore/dole; fokus ostaje na dugmetu pomerenog polja', async () => {
    const { h, red, klik } = await napravi({ polja: [broj('a'), broj('b'), broj('c')] });
    await klik(red('c').querySelector<HTMLElement>('[data-gore]')!);
    expect(h.polja().map(p => p.kljuc)).toEqual(['a', 'c', 'b']);
    expect(document.activeElement).toBe(red('c').querySelector('[data-gore]'));
    const prviGore = red('a').querySelector<HTMLButtonElement>('[data-gore]')!;
    expect(prviGore.getAttribute('aria-disabled')).toBe('true');
    await klik(prviGore);
    expect(h.emitovano).toHaveLength(1);

    await klik(red('c').querySelector<HTMLElement>('[data-obrisi-polje]')!);
    expect(h.polja().map(p => p.kljuc)).toEqual(['a', 'b']);
    // fokus na brisanje polja koje je došlo na mesto obrisanog
    expect(document.activeElement).toBe(red('b').querySelector('[data-obrisi-polje]'));
  });

  it('poruka prve prekršene provere je ispod liste (role=status), tek kad se iz polja izađe; prazna šema je ispravna', async () => {
    const { el, red, unesi, poruka, klik, stabilno } = await napravi();
    expect(poruka()!.getAttribute('role')).toBe('status');
    expect(poruka()!.textContent!.trim()).toBe('');
    const oznaka = red('a').querySelector<HTMLInputElement>('input[data-oznaka]')!;
    await unesi(oznaka, '   ');
    // dok kuca, ništa se ne najavljuje
    expect(poruka()!.textContent!.trim()).toBe('');
    expect(oznaka.getAttribute('aria-invalid')).toBe('false');
    oznaka.dispatchEvent(new FocusEvent('blur'));
    await stabilno();
    expect(poruka()!.textContent).toContain('Oznaka polja mora imati 1 do 200 znakova.');
    expect(oznaka.getAttribute('aria-invalid')).toBe('true');
    expect(oznaka.getAttribute('aria-describedby')!.split(' ')).toContain(poruka()!.id);
    // posle izlaska greška prati kucanje
    await unesi(oznaka, 'Vrednost');
    expect(poruka()!.textContent!.trim()).toBe('');
    expect(oznaka.getAttribute('aria-invalid')).toBe('false');
    expect(oznaka.getAttribute('aria-describedby') ?? '').not.toContain(poruka()!.id);
    await unesi(oznaka, '');
    expect(poruka()!.textContent).toContain('Oznaka polja');
    await klik(red('a').querySelector<HTMLElement>('[data-obrisi-polje]')!);
    expect(poruka()!.textContent!.trim()).toBe('');
    expect(el.textContent).toContain('Grupa još nema polja');
  });

  it('"+ polje": nova prazna oznaka ne prekida porukom; posle izlaska greška je na toj oznaci', async () => {
    const { el, red, klik, poruka, stabilno } = await napravi();
    await klik(el.querySelector<HTMLElement>('[data-dodaj-polje]')!);
    const oznaka = red('b').querySelector<HTMLInputElement>('input[data-oznaka]')!;
    expect(document.activeElement).toBe(oznaka);
    expect(poruka()!.textContent!.trim()).toBe('');
    oznaka.dispatchEvent(new FocusEvent('blur'));
    await stabilno();
    expect(poruka()!.textContent).toContain('Oznaka polja mora imati 1 do 200 znakova.');
    expect(oznaka.getAttribute('aria-invalid')).toBe('true');
    expect(red('a').querySelector('input[data-oznaka]')!.getAttribute('aria-invalid')).toBe('false');
  });

  it('greška opcije je na toj opciji (aria-invalid i aria-describedby)', async () => {
    const { red, unesi, poruka, stabilno } = await napravi({ polja: [izbor('a')], sacuvana: [izbor('a')] });
    const opcije = () => [...red('a').querySelectorAll<HTMLInputElement>('input[data-opcija]')];
    await unesi(opcije()[1], '');
    opcije()[1].dispatchEvent(new FocusEvent('blur'));
    await stabilno();
    expect(poruka()!.textContent).toContain("Tekst opcije polja 'a' mora imati 1 do 200 znakova.");
    expect(opcije().map(o => o.getAttribute('aria-invalid'))).toEqual(['false', 'true']);
    expect(opcije()[1].getAttribute('aria-describedby')!.split(' ')).toContain(poruka()!.id);
  });

  it('aktivne varijante: tip sačuvanog polja je zaključan sa objašnjenjem, a novo polje bira tip slobodno', async () => {
    const { el, red, klik } = await napravi({ zakljucan: true });
    const tip = red('a').querySelector<HTMLElement>('mat-select[data-tip]')!;
    expect(tip.getAttribute('aria-disabled')).toBe('true');
    expect(red('a').textContent).toContain('Grupa ima aktivne varijante: tip polja se ne menja');
    await klik(el.querySelector<HTMLElement>('[data-dodaj-polje]')!);
    expect(red('b').querySelector('mat-select[data-tip]')!.getAttribute('aria-disabled')).toBe('false');
    expect(red('b').textContent).not.toContain('tip polja se ne menja');
  });
});

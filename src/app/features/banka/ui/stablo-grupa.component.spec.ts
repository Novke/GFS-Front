import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GrupaCvor } from '../data-access/banka.models';
import { StabloGrupaComponent } from './stablo-grupa.component';

function cvor(id: number, naziv: string, deca: GrupaCvor[] = [], izmena: Partial<GrupaCvor> = {}): GrupaCvor {
  return {
    id, naziv, rb: id, tezina: deca.length ? null : 2, list: deca.length === 0, brojVarijanti: 0, brojAktivnih: 0, brojNacrta: 0,
    brojGresaka: 0, deca, izvor: 'RUCNO', brojClaudeNacrta: 0, iskljucena: false, iskljucenjeId: null, ...izmena,
  };
}

/** Konverzije (1) -> "2 → 10" (2) i "16 → 2" (3); Osnove (4). */
const STABLO: GrupaCvor[] = [
  cvor(1, 'Konverzije brojeva', [
    cvor(2, '2 → 10', [], { brojVarijanti: 3, brojAktivnih: 1, brojNacrta: 2, brojGresaka: 1 }),
    cvor(3, '16 → 2', [], { brojVarijanti: 1, brojAktivnih: 1 }),
  ], { brojVarijanti: 4, brojAktivnih: 2, brojNacrta: 2, brojGresaka: 1 }),
  cvor(4, 'Osnove'),
];

@Component({
  imports: [StabloGrupaComponent],
  template: `<app-stablo-grupa [cvorovi]="cvorovi()" [izabrano]="izabrano()" [zauzeto]="zauzeto()" (izaberi)="izaberi($event)"
    (dodajPodgrupu)="dodajPodgrupu($event)" (preimenuj)="preimenuj($event)" (premesti)="premesti($event)" (obrisi)="obrisi($event)" />`,
})
class Host {
  cvorovi = signal<GrupaCvor[]>(STABLO);
  izabrano = signal<number | null>(2);
  zauzeto = signal(false);
  izaberi = vi.fn();
  dodajPodgrupu = vi.fn();
  preimenuj = vi.fn();
  premesti = vi.fn();
  obrisi = vi.fn();
}

describe('StabloGrupaComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
  });

  async function napravi() {
    const f = TestBed.createComponent(Host);
    document.body.appendChild(f.nativeElement);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const stavka = (id: number) => el.querySelector<HTMLElement>(`[role=treeitem][data-id="${id}"]`)!;
    const tipka = async (id: number, key: string) => {
      stavka(id).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await f.whenStable();
    };
    return { f, el, h: f.componentInstance, stavka, tipka };
  }

  it('crta ugnježdeno stablo: tree, treeitem i group, naziv i opis brojača u imenu stavke', async () => {
    const { el, stavka } = await napravi();
    expect(el.querySelectorAll('[role=tree]')).toHaveLength(1);
    expect(el.querySelectorAll('[role=treeitem]')).toHaveLength(4);
    expect(stavka(1).querySelector('[role=group]')!.querySelectorAll('[role=treeitem]')).toHaveLength(2);
    expect(stavka(2).getAttribute('aria-label')).toBe('2 → 10, 1 aktivna, 2 nacrta, 1 greška');
    expect(stavka(4).getAttribute('aria-label')).toBe('Osnove');
    // bedževi su samo vizuelni (broj je u imenu stavke); nula se ne prikazuje
    expect(stavka(3).querySelectorAll('.bk-bedz')).toHaveLength(1);
    expect(stavka(2).querySelector('.bk-bedz-greske')!.textContent!.trim()).toBe('1');
  });

  it('Klodovi nacrti: bedž "Klod: N" (i broj u imenu stavke); isključena grupa i njeno podstablo su prigušeni, sa oznakom "Isključeno"', async () => {
    const { h, f, stavka } = await napravi();
    h.cvorovi.set([
      cvor(1, 'Konverzije brojeva', [
        cvor(2, '8 → 2 (Klod)', [], { izvor: 'CLAUDE', brojVarijanti: 4, brojAktivnih: 1, brojNacrta: 3, brojClaudeNacrta: 2 }),
        cvor(3, 'Razlomljeni', [cvor(5, 'Decimalni', [], { iskljucena: true, iskljucenjeId: 7 })], { iskljucena: true, iskljucenjeId: 7 }),
      ], { brojVarijanti: 4, brojAktivnih: 1, brojNacrta: 3, brojClaudeNacrta: 2 }),
    ]);
    await f.whenStable();
    const red = (id: number) => stavka(id).querySelector(':scope > .bk-red')!;

    expect(red(2).querySelector('.bk-bedz-claude')!.textContent!.trim()).toBe('Klod: 2');
    expect(red(1).querySelector('.bk-bedz-claude')!.textContent!.trim()).toBe('Klod: 2');
    expect(red(3).querySelector('.bk-bedz-claude')).toBeNull();
    expect(stavka(2).getAttribute('aria-label')).toBe('8 → 2 (Klod), 1 aktivna, 3 nacrta, 2 Klodova nacrta');

    expect(red(3).classList).toContain('bk-iskljucen');
    expect(red(5).classList).toContain('bk-iskljucen');
    expect(red(1).classList).not.toContain('bk-iskljucen');
    expect(red(2).classList).not.toContain('bk-iskljucen');
    expect(red(3).querySelector('.bk-bedz-iskljuceno')!.textContent!.trim()).toBe('Isključeno');
    expect(red(2).querySelector('.bk-bedz-iskljuceno')).toBeNull();
    expect(stavka(3).getAttribute('aria-label')).toBe('Razlomljeni, isključeno');
    expect(stavka(5).getAttribute('aria-label')).toBe('Decimalni, isključeno');
  });

  it('aria-expanded samo za čvor sa decom, aria-selected za izabranu, jedna stavka u Tab redu', async () => {
    const { el, stavka } = await napravi();
    expect(stavka(1).getAttribute('aria-expanded')).toBe('true');
    expect(stavka(2).hasAttribute('aria-expanded')).toBe(false);
    expect(stavka(2).getAttribute('aria-selected')).toBe('true');
    expect(stavka(3).getAttribute('aria-selected')).toBe('false');
    const uRedu = [...el.querySelectorAll<HTMLElement>('[role=treeitem]')].filter(s => s.tabIndex === 0);
    expect(uRedu.map(s => s.dataset['id'])).toEqual(['2']);
  });

  it('Enter i klik emituju izaberi', async () => {
    const { h, stavka, tipka } = await napravi();
    await tipka(3, 'Enter');
    expect(h.izaberi).toHaveBeenLastCalledWith(3);
    stavka(4).querySelector<HTMLElement>('.bk-naziv')!.click();
    expect(h.izaberi).toHaveBeenLastCalledWith(4);
  });

  it('strelice gore/dole pomeraju fokus po vidljivim stavkama, Home/End na krajeve', async () => {
    const { stavka, tipka } = await napravi();
    stavka(2).focus();
    await tipka(2, 'ArrowDown');
    expect(document.activeElement).toBe(stavka(3));
    await tipka(3, 'ArrowDown');
    expect(document.activeElement).toBe(stavka(4));
    await tipka(4, 'ArrowDown');
    expect(document.activeElement).toBe(stavka(4));
    await tipka(4, 'Home');
    expect(document.activeElement).toBe(stavka(1));
    await tipka(1, 'ArrowUp');
    expect(document.activeElement).toBe(stavka(1));
    await tipka(1, 'End');
    expect(document.activeElement).toBe(stavka(4));
    expect(stavka(4).tabIndex).toBe(0);
    expect(stavka(2).tabIndex).toBe(-1);
  });

  it('levo sklapa (pa ide na roditelja), desno rasklapa (pa ide na prvo dete); sklopljena deca se preskaču', async () => {
    const { el, stavka, tipka } = await napravi();
    stavka(2).focus();
    await tipka(2, 'ArrowLeft');
    expect(document.activeElement).toBe(stavka(1));
    await tipka(1, 'ArrowLeft');
    expect(stavka(1).getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelectorAll('[role=treeitem]')).toHaveLength(2);
    await tipka(1, 'ArrowDown');
    expect(document.activeElement).toBe(stavka(4));
    await tipka(4, 'ArrowUp');
    await tipka(1, 'ArrowRight');
    expect(stavka(1).getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(stavka(1));
    await tipka(1, 'ArrowRight');
    expect(document.activeElement).toBe(stavka(2));
  });

  it('desno pa odmah desno (pre crtanja dece) fokusira prvo dete', async () => {
    const { stavka, tipka, f } = await napravi();
    stavka(1).focus();
    await tipka(1, 'ArrowLeft');
    expect(stavka(1).getAttribute('aria-expanded')).toBe('false');
    const desno = () => stavka(1).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    desno();
    desno();
    await f.whenStable();
    expect(document.activeElement).toBe(stavka(2));
  });

  it('klik na strelicu sklapa i rasklapa bez izbora', async () => {
    const { h, stavka, f } = await napravi();
    stavka(1).querySelector<HTMLElement>('.bk-strelica')!.click();
    await f.whenStable();
    expect(stavka(1).getAttribute('aria-expanded')).toBe('false');
    expect(h.izaberi).not.toHaveBeenCalled();
  });

  it('izabrana grupa u sklopljenom čvoru rasklapa pretke', async () => {
    const { h, stavka, tipka, f } = await napravi();
    stavka(1).focus();
    await tipka(1, 'ArrowLeft');
    expect(stavka(1).getAttribute('aria-expanded')).toBe('false');
    h.izabrano.set(3);
    await f.whenStable();
    expect(stavka(1).getAttribute('aria-expanded')).toBe('true');
    expect(stavka(3).getAttribute('aria-selected')).toBe('true');
  });

  it('F2 otvara polje sa nazivom; Enter emituje preimenuj sa novim nazivom bez razmaka i vraća fokus', async () => {
    const { h, stavka, tipka, f } = await napravi();
    stavka(3).focus();
    await tipka(3, 'F2');
    const polje = stavka(3).querySelector<HTMLInputElement>('input')!;
    expect(polje.value).toBe('16 → 2');
    expect(polje.getAttribute('aria-label')).toBe('Nov naziv grupe 16 → 2');
    expect(document.activeElement).toBe(polje);
    polje.value = '  Heksadekadno u binarno ';
    polje.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await f.whenStable();
    expect(h.preimenuj).toHaveBeenCalledExactlyOnceWith({ id: 3, naziv: 'Heksadekadno u binarno' });
    expect(h.izaberi).not.toHaveBeenCalled();
    expect(stavka(3).querySelector('input')).toBeNull();
    expect(document.activeElement).toBe(stavka(3));
  });

  it('Esc odustaje od preimenovanja; isti ili prazan naziv ne emituje ništa', async () => {
    const { h, stavka, tipka, f } = await napravi();
    stavka(4).focus();
    await tipka(4, 'F2');
    let polje = stavka(4).querySelector<HTMLInputElement>('input')!;
    polje.value = 'Nešto drugo';
    polje.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await f.whenStable();
    expect(stavka(4).querySelector('input')).toBeNull();
    await tipka(4, 'F2');
    polje = stavka(4).querySelector<HTMLInputElement>('input')!;
    polje.value = '   ';
    polje.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await f.whenStable();
    expect(h.preimenuj).not.toHaveBeenCalled();
  });

  it('meni stavke: dodaj podgrupu, preimenuj (polje), premesti i obriši; zabranjeno je onemogućeno', async () => {
    const { h, stavka, f } = await napravi();
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    const otvori = async (id: number) => {
      stavka(id).querySelector<HTMLButtonElement>('button.bk-meni-dugme')!.click();
      await f.whenStable();
      return [...overlay.querySelectorAll<HTMLButtonElement>('[role=menuitem]')];
    };

    // unutrašnji čvor: podgrupa da, brisanje ne (prvo podgrupe)
    let stavke = await otvori(1);
    expect(stavke.map(s => s.textContent!.trim())).toEqual(['Dodaj podgrupu', 'Preimenuj', 'Premesti u…', 'Obriši']);
    expect(stavke[3].getAttribute('aria-disabled')).toBe('true');
    stavke[0].click();
    expect(h.dodajPodgrupu).toHaveBeenCalledExactlyOnceWith(1);
    await f.whenStable();

    // list sa varijantama ne prima podgrupe; brisanje i premeštanje da
    stavke = await otvori(2);
    expect(stavke[0].getAttribute('aria-disabled')).toBe('true');
    stavke[2].click();
    expect(h.premesti).toHaveBeenCalledExactlyOnceWith(2);
    await f.whenStable();
    stavke = await otvori(2);
    stavke[3].click();
    expect(h.obrisi).toHaveBeenCalledExactlyOnceWith(2);
    await f.whenStable();

    // preimenuj iz menija otvara polje u stablu
    stavke = await otvori(4);
    stavke[1].click();
    await f.whenStable();
    await new Promise(r => setTimeout(r));
    expect(document.activeElement).toBe(stavka(4).querySelector('input'));
  });

  it('posle brisanja (stavka nestane iz stabla) fokus ide na roditeljsku stavku; otkazano brisanje ne pomera fokus', async () => {
    const { h, stavka, f } = await napravi();
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    const brisi = async (id: number) => {
      stavka(id).querySelector<HTMLButtonElement>('button.bk-meni-dugme')!.click();
      await f.whenStable();
      [...overlay.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(s => s.textContent!.includes('Obriši'))!.click();
      await f.whenStable();
    };

    // otkazano: stablo se osveži (npr. posle druge izmene), grupa je još tu, fokus ostaje na dugmetu menija
    await brisi(3);
    const dugme = stavka(3).querySelector<HTMLButtonElement>('button.bk-meni-dugme')!;
    dugme.focus();
    h.cvorovi.set(structuredClone(STABLO));
    await f.whenStable();
    expect(document.activeElement).toBe(stavka(3).querySelector('button.bk-meni-dugme'));

    // obrisana: stranica osveži stablo bez nje
    await brisi(3);
    stavka(3).querySelector<HTMLButtonElement>('button.bk-meni-dugme')!.focus();
    h.cvorovi.set([cvor(1, 'Konverzije brojeva', [STABLO[0].deca[0]]), STABLO[1]]);
    await f.whenStable();
    expect(stavka(3)).toBeNull();
    expect(document.activeElement).toBe(stavka(1));
  });

  it('zauzeto onemogućava dodavanje i brisanje u meniju', async () => {
    const { h, stavka, f } = await napravi();
    h.zauzeto.set(true);
    await f.whenStable();
    stavka(4).querySelector<HTMLButtonElement>('button.bk-meni-dugme')!.click();
    await f.whenStable();
    const stavke = [...TestBed.inject(OverlayContainer).getContainerElement().querySelectorAll<HTMLButtonElement>('[role=menuitem]')];
    expect(stavke.map(s => s.getAttribute('aria-disabled') === 'true')).toEqual([true, false, false, true]);
  });

  it('dugme menija je u Tab redu samo uz aktivnu stavku', async () => {
    const { stavka } = await napravi();
    expect(stavka(2).querySelector<HTMLElement>('button.bk-meni-dugme')!.tabIndex).toBe(0);
    expect(stavka(3).querySelector<HTMLElement>('button.bk-meni-dugme')!.tabIndex).toBe(-1);
  });
});

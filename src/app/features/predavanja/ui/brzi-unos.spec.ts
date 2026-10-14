import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { StudentListItem } from '../../../core/api/studenti.api';
import { BrziUnos, pogociBrzogUnosa } from './brzi-unos';

const s = (id: number, indeks: string, prezime: string, godina: number | null = 2025): StudentListItem => ({
  id,
  ime: 'Ime' + id,
  prezime,
  indeks,
  godina,
  email: null,
  brojTelefona: null,
  grupa: null,
});

const STUDENTI = [s(1, 'GD12', 'Marković'), s(2, 'GD1', 'Radić'), s(3, 'GD2', 'Đorđević'), s(4, 'AR 7', 'Ilić'), s(5, 'GD14', 'Kostić', 2024)];

@Component({
  imports: [BrziUnos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-brzi-unos [studenti]="studenti()" (izabran)="izabrani.push($event)" />`,
})
class Domacin {
  readonly studenti = signal(STUDENTI);
  readonly izabrani: number[] = [];
}

describe('pogociBrzogUnosa', () => {
  const ids = (q: string) => pogociBrzogUnosa(STUDENTI, q).map(x => x.id);

  it('gd12 nalazi GD12 (bez obzira na velika i mala slova)', () => {
    expect(ids('gd12')).toEqual([1]);
  });

  it('gd1: GD1 i GD12 (i GD14), tačan indeks prvi', () => {
    expect(ids('gd1')).toEqual([2, 1, 5]);
  });

  it('indeks bez razmaka: "ar7" i "AR 7" nalaze AR 7; prefiks, ne sredina', () => {
    expect(ids('ar7')).toEqual([4]);
    expect(ids('AR 7')).toEqual([4]);
    expect(ids('D12')).toEqual([]);
  });

  it('indeks sa godinom: GD14/2024', () => {
    expect(ids('gd14/2024')).toEqual([5]);
  });

  it('prezime: prefiks, bez obzira na mala slova i dijakritike', () => {
    expect(ids('mark')).toEqual([1]);
    expect(ids('djor')).toEqual([3]);
    expect(ids('đor')).toEqual([3]);
    expect(ids('kos')).toEqual([5]);
  });

  it('prazan upit nema pogodaka', () => {
    expect(ids('  ')).toEqual([]);
  });
});

describe('BrziUnos', () => {
  let domacin: Domacin;
  let el: HTMLElement;
  let input: HTMLInputElement;

  beforeEach(() => {
    const fixture = TestBed.createComponent(Domacin);
    domacin = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    input = el.querySelector('input')!;
  });

  function kucaj(tekst: string) {
    input.value = tekst;
    input.dispatchEvent(new Event('input'));
  }

  const taster = (key: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const osvezi = () => TestBed.tick();
  const opcije = () => [...el.querySelectorAll<HTMLElement>('[role=option]')];
  const istaknut = () => el.querySelector<HTMLElement>('[role=option][aria-selected=true]');

  it('gd1 sa GD1 i GD12: ističe prvi (GD1); Enter emituje njegov id i briše polje', () => {
    kucaj('gd1');
    osvezi();
    expect(opcije().map(o => o.dataset['student'])).toEqual(['2', '1', '5']);
    expect(istaknut()?.dataset['student']).toBe('2');
    expect(input.getAttribute('aria-activedescendant')).toBe(istaknut()!.id);

    taster('Enter');
    osvezi();
    expect(domacin.izabrani).toEqual([2]);
    expect(input.value).toBe('');
    expect(opcije()).toHaveLength(0);
  });

  it('gd12: jedini pogodak, Enter ga bira', () => {
    kucaj('gd12');
    osvezi();
    taster('Enter');
    expect(domacin.izabrani).toEqual([1]);
  });

  it('strelice menjaju istaknuti (kružno), Enter bira istaknuti', () => {
    kucaj('gd1');
    osvezi();
    taster('ArrowDown');
    osvezi();
    expect(istaknut()?.dataset['student']).toBe('1');
    taster('ArrowUp');
    taster('ArrowUp');
    osvezi();
    expect(istaknut()?.dataset['student']).toBe('5');
    taster('Enter');
    expect(domacin.izabrani).toEqual([5]);
  });

  it('Esc briše upit; Enter bez pogotka ne emituje ništa', () => {
    kucaj('gd1');
    osvezi();
    taster('Escape');
    osvezi();
    expect(input.value).toBe('');
    expect(opcije()).toHaveLength(0);
    kucaj('xyz');
    osvezi();
    taster('Enter');
    expect(domacin.izabrani).toEqual([]);
    expect(el.textContent).toContain('Nema studenta');
  });

  it('klik na pogodak ga bira', () => {
    kucaj('rad');
    osvezi();
    opcije()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(domacin.izabrani).toEqual([2]);
  });
});

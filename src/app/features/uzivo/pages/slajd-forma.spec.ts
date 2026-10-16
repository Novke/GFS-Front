import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { platno } from '../data-access/platno-podaci.testing';
import { SlajdCmd, SlajdDetails } from '../data-access/uzivo.models';
import { SlajdFormaComponent } from './slajd-forma.component';

function platnoSlajd(): SlajdDetails {
  return {
    id: 4, rb: 2, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske: 'Stare', postepeno: false,
    pitanje: null, platno: platno(),
  };
}

describe('SlajdFormaComponent: PLATNO', () => {
  let fixture: ComponentFixture<SlajdFormaComponent>;
  let emitovano: SlajdCmd[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SlajdFormaComponent],
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    fixture = TestBed.createComponent(SlajdFormaComponent);
    fixture.componentRef.setInput('slajd', platnoSlajd());
    emitovano = [];
    fixture.componentInstance.izmena.subscribe(c => emitovano.push(c));
    fixture.detectChanges();
  });

  it('prikazuje samo beleške (slojeve uređuje editor platna iznad forme, bez stare napomene)', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('textarea').length).toBe(1);
    expect(el.querySelector('input')).toBeNull();
    expect(el.textContent).not.toContain('se za sada ne uređuju ovde');
  });

  it('izmena beleški emituje PLATNO komandu sa istim platnom i novim beleškama', () => {
    const polje = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    polje.value = 'Nove beleške';
    polje.dispatchEvent(new Event('input'));
    expect(emitovano.length).toBe(1);
    expect(emitovano[0].tip).toBe('PLATNO');
    expect(emitovano[0].beleske).toBe('Nove beleške');
    expect(emitovano[0].platno).toEqual(platno());
    expect(emitovano[0].pitanje).toBeNull();
  });
});

describe('SlajdFormaComponent: Pretvori u platno (F10)', () => {
  const slajd = (tip: SlajdDetails['tip']): SlajdDetails => ({
    id: 5, rb: 1, tip, naslov: tip === 'INFO' ? 'Uvod' : null, sadrzaj: null, slika: null, beleske: null, postepeno: false,
    pitanje: tip === 'PITANJE' ? {
      id: 9, tip: 'JEDAN_TACAN', tekst: 'Koliko?', slika: null, vremeSekunde: null,
      opcije: [{ id: 1, rb: 1, tekst: 'Jedan', tacna: true }, { id: 2, rb: 2, tekst: 'Dva', tacna: false }],
      brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
      prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null,
    } : null,
    platno: tip === 'PLATNO' ? platno() : null,
  });

  function napravi(tip: SlajdDetails['tip']): ComponentFixture<SlajdFormaComponent> {
    TestBed.configureTestingModule({
      imports: [SlajdFormaComponent],
      providers: [provideHttpClient(), { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    const f = TestBed.createComponent(SlajdFormaComponent);
    f.componentRef.setInput('slajd', slajd(tip));
    f.detectChanges();
    return f;
  }

  const dugme = (f: ComponentFixture<SlajdFormaComponent>) =>
    [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find(b => b.textContent?.trim() === 'Pretvori u platno');

  it('INFO: dugme "Pretvori u platno" (sa opisom) emituje pretvori, bez izmene forme', () => {
    const f = napravi('INFO');
    const pretvori = vi.fn();
    const izmena = vi.fn();
    f.componentInstance.pretvori.subscribe(pretvori);
    f.componentInstance.izmena.subscribe(izmena);
    const b = dugme(f)!;
    expect(b).toBeDefined();
    expect(b.type).toBe('button');
    const opis = document.getElementById(b.getAttribute('aria-describedby')!)!;
    expect(opis.textContent).toContain('Slajd postaje platno sa slojevima (naslov, tekst, slika)');
    b.click();
    expect(pretvori).toHaveBeenCalledTimes(1);
    expect(izmena).not.toHaveBeenCalled();
  });

  it.each(['PITANJE', 'PLATNO'] as const)('%s: nema dugmeta "Pretvori u platno"', tip => {
    expect(dugme(napravi(tip))).toBeUndefined();
  });
});

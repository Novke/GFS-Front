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

  it('prikazuje samo beleške i napomenu o slojevima', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('textarea').length).toBe(1);
    expect(el.querySelector('input')).toBeNull();
    expect(el.textContent).toContain('Slojevi i animacije ovog slajda se za sada ne uređuju ovde; menjaju se beleške.');
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

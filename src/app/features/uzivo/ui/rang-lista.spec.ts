import { TestBed } from '@angular/core/testing';
import { RangStavka } from '../data-access/uzivo.models';
import { PostoljeComponent } from './postolje.component';
import { RangListaComponent } from './rang-lista.component';

const stavke: RangStavka[] = [
  { mesto: 1, ucesnikId: null, ime: 'Milica', poeni: 4350 },
  { mesto: 2, ucesnikId: null, ime: 'Nikola', poeni: 3980 },
  { mesto: 3, ucesnikId: null, ime: 'Ana', poeni: 950 },
  { mesto: 4, ucesnikId: null, ime: 'Stefan', poeni: 0 },
];

describe('RangListaComponent', () => {
  it('ističe stavku po mestu (javno stanje nema ucesnikId), poeni grupisani', () => {
    const fixture = TestBed.createComponent(RangListaComponent);
    fixture.componentRef.setInput('stavke', stavke);
    fixture.componentRef.setInput('istakni', 2);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const istaknut = el.querySelector('[aria-current="true"]');
    expect(istaknut?.textContent).toContain('Nikola');
    expect(el.querySelectorAll('.uz-rang-red--istaknut').length).toBe(1);
    expect(el.querySelector('.uz-rang-poeni')?.textContent).toBe('4 350');
  });

  it('prazna lista daje poruku', () => {
    const fixture = TestBed.createComponent(RangListaComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Još nema poena.');
  });
});

describe('PostoljeComponent', () => {
  it('samo prva tri, čitač ekrana ih čita redom 1, 2, 3', () => {
    const fixture = TestBed.createComponent(PostoljeComponent);
    fixture.componentRef.setInput('stavke', [stavke[2], stavke[3], stavke[0], stavke[1]]);
    fixture.detectChanges();
    const kolone = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.uz-postolje-kolona'));
    expect(kolone.map(k => k.dataset['mesto'])).toEqual(['1', '2', '3']);
    expect(kolone[0].textContent).toContain('Milica');
  });
});

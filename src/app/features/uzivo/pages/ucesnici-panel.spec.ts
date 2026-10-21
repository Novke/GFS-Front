import { ComponentFixture, TestBed } from '@angular/core/testing';
import { naZadatku } from '../data-access/izvodjenje-podaci.testing';
import { NastavnickiZadatak, UcesnikStanje } from '../data-access/uzivo.models';
import { UcesniciPanelComponent } from './ucesnici-panel.component';

describe('UcesniciPanelComponent', () => {
  const ucesnici: UcesnikStanje[] = [
    { id: 1, ime: 'Ana', poeni: 0, povezan: true, odgovorio: true, varijantaId: 11, tacno: true },
    { id: 2, ime: 'Bojan', poeni: 0, povezan: true, odgovorio: true, varijantaId: 12, tacno: false },
    { id: 3, ime: 'Ceca', poeni: 0, povezan: false, odgovorio: false, varijantaId: 11, tacno: null },
    // ušla posle otvaranja, još bez dodele (dobija je pri prvom ličnom snimku)
    { id: 4, ime: 'Dara', poeni: 0, povezan: true, odgovorio: false, varijantaId: null, tacno: null },
  ];

  function prikazi(zadatak: NastavnickiZadatak | null, lista: UcesnikStanje[] = ucesnici): ComponentFixture<UcesniciPanelComponent> {
    const f = TestBed.createComponent(UcesniciPanelComponent);
    f.componentRef.setInput('ucesnici', lista);
    f.componentRef.setInput('zadatak', zadatak);
    f.detectChanges();
    return f;
  }

  const redovi = (f: ComponentFixture<unknown>) =>
    Array.from((f.nativeElement as HTMLElement).querySelectorAll('li')).map(li => (li.textContent ?? '').replace(/\s+/g, ' ').trim());

  it('Zadatak runda: uz ime varijanta i ishod (tačno, netačno, nije odgovorio); bez dodele ništa', () => {
    const f = prikazi(naZadatku('ZATVORENO').zadatak!);
    const [ana, bojan, ceca, dara] = redovi(f);
    expect(ana).toContain('V11');
    expect(ana).toContain('tačno');
    expect(ana).not.toContain('netačno');
    expect(bojan).toContain('V12');
    expect(bojan).toContain('netačno');
    expect(ceca).toContain('V11');
    expect(ceca).toContain('nije odgovorio');
    expect(dara).not.toMatch(/V1\d/);
    expect(dara).not.toContain('odgovorio');
    const varijanta = (f.nativeElement as HTMLElement).querySelector('.uz-kon-varijanta');
    expect(varijanta?.getAttribute('title')).toBe('Varijanta V11');
  });

  it('varijanta bez naziva dobija redni broj izvučene; rad na papiru piše "na papiru"', () => {
    const z = naZadatku('ZATVORENO', { polja: [] }).zadatak!;
    const f = prikazi({ ...z, varijante: z.varijante!.map((v, i) => (i === 1 ? { ...v, naziv: null } : v)) });
    const [ana, bojan] = redovi(f);
    expect(ana).toContain('na papiru');
    expect(ana).not.toContain('tačno');
    expect(bojan).toContain('V2');
  });

  it('van Zadatak runde: bez varijante i ishoda (kao do sada)', () => {
    const f = prikazi(null, ucesnici.map(u => ({ ...u, varijantaId: null, tacno: null })));
    for (const r of redovi(f)) {
      expect(r).not.toMatch(/V1\d|tačno|odgovorio/);
    }
    const f2 = prikazi(naZadatku('CEKA').zadatak!, [{ id: 1, ime: 'Ana', poeni: 0, povezan: true, odgovorio: false }]);
    expect(redovi(f2)[0]).not.toContain('nije odgovorio');
  });
});

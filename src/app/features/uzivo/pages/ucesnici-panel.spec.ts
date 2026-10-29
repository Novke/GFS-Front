import { ComponentFixture, TestBed } from '@angular/core/testing';
import { naZadatku } from '../data-access/izvodjenje-podaci.testing';
import { NastavnickiZadatak, UcesnikStanje } from '../data-access/uzivo.models';
import { UcesniciPanelComponent, redosledOdgovora } from './ucesnici-panel.component';

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

  it('ovo pitanje: odgovorili po brzini (redni broj, vreme, ✓/✗, kratak odgovor), ostali ispod redom prijave', () => {
    const lista: UcesnikStanje[] = [
      { id: 1, ime: 'Ana', poeni: 0, povezan: true, odgovorio: false },
      { id: 2, ime: 'Bojan', poeni: 0, povezan: true, odgovorio: true, tacno: false, vremeMs: 5200, odgovor: 'B' },
      { id: 3, ime: 'Ceca', poeni: 0, povezan: true, odgovorio: true, tacno: true, vremeMs: 2100, odgovor: 'A, C' },
      { id: 4, ime: 'Dara', poeni: 0, povezan: false, odgovorio: true, tacno: null, vremeMs: 3000, odgovor: 'zelena', odgovorSakriven: true },
    ];
    expect(redosledOdgovora(lista).map(r => [r.u.ime, r.rb])).toEqual([['Ceca', 1], ['Dara', 2], ['Bojan', 3], ['Ana', null]]);
    const f = prikazi(null, lista);
    const [ceca, dara, bojan, ana] = redovi(f);
    expect(ceca).toContain('1.');
    expect(ceca).toContain('A, C');
    expect(ceca).toContain('2,1 s');
    expect(dara).toContain('(sakriveno) zelena');
    expect(bojan).toContain('5,2 s');
    expect(ana).not.toMatch(/\d,\d s/);
    const ikone = Array.from((f.nativeElement as HTMLElement).querySelectorAll('li')).map(li => li.querySelector('mat-icon[aria-label]')?.getAttribute('aria-label') ?? null);
    expect(ikone.slice(0, 3)).toEqual(['tačno', 'odgovorio', 'netačno']);
  });

  it('stari backend bez vremena: odgovorili ostaju redom prijave', () => {
    const lista: UcesnikStanje[] = [
      { id: 1, ime: 'Ana', poeni: 0, povezan: true, odgovorio: true },
      { id: 2, ime: 'Bojan', poeni: 0, povezan: true, odgovorio: true },
    ];
    expect(redosledOdgovora(lista).map(r => r.u.ime)).toEqual(['Ana', 'Bojan']);
  });
});

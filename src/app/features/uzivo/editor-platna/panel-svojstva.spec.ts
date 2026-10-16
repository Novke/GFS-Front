import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { platno } from '../data-access/platno-podaci.testing';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { OtpremanjeSlike } from './otpremanje-slike';
import { PanelSvojstvaComponent } from './panel-svojstva.component';
import { PlatnoEditorStore } from './platno-editor.store';
import { type LazniSat, oznakePolja, provajderiSvojstava } from './svojstva.testing';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlatnoEditorStore, OtpremanjeSlike],
  imports: [PanelSvojstvaComponent],
  template: `<app-panel-svojstva tema="NACRT" />`,
})
class DomacinComponent {}

describe('PanelSvojstvaComponent', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: PlatnoEditorStore;
  const el = () => fixture.nativeElement as HTMLElement;
  const ima = (selektor: string) => el().querySelector(selektor) !== null;

  beforeEach(async () => {
    const sat: LazniSat = { t: 0 };
    TestBed.configureTestingModule({ providers: [...provajderiSvojstava(sat), { provide: PrezentacijeApi, useValue: {} }] });
    fixture = TestBed.createComponent(DomacinComponent);
    store = fixture.debugElement.children[0].injector.get(PlatnoEditorStore);
    store.postaviIzlaz(vi.fn());
    store.inicijalizuj(platno());
    await fixture.whenStable();
  });

  it.each([
    [[], ['app-svojstva-slajda']],
    [['oblik'], ['app-svojstva-oblika', 'app-svojstva-sloja']],
    [['tekst'], ['app-svojstva-oblika', 'app-svojstva-sloja']],
    [['slika'], ['app-svojstva-slike', 'app-svojstva-sloja']],
    [['tabela'], ['app-svojstva-sloja']],
    [['formula'], ['app-svojstva-sloja']],
    [['crtez'], ['app-svojstva-sloja']],
    [['oblik', 'slika'], ['app-svojstva-sloja']],
  ])('izbor %j -> %j', async (izbor, delovi) => {
    store.izaberi(izbor);
    await fixture.whenStable();
    const svi = ['app-svojstva-slajda', 'app-svojstva-sloja', 'app-svojstva-oblika', 'app-svojstva-slike'];
    expect(svi.filter(ima)).toEqual(svi.filter((s) => delovi.includes(s)));
  });

  it('CRTEZ, TABELA i FORMULA u 4a: samo zajednička polja', async () => {
    store.izaberi(['formula']);
    await fixture.whenStable();
    expect(oznakePolja(el())).toEqual(['X', 'Y', 'Širina', 'Visina', 'Rotacija', 'Providnost']);
  });

  it('izbor sloja pa poništen izbor vraća svojstva slajda', async () => {
    store.izaberi(['oblik']);
    await fixture.whenStable();
    store.ponistiIzbor();
    await fixture.whenStable();
    expect(ima('app-svojstva-slajda')).toBe(true);
    expect(ima('app-svojstva-sloja')).toBe(false);
  });
});

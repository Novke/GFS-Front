import { CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { Platno } from '../data-access/platno.models';
import { platno, platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { FokusPlatna } from './fokus-platna';
import { PanelSlojeviComponent } from './panel-slojevi.component';
import { PlatnoEditorStore } from './platno-editor.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlatnoEditorStore, FokusPlatna],
  imports: [PanelSlojeviComponent],
  template: `<app-panel-slojevi />`,
})
class DomacinComponent {}

describe('PanelSlojeviComponent', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: InstanceType<typeof PlatnoEditorStore>;
  let izlaz: ReturnType<typeof vi.fn<(p: Platno) => void>>;
  const el = () => fixture.nativeElement as HTMLElement;
  const redovi = () => Array.from(el().querySelectorAll<HTMLElement>('[data-sloj-panel]'));
  const red = (id: string) => el().querySelector<HTMLElement>(`[data-sloj-panel="${id}"]`)!;
  const dugmeU = (r: HTMLElement, ime: string) => r.querySelector<HTMLButtonElement>(`button[aria-label="${ime}"]`)!;
  const ime = (r: HTMLElement) => r.querySelector<HTMLButtonElement>('.uz-ep-sloj-ime')!;

  async function pocni(p: Platno) {
    store.inicijalizuj(p);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(DomacinComponent);
    store = fixture.debugElement.children[0].injector.get(PlatnoEditorStore);
    izlaz = vi.fn<(p: Platno) => void>();
    store.postaviIzlaz(izlaz);
    await pocni(platno());
  });

  it('redosled je od vrha z-ose ka dnu, sa nazivima slojeva', () => {
    expect(redovi().map((r) => r.dataset['slojPanel'])).toEqual(['crtez', 'formula', 'tabela', 'oblik', 'slika', 'tekst']);
    expect(ime(red('oblik')).textContent!.trim()).toBe('Elipsa 1');
    expect(ime(red('tekst')).textContent!.trim()).toBe('Tekst: Prvi');
  });

  it('klik na ime bira sloj (aria-pressed), Shift+klik dodaje ili uklanja iz izbora', async () => {
    ime(red('oblik')).click();
    await fixture.whenStable();
    expect(store.izbor()).toEqual(['oblik']);
    expect(ime(red('oblik')).getAttribute('aria-pressed')).toBe('true');
    expect(ime(red('slika')).getAttribute('aria-pressed')).toBe('false');
    ime(red('slika')).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    expect(store.izbor()).toEqual(['oblik', 'slika']);
    ime(red('oblik')).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    expect(store.izbor()).toEqual(['slika']);
  });

  it('"Zaključaj" ima stalnu labelu: aria-pressed i ikona prate stanje, izmena ide izlazu', async () => {
    const dugme = () => dugmeU(red('oblik'), 'Zaključaj');
    expect(dugme().getAttribute('aria-pressed')).toBe('false');
    dugme().click();
    await fixture.whenStable();
    expect(store.platno().slojevi.find((s) => s.id === 'oblik')!.zakljucan).toBe(true);
    expect(izlaz).toHaveBeenCalledTimes(1);
    expect(dugme()).not.toBeNull();
    expect(red('oblik').querySelector('button[aria-label="Otključaj"]')).toBeNull();
    expect(dugme().getAttribute('aria-pressed')).toBe('true');
    expect(dugme().querySelector('mat-icon')!.getAttribute('data-mat-icon-name')).toBe('lock');
    expect(dugme().title).toContain('Zaključan');
    dugme().click();
    await fixture.whenStable();
    expect(store.platno().slojevi.find((s) => s.id === 'oblik')!.zakljucan).toBe(false);
    expect(dugme().getAttribute('aria-pressed')).toBe('false');
    expect(dugme().querySelector('mat-icon')!.getAttribute('data-mat-icon-name')).toBe('lock_open');
  });

  it('"Sakrij u editoru" ima stalnu labelu: sklanja sloj iz zaPrikaz bez izlaza, aria-pressed prati stanje', async () => {
    const dugme = () => dugmeU(red('slika'), 'Sakrij u editoru');
    expect(dugme().getAttribute('aria-pressed')).toBe('false');
    dugme().click();
    await fixture.whenStable();
    expect(store.zaPrikaz().slojevi.map((s) => s.id)).not.toContain('slika');
    expect(izlaz).not.toHaveBeenCalled();
    expect(red('slika').querySelector('button[aria-label="Prikaži u editoru"]')).toBeNull();
    expect(dugme().getAttribute('aria-pressed')).toBe('true');
    expect(dugme().title).toContain('Skriven');
    dugme().click();
    await fixture.whenStable();
    expect(store.zaPrikaz().slojevi.map((s) => s.id)).toContain('slika');
    expect(dugme().getAttribute('aria-pressed')).toBe('false');
  });

  it('preimenovanje: Enter čuva naziv, Esc odustaje', async () => {
    dugmeU(red('oblik'), 'Preimenuj').click();
    await fixture.whenStable();
    let polje = red('oblik').querySelector<HTMLInputElement>('input[aria-label="Naziv sloja"]')!;
    expect(polje.maxLength).toBe(60);
    expect(polje.value).toBe('Elipsa 1');
    expect(document.activeElement).toBe(polje);
    polje.value = 'Sunce';
    polje.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(store.platno().slojevi.find((s) => s.id === 'oblik')!.naziv).toBe('Sunce');
    expect(red('oblik').querySelector('input')).toBeNull();
    expect(ime(red('oblik')).textContent!.trim()).toBe('Sunce');
    expect(izlaz).toHaveBeenCalledTimes(1);

    dugmeU(red('oblik'), 'Preimenuj').click();
    await fixture.whenStable();
    polje = red('oblik').querySelector<HTMLInputElement>('input[aria-label="Naziv sloja"]')!;
    polje.value = 'Mesec';
    polje.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(store.platno().slojevi.find((s) => s.id === 'oblik')!.naziv).toBe('Sunce');
    expect(red('oblik').querySelector('input')).toBeNull();
    expect(izlaz).toHaveBeenCalledTimes(1);
  });

  it('spuštanje u obrnutoj listi (0 -> 2) premešta sloj na pravi indeks dokumenta', () => {
    const lista = fixture.debugElement.query(By.directive(CdkDropList)).injector.get(CdkDropList);
    lista.dropped.emit({ previousIndex: 0, currentIndex: 2 } as CdkDragDrop<unknown>);
    expect(store.platno().slojevi.map((s) => s.id)).toEqual(['tekst', 'slika', 'oblik', 'crtez', 'tabela', 'formula']);
    expect(izlaz).toHaveBeenCalledTimes(1);
  });

  it('prazan slajd: poruka umesto liste', async () => {
    await pocni(platnoSaAnimacijama([], []));
    expect(redovi()).toHaveLength(0);
    expect(el().textContent).toContain('Slajd još nema slojeva. Dodaj ih iz trake iznad platna.');
  });
});

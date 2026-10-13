import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { NotificationStore, type Poruka } from '../../../core/state/notification.store';
import type { Platno } from '../data-access/platno.models';
import { platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { PanelSvojstvaComponent } from './panel-svojstva.component';
import { PlatnoEditorStore } from './platno-editor.store';
import { type LazniSat, dugme, provajderiSvojstava } from './svojstva.testing';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlatnoEditorStore],
  imports: [PanelSvojstvaComponent],
  template: `<app-panel-svojstva tema="PAPIR" />`,
})
class DomacinComponent {}

describe('SvojstvaSlajdaComponent (kroz panel Svojstva, ništa izabrano)', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: PlatnoEditorStore;
  let izlaz: ReturnType<typeof vi.fn<(p: Platno) => void>>;
  let upload: ReturnType<typeof vi.fn>;
  let poruke: Poruka[];
  const sat: LazniSat = { t: 0 };
  const el = () => fixture.nativeElement as HTMLElement;
  const fajlPolje = () => el().querySelector<HTMLInputElement>('app-svojstva-slajda input[type="file"]')!;

  async function izaberiFajl(f: File) {
    Object.defineProperty(fajlPolje(), 'files', { configurable: true, value: [f] });
    fajlPolje().dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    sat.t = 0;
    localStorage.clear();
    upload = vi.fn(() => of({ id: 'pozadina-uuid', naziv: 'p.png', mime: 'image/png', velicina: 4 }));
    TestBed.configureTestingModule({
      providers: [...provajderiSvojstava(sat), { provide: PrezentacijeApi, useValue: { upload } }],
    });
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe((p) => poruke.push(p));
    fixture = TestBed.createComponent(DomacinComponent);
    store = fixture.debugElement.children[0].injector.get(PlatnoEditorStore);
    izlaz = vi.fn<(p: Platno) => void>();
    store.postaviIzlaz(izlaz);
    store.inicijalizuj(platnoSaAnimacijama([], []));
    await fixture.whenStable();
  });

  it('bez izbora panel pokazuje svojstva slajda', () => {
    expect(el().querySelector('app-svojstva-slajda')).not.toBeNull();
    expect(el().querySelector('app-svojstva-sloja')).toBeNull();
    expect(el().querySelector('app-izbor-boje button')!.getAttribute('aria-label')).toBe('Pozadina: #FFFFFF');
  });

  it('boja pozadine iz teme -> pozadina.boja (ključ polje-pozadina: dve boje u 1 s su jedan korak)', async () => {
    const izaberi = async (uzorak: string) => {
      el().querySelector<HTMLButtonElement>('app-izbor-boje button')!.click();
      await fixture.whenStable();
      dugme(document.querySelector('.uz-ep-paleta')!, uzorak)!.click();
      await fixture.whenStable();
    };
    await izaberi('Pozadina, #FAF7F2');
    expect(store.platno().pozadina).toEqual({ boja: '#FAF7F2', medijId: null });
    sat.t = 300;
    await izaberi('Akcent 1, #1F6F78');
    expect(store.platno().pozadina.boja).toBe('#1F6F78');
    expect(izlaz).toHaveBeenCalledTimes(2);
    store.ponisti();
    expect(store.platno().pozadina.boja).toBe('#FFFFFF');
    expect(store.mozeNazad()).toBe(false);
    // "Bez" ne postoji za pozadinu (boja je obavezna)
    el().querySelector<HTMLButtonElement>('app-izbor-boje button')!.click();
    await fixture.whenStable();
    expect(dugme(document.querySelector('.uz-ep-paleta')!, 'Bez')).toBeNull();
  });

  it('slika pozadine -> pozadina.medijId; "Ukloni" -> null', async () => {
    expect(dugme(el(), 'Ukloni')).toBeNull();
    await izaberiFajl(new File([new Uint8Array([1])], 'p.png', { type: 'image/png' }));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(store.platno().pozadina).toEqual({ boja: '#FFFFFF', medijId: 'pozadina-uuid' });
    expect(dugme(el(), 'Zameni sliku pozadine')).not.toBeNull();
    dugme(el(), 'Ukloni')!.click();
    await fixture.whenStable();
    expect(store.platno().pozadina.medijId).toBeNull();
    expect(dugme(el(), 'Ukloni')).toBeNull();
  });

  it('greška otpremanja pozadine -> poruka sa razlogom servera', async () => {
    upload.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { reason: 'Neispravna slika.' } })));
    await izaberiFajl(new File([new Uint8Array([1])], 'p.png', { type: 'image/png' }));
    expect(poruke).toEqual([expect.objectContaining({ tip: 'greska', tekst: 'Neispravna slika.' })]);
    expect(store.platno().pozadina.medijId).toBeNull();
  });
});

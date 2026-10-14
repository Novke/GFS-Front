import { CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { Platno, TekstSloj } from '../data-access/platno.models';
import { animacija, pasus, platno, platnoSaAnimacijama } from '../data-access/platno-podaci.testing';
import { NotificationStore } from '../../../core/state/notification.store';
import { PanelAnimacijeComponent } from './panel-animacije.component';
import { PlatnoEditorStore } from './platno-editor.store';
import { type LazniSat, dugme, oznakePolja, polje, provajderiSvojstava, upisi } from './svojstva.testing';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlatnoEditorStore],
  imports: [PanelAnimacijeComponent],
  template: `<app-panel-animacije />`,
})
class DomacinComponent {}

describe('PanelAnimacijeComponent', () => {
  let fixture: ComponentFixture<DomacinComponent>;
  let store: PlatnoEditorStore;
  let izlaz: ReturnType<typeof vi.fn<(p: Platno) => void>>;
  const sat: LazniSat = { t: 0 };
  const el = () => fixture.nativeElement as HTMLElement;
  const redovi = () => Array.from(el().querySelectorAll<HTMLElement>('[data-animacija]'));
  const tekstRedova = () => redovi().map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
  const stavke = () => Array.from(document.body.querySelectorAll<HTMLElement>('.mat-mdc-menu-item'));
  const opcije = () => Array.from(document.querySelectorAll<HTMLElement>('mat-option'));
  const bez = (): Platno => ({ ...platno(), animacije: [] });

  async function pocni(p: Platno, izbor: string[] = []) {
    store.inicijalizuj(p);
    store.izaberi(izbor);
    await fixture.whenStable();
  }

  async function dodaj(vrsta: 'Dodaj ulaz' | 'Dodaj izlaz', efekat: string) {
    const d = dugme(el(), vrsta)!;
    expect(d.disabled).toBe(false);
    d.click();
    await fixture.whenStable();
    stavke().find((s) => s.textContent!.trim() === efekat)!.click();
    await fixture.whenStable();
  }

  async function izaberiOpciju(oznaka: string, tekst: string) {
    const f = Array.from(el().querySelectorAll<HTMLElement>('mat-form-field'))
      .find((x) => x.querySelector('mat-label')?.textContent?.trim() === oznaka)!;
    f.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
    await fixture.whenStable();
    opcije().find((o) => o.textContent!.trim().startsWith(tekst))!.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    sat.t = 0;
    TestBed.configureTestingModule({ providers: provajderiSvojstava(sat) });
    fixture = TestBed.createComponent(DomacinComponent);
    store = fixture.debugElement.children[0].injector.get(PlatnoEditorStore);
    izlaz = vi.fn<(p: Platno) => void>();
    store.postaviIzlaz(izlaz);
    await pocni(bez());
  });

  afterEach(() => document.body.querySelectorAll('.cdk-overlay-container').forEach((o) => (o.innerHTML = '')));

  it('prazno: poruka; bez tačno jednog izabranog sloja "Dodaj ulaz" i "Dodaj izlaz" su onemogućeni', async () => {
    expect(el().textContent).toContain('Slajd nema animacija. Izaberi sloj i dodaj ulaz ili izlaz.');
    expect(dugme(el(), 'Dodaj ulaz')!.disabled).toBe(true);
    expect(dugme(el(), 'Dodaj izlaz')!.disabled).toBe(true);
    store.izaberi(['oblik', 'slika']);
    await fixture.whenStable();
    expect(dugme(el(), 'Dodaj ulaz')!.disabled).toBe(true);
    store.izaberi(['oblik']);
    await fixture.whenStable();
    expect(dugme(el(), 'Dodaj ulaz')!.disabled).toBe(false);
  });

  it('meni nudi efekte sloja (ISCRTAJ samo za crtež); "Ulet" -> red sa brojem 1, izabran, jedan korak', async () => {
    await pocni(bez(), ['oblik']);
    dugme(el(), 'Dodaj ulaz')!.click();
    await fixture.whenStable();
    expect(stavke().map((s) => s.textContent!.trim())).toEqual(['Pojavi', 'Postepeno', 'Ulet', 'Podeli', 'Brisanje', 'Zum']);
    stavke().find((s) => s.textContent!.trim() === 'Ulet')!.click();
    await fixture.whenStable();
    expect(store.platno().animacije).toEqual([expect.objectContaining({
      id: 'a1', slojId: 'oblik', vrsta: 'ULAZ', efekat: 'ULET', smer: 'DOLE', okidac: 'KLIK', trajanjeMs: 500,
    })]);
    expect(izlaz).toHaveBeenCalledTimes(1);
    expect(tekstRedova()).toEqual(['1 Elipsa 1 Ulaz · Ulet']);
    expect(store.izabranaAnimacija()).toBe('a1');
    expect(redovi()[0].querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
    await pocni(bez(), ['crtez']);
    dugme(el(), 'Dodaj izlaz')!.click();
    await fixture.whenStable();
    expect(stavke().map((s) => s.textContent!.trim())).toContain('Iscrtaj');
    stavke().find((s) => s.textContent!.trim() === 'Iscrtaj')!.click();
    await fixture.whenStable();
    expect(store.platno().animacije[0]).toMatchObject({ vrsta: 'IZLAZ', efekat: 'ISCRTAJ', smer: 'LEVO' });
  });

  it('broj grupe samo na KLIK redu; ostali bez broja (uvučeni, ikona okidača); klik na red bira animaciju i njen sloj', async () => {
    await pocni(platno());
    expect(tekstRedova()).toEqual([
      '1 Tekst: Prvi · pasus 1 Ulaz · Postepeno', 'Slika 1 Ulaz · Zum', 'Elipsa 1 Ulaz · Pojavi', '2 Elipsa 1 Izlaz · Postepeno',
    ]);
    const r = redovi();
    expect(r[1].classList).toContain('uz-ep-anim--uvucena');
    expect(r[1].querySelector('mat-icon[aria-label="Sa prethodnim"]')).toBeTruthy();
    expect(r[2].querySelector('mat-icon[aria-label="Posle prethodnog"]')).toBeTruthy();
    r[2].querySelector('button')!.click();
    await fixture.whenStable();
    expect(store.izabranaAnimacija()).toBe('a3');
    expect(store.izbor()).toEqual(['oblik']);
    // izbor drugog sloja (npr. na platnu) skida izabranu animaciju
    store.izaberi(['slika']);
    await fixture.whenStable();
    expect(store.izabranaAnimacija()).toBeNull();
  });

  it('detalji: "Smer" samo za efekat sa smerom; promena efekta usklađuje smer; trajanje 1,5 -> 1500, POJAVI onemogućava trajanje', async () => {
    await pocni(bez(), ['oblik']);
    await dodaj('Dodaj ulaz', 'Postepeno');
    expect(oznakePolja(el())).toEqual(['Efekat', 'Okidač', 'Trajanje (s)', 'Kašnjenje (s)']);
    await izaberiOpciju('Efekat', 'Ulet');
    expect(oznakePolja(el())).toEqual(['Efekat', 'Smer', 'Okidač', 'Trajanje (s)', 'Kašnjenje (s)']);
    expect(store.platno().animacije[0].smer).toBe('DOLE');
    await izaberiOpciju('Smer', 'Sleva');
    expect(store.platno().animacije[0].smer).toBe('LEVO');
    await upisi(fixture, polje(el(), 'Trajanje (s)')!, '1,5');
    expect(store.platno().animacije[0].trajanjeMs).toBe(1500);
    await upisi(fixture, polje(el(), 'Kašnjenje (s)')!, '0.25');
    expect(store.platno().animacije[0].kasnjenjeMs).toBe(250);
    await upisi(fixture, polje(el(), 'Trajanje (s)')!, '42');
    expect(store.platno().animacije[0].trajanjeMs).toBe(10_000);
    await izaberiOpciju('Okidač', 'Posle prethodnog');
    expect(store.platno().animacije[0].okidac).toBe('POSLE_PRETHODNOG');
    await izaberiOpciju('Efekat', 'Pojavi');
    expect(store.platno().animacije[0]).toMatchObject({ efekat: 'POJAVI', smer: null, trajanjeMs: 0 });
    expect(polje(el(), 'Trajanje (s)')!.disabled).toBe(true);
  });

  it('uzastopne izmene istog brojčanog polja u roku od 1 s su jedan korak', async () => {
    await pocni(platnoSaAnimacijama([animacija('a1', 's1')], bez().slojevi.map((s) => ({ ...s, id: 's1' })).slice(0, 1)));
    store.izaberiAnimaciju('a1');
    await fixture.whenStable();
    await upisi(fixture, polje(el(), 'Trajanje (s)')!, '1');
    sat.t = 500;
    await upisi(fixture, polje(el(), 'Trajanje (s)')!, '2');
    expect(store.platno().animacije[0].trajanjeMs).toBe(2000);
    store.ponisti();
    expect(store.platno().animacije[0].trajanjeMs).toBe(500);
  });

  it('"Pomeri gore", "Pomeri dole" (onemogućeni na krajevima) i "Obriši" (bira sledeću)', async () => {
    await pocni(platno());
    redovi()[1].querySelector('button')!.click();
    await fixture.whenStable();
    dugme(el(), 'Pomeri gore')!.click();
    await fixture.whenStable();
    expect(store.platno().animacije.map((a) => a.id)).toEqual(['a2', 'a1', 'a3', 'a4']);
    expect(dugme(el(), 'Pomeri gore')!.disabled).toBe(true);
    dugme(el(), 'Pomeri dole')!.click();
    await fixture.whenStable();
    expect(store.platno().animacije.map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
    dugme(el(), 'Obriši')!.click();
    await fixture.whenStable();
    expect(store.platno().animacije.map((a) => a.id)).toEqual(['a1', 'a3', 'a4']);
    expect(store.izabranaAnimacija()).toBe('a3');
    store.izaberiAnimaciju('a4');
    await fixture.whenStable();
    expect(dugme(el(), 'Pomeri dole')!.disabled).toBe(true);
    dugme(el(), 'Obriši')!.click();
    await fixture.whenStable();
    expect(store.izabranaAnimacija()).toBe('a3');
  });

  it('prevlačenje reda (CdkDragDrop) -> premeštanje u dokumentu', async () => {
    await pocni(platno());
    const lista = fixture.debugElement.query(By.directive(CdkDropList));
    lista.triggerEventHandler('cdkDropListDropped', { previousIndex: 0, currentIndex: 2 } as CdkDragDrop<unknown>);
    await fixture.whenStable();
    expect(store.platno().animacije.map((a) => a.id)).toEqual(['a2', 'a3', 'a1', 'a4']);
    expect(izlaz).toHaveBeenCalledTimes(1);
  });

  describe('cilj za TEKST', () => {
    const tekstSamo = (p: Platno, t: string[]): Platno => ({
      ...p, slojevi: p.slojevi.map((s) => (s.id === 'tekst' ? { ...(s as TekstSloj), pasusi: t.map(pasus) } : s)),
    });
    const dvaPasusa = (): Platno => ({
      ...bez(),
      slojevi: bez().slojevi.map((s) => (s.id === 'tekst' ? { ...(s as TekstSloj), pasusi: [pasus('Prvi red'), pasus('Drugi red je dugačak i ide dalje')] } : s)),
    });

    it('"Cilj" postoji samo za tekst; "Po pasusima" -> 2 reda sa " · pasus 1" i " · pasus 2"', async () => {
      await pocni(dvaPasusa(), ['oblik']);
      expect(oznakePolja(el())).not.toContain('Cilj');
      store.izaberi(['tekst']);
      await fixture.whenStable();
      expect(oznakePolja(el())).toContain('Cilj');
      el().querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
      await fixture.whenStable();
      expect(opcije().map((o) => o.textContent!.trim())).toEqual([
        'Ceo sloj', 'Po pasusima', 'Pasus 1: Prvi red', 'Pasus 2: Drugi red je dugačak',
      ]);
      opcije()[1].click();
      await fixture.whenStable();
      await dodaj('Dodaj ulaz', 'Postepeno');
      expect(tekstRedova()).toEqual(['1 Tekst: Prvi red · pasus 1 Ulaz · Postepeno', '2 Tekst: Prvi red · pasus 2 Ulaz · Postepeno']);
      expect(store.platno().animacije.map((a) => a.pasus)).toEqual([0, 1]);
      expect(izlaz).toHaveBeenCalledTimes(1);
    });

    it('"Pasus 2" -> jedna animacija sa pasus: 1; "Ceo sloj" -> pasus null', async () => {
      await pocni(dvaPasusa(), ['tekst']);
      await izaberiOpciju('Cilj', 'Pasus 2');
      await dodaj('Dodaj izlaz', 'Zum');
      expect(store.platno().animacije).toEqual([expect.objectContaining({ slojId: 'tekst', pasus: 1, vrsta: 'IZLAZ', efekat: 'ZUM' })]);
      await izaberiOpciju('Cilj', 'Ceo sloj');
      await dodaj('Dodaj ulaz', 'Postepeno');
      expect(store.platno().animacije[1].pasus).toBeNull();
    });

    it('"Po pasusima" bez teksta: poruka, bez koraka; izabran pasus koga više nema -> "Ceo sloj"', async () => {
      const info = vi.spyOn(TestBed.inject(NotificationStore), 'info');
      const prazan: Platno = { ...bez(), slojevi: bez().slojevi.map((s) => (s.id === 'tekst' ? { ...(s as TekstSloj), pasusi: [pasus('')] } : s)) };
      await pocni(prazan, ['tekst']);
      await izaberiOpciju('Cilj', 'Po pasusima');
      await dodaj('Dodaj ulaz', 'Postepeno');
      expect(info).toHaveBeenCalledWith('Tekst nema pasusa sa sadržajem.');
      expect(izlaz).not.toHaveBeenCalled();
      await pocni(dvaPasusa(), ['tekst']);
      await izaberiOpciju('Cilj', 'Pasus 2');
      store.primeni((p) => tekstSamo(p, ['Prvi red']));
      await fixture.whenStable();
      await dodaj('Dodaj ulaz', 'Postepeno');
      expect(store.platno().animacije[0].pasus).toBeNull();
    });

    it('prikaz pasusa: prvih 20 znakova', async () => {
      await pocni(dvaPasusa(), ['tekst']);
      el().querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
      await fixture.whenStable();
      expect(opcije()[3].textContent!.trim()).toBe('Pasus 2: Drugi red je dugačak');
    });
  });

  it('granica 400 animacija: poruka, dokument se ne menja', async () => {
    const greska = vi.spyOn(TestBed.inject(NotificationStore), 'greska');
    const pune = Array.from({ length: 400 }, (_, i) => animacija(`x${i + 1}`, 'oblik'));
    await pocni({ ...bez(), animacije: pune }, ['oblik']);
    await dodaj('Dodaj ulaz', 'Postepeno');
    expect(store.platno().animacije.length).toBe(400);
    expect(greska).toHaveBeenCalledWith('Slajd može imati najviše 400 animacija.');
    expect(izlaz).not.toHaveBeenCalled();
  });
});

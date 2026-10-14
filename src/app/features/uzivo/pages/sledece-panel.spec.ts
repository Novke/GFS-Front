import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { animacija } from '../data-access/platno-podaci.testing';
import { infoSlajd, naPitanju, platnoSlajd, stanje } from '../data-access/izvodjenje-podaci.testing';
import { NastavnickoStanje } from '../data-access/uzivo.models';
import { SlajdPrikazComponent } from '../ui/slajd-prikaz.component';
import { SledecePanelComponent } from './sledece-panel.component';

async function prikazi(s: NastavnickoStanje) {
  const fixture = TestBed.createComponent(SledecePanelComponent);
  fixture.componentRef.setInput('stanje', s);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const prikazi1 = (f: Awaited<ReturnType<typeof prikazi>>) =>
  f.debugElement.queryAll(By.directive(SlajdPrikazComponent)).map((d) => d.componentInstance as SlajdPrikazComponent);
const tekst = (f: Awaited<ReturnType<typeof prikazi>>) => (f.nativeElement as HTMLElement).textContent ?? '';

describe('SledecePanelComponent', () => {
  it('INFO postepeno, korak 1/3: naslov "korak 2/3", isti slajd na koraku 2', async () => {
    const sl = infoSlajd({ postepeno: true });
    const f = await prikazi(stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: sl, korak: 1, brojStavki: 3 }));
    expect(f.nativeElement.querySelector('h2').textContent).toContain('Sledeće · korak 2/3');
    const p = prikazi1(f);
    expect(p.length).toBe(1);
    expect(p[0].korak()).toBe(2);
    expect(p[0].slajd()).toBe(sl);
    expect(p[0].postepeno()).toBe(true);
  });

  it('PLATNO korak 0/2: korak 1, bez animacije, tema prezentacije, prvi klik je vidljiv', async () => {
    // druga KLIK animacija uvodi sloj tabele (u fabričkom platnu je to izlaz oblika)
    const pl = platnoSlajd();
    pl.platno!.animacije[3] = animacija('a4', 'tabela');
    const f = await prikazi(stanje({
      prikaz: 'SLAJD', indeks: 0, trenutniSlajd: pl, korak: 0, brojStavki: 2, tema: 'TAMNA',
    }));
    const p = prikazi1(f)[0];
    expect(p.korak()).toBe(1);
    expect(p.animacija()).toBeNull();
    expect(p.tema()).toBe('TAMNA');
    const sloj = (id: string) => f.nativeElement.querySelector(`[data-sloj="${id}"]`) as HTMLElement;
    expect(sloj('tekst').style.visibility).toBe('');
    expect(sloj('slika').style.visibility).toBe('');
    expect(sloj('tabela').style.visibility).toBe('hidden');
  });

  it('pitanje CEKA: radnja "otvara" i pregled slajda posle pitanja', async () => {
    const f = await prikazi(naPitanju('CEKA', { sledeciSlajd: infoSlajd({ rb: 3 }), indeks: 1 }));
    expect(tekst(f)).toContain('Sledeći klik otvara pitanje.');
    expect(tekst(f)).toContain('Zatim: slajd 3/3');
    const p = prikazi1(f);
    expect(p.length).toBe(1);
    expect(p[0].korak()).toBe(0);
  });

  it('pitanje OTVORENO bez sledećeg: "zatvara" i kraj prezentacije', async () => {
    const f = await prikazi(naPitanju('OTVORENO', { sledeciSlajd: null }));
    expect(tekst(f)).toContain('Sledeći klik zatvara pitanje.');
    expect(tekst(f)).toContain('Zatim: kraj prezentacije.');
    expect(prikazi1(f).length).toBe(0);
  });

  it('prijava: sledeći slajd 1/3 na koraku 0', async () => {
    const f = await prikazi(stanje());
    expect(f.nativeElement.querySelector('h2').textContent).toContain('Sledeće · slajd 1/3');
    expect(prikazi1(f)[0].korak()).toBe(0);
  });

  it('KRAJ: tekst o kraju; NISTA: Završi', async () => {
    const f = await prikazi(stanje({ prikaz: 'SLAJD', indeks: 2, trenutniSlajd: infoSlajd(), sledeciSlajd: null }));
    expect(tekst(f)).toContain('Sledeći klik prikazuje kraj');
    const g = await prikazi(stanje({ prikaz: 'KRAJ', sledeciSlajd: null }));
    expect(tekst(g)).toContain('Završi izvođenje dugmetom „Završi“.');
  });
});

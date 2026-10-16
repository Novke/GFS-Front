import { TestBed } from '@angular/core/testing';
import { pitanjeSlajd } from '../data-access/izvodjenje-podaci.testing';
import { PitanjeDetails } from '../data-access/uzivo.models';
import { PitanjePlociceComponent } from './pitanje-plocice.component';

async function prikazi(pitanje: PitanjeDetails) {
  const fixture = TestBed.createComponent(PitanjePlociceComponent);
  fixture.componentRef.setInput('pitanje', pitanje);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('PitanjePlociceComponent: formule u opcijama', () => {
  it('tekst opcije je app-tekst-formule (.uz-plocica-tekst); $11$ je mesto formule, običan tekst ostaje tekst', async () => {
    const p = pitanjeSlajd('JEDAN_TACAN', {
      opcije: [{ id: 1, rb: 1, tekst: '$11$', tacna: true }, { id: 2, rb: 2, tekst: 'Cena 5$', tacna: false }],
    }).pitanje!;
    const el = await prikazi(p);
    const tekstovi = Array.from(el.querySelectorAll<HTMLElement>('.uz-plocica-tekst'));
    expect(tekstovi.map((t) => t.tagName.toLowerCase())).toEqual(['app-tekst-formule', 'app-tekst-formule']);
    expect(tekstovi[0].querySelector('span.uz-formula')?.textContent).toBe('$11$');
    expect(tekstovi[1].textContent).toBe('Cena 5$');
    expect(tekstovi[1].querySelector('.uz-formula')).toBeNull();
    // običan tekst: domaćin ostaje u redu (bez inline display), kao dosadašnji <span>
    expect(tekstovi[0].style.display).toBe('');
  });

  it('HTML u tekstu opcije je tekst', async () => {
    const p = pitanjeSlajd('JEDAN_TACAN', {
      opcije: [{ id: 1, rb: 1, tekst: '<b>x</b>', tacna: true }, { id: 2, rb: 2, tekst: '2', tacna: false }],
    }).pitanje!;
    const el = await prikazi(p);
    const prvi = el.querySelector('.uz-plocica-tekst')!;
    expect(prvi.querySelector('b')).toBeNull();
    expect(prvi.textContent).toBe('<b>x</b>');
  });
});

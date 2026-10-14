import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JavnoPitanje, OdgovorCmd, TipPitanja } from '../data-access/uzivo.models';
import {
  NacrtOdgovora, OdgovorUnosComponent, mozeDaPosalje, normalizujBroj, porukaZaBroj, porukaZaTekst, tekstOpcije,
} from './odgovor-unos.component';

function pitanje(tip: TipPitanja, izmene: Partial<JavnoPitanje> = {}): JavnoPitanje {
  return {
    tip, faza: 'OTVORENO', rundaId: 7, brojOpcija: 3,
    opcije: [{ id: 11, tekst: null }, { id: 12, tekst: null }, { id: 13, tekst: null }],
    tekst: null, slikaId: null, jedinica: null, skalaMinOznaka: null, skalaMaxOznaka: null,
    rokMs: null, preostaloMs: null, tacneOpcije: null, tacanBroj: null, prihvatljiviOdgovori: null,
    ...izmene,
  };
}

describe('odgovor-unos: pravila', () => {
  it('porukaZaBroj: nije broj -> "Unesi broj."; zarez, znak i razmaci hiljada prolaze', () => {
    expect(porukaZaBroj('abc')).toBe('Unesi broj.');
    expect(porukaZaBroj('')).toBe('Unesi broj.');
    expect(porukaZaBroj('   ')).toBe('Unesi broj.');
    expect(porukaZaBroj('3,')).toBe('Unesi broj.');
    expect(porukaZaBroj('1e5')).toBe('Unesi broj.');
    expect(porukaZaBroj('3,14')).toBeNull();
    expect(porukaZaBroj('-2.5')).toBeNull();
    expect(porukaZaBroj('+7')).toBeNull();
    expect(porukaZaBroj(' 1 000 ')).toBeNull();
  });

  it('normalizujBroj uklanja razmake, zarez ostaje (server ga prima)', () => {
    expect(normalizujBroj(' 1 000,5 ')).toBe('1000,5');
  });

  it('porukaZaTekst: 1-200 znakova posle skraćivanja razmaka', () => {
    expect(porukaZaTekst('  ')).toBe('Odgovor mora imati od 1 do 200 znakova.');
    expect(porukaZaTekst('x'.repeat(201))).toBe('Odgovor mora imati od 1 do 200 znakova.');
    expect(porukaZaTekst(' Beograd ')).toBeNull();
    expect(porukaZaTekst('x'.repeat(200))).toBeNull();
  });

  it('VISE_TACNIH: "Pošalji" tek uz bar jedan izbor; ostali tipovi po svom polju', () => {
    expect(mozeDaPosalje('VISE_TACNIH', { izabrane: [], broj: '', tekst: '' })).toBe(false);
    expect(mozeDaPosalje('VISE_TACNIH', { izabrane: [12], broj: '', tekst: '' })).toBe(true);
    expect(mozeDaPosalje('BROJ', { izabrane: [], broj: '  ', tekst: '' })).toBe(false);
    expect(mozeDaPosalje('BROJ', { izabrane: [], broj: 'abc', tekst: '' })).toBe(true); // poruka tek na "Pošalji"
    expect(mozeDaPosalje('KRATAK_TEKST', { izabrane: [], broj: '', tekst: ' ' })).toBe(false);
    expect(mozeDaPosalje('KRATAK_TEKST', { izabrane: [], broj: '', tekst: 'Novi Sad' })).toBe(true);
  });

  it('tekstOpcije: tekst sa servera, a za tačno/netačno uvek "Tačno"/"Netačno" (redosled je fiksan)', () => {
    expect(tekstOpcije(pitanje('JEDAN_TACAN', { opcije: [{ id: 1, tekst: 'Pariz' }] }), 0)).toBe('Pariz');
    expect(tekstOpcije(pitanje('JEDAN_TACAN'), 0)).toBeNull();
    expect(tekstOpcije(pitanje('TACNO_NETACNO'), 0)).toBe('Tačno');
    expect(tekstOpcije(pitanje('TACNO_NETACNO'), 1)).toBe('Netačno');
  });
});

describe('OdgovorUnosComponent', () => {
  let fixture: ComponentFixture<OdgovorUnosComponent>;
  let poslato: OdgovorCmd[];

  function napravi(p: JavnoPitanje, celoPitanje = false, nacrt: NacrtOdgovora | null = null): void {
    fixture = TestBed.createComponent(OdgovorUnosComponent);
    fixture.componentRef.setInput('pitanje', p);
    fixture.componentRef.setInput('celoPitanje', celoPitanje);
    fixture.componentRef.setInput('nacrt', nacrt);
    poslato = [];
    fixture.componentInstance.posalji.subscribe(c => poslato.push(c));
    fixture.detectChanges();
  }

  const dugmad = () => Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
  const dugme = (tekst: string) => dugmad().find(b => b.textContent!.includes(tekst))!;

  it('dvostruki dodir na opciju šalje jednom, a sva dugmad su odmah onemogućena', () => {
    napravi(pitanje('JEDAN_TACAN'));
    const [a, b] = dugmad();
    a.click();
    b.click(); // isti okvir, pre osvežavanja prikaza
    a.click();
    expect(poslato).toEqual([{ rundaId: 7, opcije: [11] }]);
    fixture.detectChanges();
    expect(dugmad().every(d => d.disabled)).toBe(true);
  });

  it('dugmad imaju aria-label sa slovom, nazivom oblika i tekstom kad postoji', () => {
    napravi(pitanje('JEDAN_TACAN', { opcije: [{ id: 11, tekst: 'Pariz' }, { id: 12, tekst: null }] }), true);
    expect(dugmad()[0].getAttribute('aria-label')).toBe('A, crveni trougao: Pariz');
    expect(dugmad()[1].getAttribute('aria-label')).toBe('B, plavi romb');
  });

  it('VISE_TACNIH: "Pošalji" onemogućen bez izbora, pa šalje izabrane jednom', () => {
    napravi(pitanje('VISE_TACNIH'));
    expect(dugme('Pošalji').disabled).toBe(true);
    dugmad()[0].click();
    dugmad()[2].click();
    fixture.detectChanges();
    expect(dugmad()[0].getAttribute('aria-pressed')).toBe('true');
    expect(dugme('Pošalji').disabled).toBe(false);
    dugme('Pošalji').click();
    dugme('Pošalji').click();
    expect(poslato).toEqual([{ rundaId: 7, opcije: [11, 13] }]);
  });

  it('BROJ: neispravan unos pokazuje "Unesi broj." i ne šalje; ispravan šalje tekst sa zarezom', () => {
    napravi(pitanje('BROJ', { opcije: null, brojOpcija: null, jedinica: 'm' }), true);
    const polje = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    polje.value = 'abc';
    polje.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dugme('Pošalji').click();
    fixture.detectChanges();
    expect(poslato).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Unesi broj.');
    expect(fixture.nativeElement.textContent).toContain('m');

    polje.value = '3,5';
    polje.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    dugme('Pošalji').click();
    expect(poslato).toEqual([{ rundaId: 7, broj: '3,5' }]);
  });

  it('BROJ u režimu DUGMAD (bez Detalja): jedinica stoji uz polje', () => {
    // server šalje jedinicu u svakom režimu telefona; tekst pitanja ostaje skriven
    napravi(pitanje('BROJ', { opcije: null, brojOpcija: null, jedinica: 'm/s²' }), false);
    const jedinica = fixture.nativeElement.querySelector('.uz-st-polje-red .uz-st-jedinica') as HTMLElement;
    expect(jedinica.textContent).toBe('m/s²');
    const polje = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(polje.getAttribute('aria-describedby')).toBe('uz-st-jedinica uz-st-broj-poruka');
  });

  it('BROJ bez jedinice: nema oznake jedinice', () => {
    napravi(pitanje('BROJ', { opcije: null, brojOpcija: null, jedinica: null }), false);
    expect(fixture.nativeElement.querySelector('.uz-st-jedinica')).toBeNull();
    const polje = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(polje.getAttribute('aria-describedby')).toBe('uz-st-broj-poruka');
  });

  it('SKALA: pet dugmadi, dodir šalje vrednost', () => {
    napravi(pitanje('SKALA', { opcije: null, brojOpcija: null }));
    expect(dugmad().length).toBe(5);
    dugmad()[3].click();
    expect(poslato).toEqual([{ rundaId: 7, skala: 4 }]);
  });

  it('nacrt iste runde se vraća posle ponovnog montiranja (izbor kod više tačnih)', () => {
    napravi(pitanje('VISE_TACNIH'));
    const nacrti: NacrtOdgovora[] = [];
    fixture.componentInstance.nacrtPromena.subscribe(n => nacrti.push(n));
    dugmad()[0].click();
    dugmad()[2].click();
    expect(nacrti[nacrti.length - 1]).toEqual({ rundaId: 7, izabrane: [11, 13], broj: '', tekst: '' });

    // otključavanje posle greške ili roka potvrde: komponenta se montira iznova sa nacrtom iz store-a
    napravi(pitanje('VISE_TACNIH'), false, nacrti[nacrti.length - 1]);
    expect(dugmad()[0].getAttribute('aria-pressed')).toBe('true');
    expect(dugmad()[2].getAttribute('aria-pressed')).toBe('true');
    expect(dugme('Pošalji').disabled).toBe(false);
    dugme('Pošalji').click();
    expect(poslato).toEqual([{ rundaId: 7, opcije: [11, 13] }]);
  });

  it('nacrt iste runde vraća ukucan broj i tekst; nacrt druge runde se ignoriše', () => {
    const brojP = pitanje('BROJ', { opcije: null, brojOpcija: null });
    napravi(brojP, true, { rundaId: 7, izabrane: [], broj: '12,5', tekst: '' });
    expect((fixture.nativeElement.querySelector('input') as HTMLInputElement).value).toBe('12,5');
    napravi(brojP, true, { rundaId: 6, izabrane: [], broj: '99', tekst: '' });
    expect((fixture.nativeElement.querySelector('input') as HTMLInputElement).value).toBe('');

    napravi(pitanje('KRATAK_TEKST', { opcije: null, brojOpcija: null }), true);
    const nacrti: NacrtOdgovora[] = [];
    fixture.componentInstance.nacrtPromena.subscribe(n => nacrti.push(n));
    const polje = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    polje.value = 'Sava';
    polje.dispatchEvent(new Event('input'));
    expect(nacrti[nacrti.length - 1]).toEqual({ rundaId: 7, izabrane: [], broj: '', tekst: 'Sava' });
    napravi(pitanje('KRATAK_TEKST', { opcije: null, brojOpcija: null }), true, nacrti[nacrti.length - 1]);
    expect((fixture.nativeElement.querySelector('input') as HTMLInputElement).value).toBe('Sava');
    expect(dugme('Pošalji').disabled).toBe(false);
  });

  it('nova runda briše izbor i otključava', () => {
    napravi(pitanje('VISE_TACNIH'));
    dugmad()[1].click();
    fixture.detectChanges();
    dugme('Pošalji').click();
    fixture.componentRef.setInput('pitanje', pitanje('VISE_TACNIH', { rundaId: 8 }));
    fixture.detectChanges();
    expect(dugmad()[1].getAttribute('aria-pressed')).toBe('false');
    expect(dugmad()[1].disabled).toBe(false);
  });
});

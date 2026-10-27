import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LicniZadatak, OdgovorPolja, PoljeZadatka } from '../data-access/uzivo.models';
import { NacrtZadatka, ZadatakUnosComponent, oznakaNaTelefonu, popunjeno, tacnoPolja } from './zadatak-unos.component';

const BEZ: OdgovorPolja = { broj: null, prihvatljivi: null, tacna: null, tacne: null };

function polje(kljuc: string, tip: PoljeZadatka['tip'], izmene: Partial<PoljeZadatka> = {}): PoljeZadatka {
  return {
    kljuc, oznaka: kljuc, tip, odstupanje: null, odstupanjeTip: null, jedinica: null, zanemariVelicinu: null, zanemariRazmake: null,
    opcije: tip === 'JEDAN_TACAN' || tip === 'VISE_TACNIH' ? [{ id: 1, tekst: '$7$' }, { id: 2, tekst: '$11$' }, { id: 3, tekst: '13' }] : null,
    ...izmene,
  };
}

/** Svoja varijanta: BROJ `a` i JEDAN_TACAN `c` (izmišljeni id-jevi slika). */
function zadatak(izmene: Partial<LicniZadatak> = {}): LicniZadatak {
  return {
    rundaId: 55, varijantaId: 12, svgId: 'svg-a', polja: [polje('a', 'BROJ'), polje('c', 'JEDAN_TACAN')], faza: 'OTVORENO',
    primljen: false, ishod: null, tacno: null, tacneVrednosti: null, resenjeSvgId: null, ...izmene,
  };
}

describe('zadatak-unos: pravila', () => {
  it('oznakaNaTelefonu: jedno polje bez slova liste, više polja kakve jesu, ništa drugo se ne skida', () => {
    const o = (oznaka: string) => ({ oznaka });
    expect(oznakaNaTelefonu(o('a) dekadna vrednost'), 1)).toBe('dekadna vrednost');
    expect(oznakaNaTelefonu(o('(b) binarni zapis'), 1)).toBe('binarni zapis');
    expect(oznakaNaTelefonu(o('1) Rezultat'), 1)).toBe('Rezultat');
    expect(oznakaNaTelefonu(o('a) dekadni'), 2)).toBe('a) dekadni');
    for (const ostaje of ['a)', 'Dekadna vrednost', 'x+y) zbir', 'abc) tekst', '123) broj', 'a.b) c', 'f(x) vrednost', 'a)dekadni']) {
      expect(oznakaNaTelefonu(o(ostaje), 1)).toBe(ostaje);
    }
  });

  it('popunjeno: BROJ i TEKST posle skraćivanja razmaka, JEDAN_TACAN tačno jedan, VISE_TACNIH bar jedan', () => {
    expect(popunjeno(polje('a', 'BROJ'), '  ')).toBe(false);
    expect(popunjeno(polje('a', 'BROJ'), '45')).toBe(true);
    expect(popunjeno(polje('b', 'TEKST'), undefined)).toBe(false);
    expect(popunjeno(polje('b', 'TEKST'), ' x ')).toBe(true);
    expect(popunjeno(polje('c', 'JEDAN_TACAN'), [])).toBe(false);
    expect(popunjeno(polje('c', 'JEDAN_TACAN'), [2])).toBe(true);
    expect(popunjeno(polje('d', 'VISE_TACNIH'), [])).toBe(false);
    expect(popunjeno(polje('d', 'VISE_TACNIH'), [1, 3])).toBe(true);
  });

  it('tacnoPolja: broj sa svim decimalama i jedinicom, prihvatljivi tekstovi, tekst tačne opcije (opcije redom)', () => {
    expect(tacnoPolja(polje('a', 'BROJ'), { ...BEZ, broj: 45 })).toBe('45');
    expect(tacnoPolja(polje('a', 'BROJ', { jedinica: 'm' }), { ...BEZ, broj: 0.0625 })).toBe('0,0625 m');
    expect(tacnoPolja(polje('b', 'TEKST'), { ...BEZ, prihvatljivi: ['1011', 'jedanaest'] })).toBe('1011, jedanaest');
    expect(tacnoPolja(polje('c', 'JEDAN_TACAN'), { ...BEZ, tacna: 2 })).toBe('$11$');
    expect(tacnoPolja(polje('d', 'VISE_TACNIH'), { ...BEZ, tacne: [3, 1] })).toBe('$7$, 13');
    expect(tacnoPolja(polje('a', 'BROJ'), null)).toBe('');
  });
});

describe('ZadatakUnosComponent', () => {
  let fixture: ComponentFixture<ZadatakUnosComponent>;
  let poslato: Record<string, string | number[]>[];
  let nacrti: NacrtZadatka[];

  function napravi(z: LicniZadatak, zakljucan = false, nacrt: NacrtZadatka | null = null): HTMLElement {
    fixture = TestBed.createComponent(ZadatakUnosComponent);
    fixture.componentRef.setInput('zadatak', z);
    fixture.componentRef.setInput('zakljucan', zakljucan);
    fixture.componentRef.setInput('nacrt', nacrt);
    poslato = [];
    nacrti = [];
    fixture.componentInstance.posalji.subscribe(p => poslato.push(p));
    fixture.componentInstance.nacrtPromena.subscribe(n => nacrti.push(n));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const dugme = (ime: string) => Array.from(el().querySelectorAll('button')).find(b => b.textContent!.trim() === ime) ?? null;
  function upisi(polje: HTMLInputElement, vrednost: string): void {
    polje.value = vrednost;
    polje.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('slika svoje varijante iz api/public/mediji u omotu za zumiranje prstima', () => {
    napravi(zadatak());
    const slika = el().querySelector<HTMLImageElement>('img[data-zadatak-svg]')!;
    expect(slika.getAttribute('src')).toBe('api/public/mediji/svg-a');
    expect(slika.alt).toBe('Zadatak');
    expect(slika.closest('.uz-st-zd-slika')).not.toBeNull();
    expect(el().querySelector('img[alt="Rešenje"]')).toBeNull();
  });

  it('polja po šemi; "Pošalji" tek kad je sve popunjeno, pa šalje {"a":"45","c":[2]} jednom', () => {
    napravi(zadatak());
    const broj = el().querySelector<HTMLInputElement>('input[data-polje="a"]')!;
    expect(broj.getAttribute('inputmode')).toBe('decimal');
    expect(el().querySelector(`label[for="${broj.id}"]`)?.textContent).toContain('a');
    expect(dugme('Pošalji')!.disabled).toBe(true);
    upisi(broj, ' 45 ');
    expect(dugme('Pošalji')!.disabled).toBe(true);
    const opcije = Array.from(el().querySelectorAll<HTMLButtonElement>('[data-polje="c"] button'));
    expect(opcije.length).toBe(3);
    expect(opcije[1].querySelector('app-tekst-formule span.uz-formula')?.textContent).toBe('$11$');
    expect(opcije[1].getAttribute('aria-pressed')).toBe('false');
    opcije[0].click();
    opcije[1].click(); // jedan tačan: drugi dodir menja izbor
    fixture.detectChanges();
    expect(opcije.map(o => o.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(dugme('Pošalji')!.disabled).toBe(false);
    dugme('Pošalji')!.click();
    dugme('Pošalji')!.click();
    expect(poslato).toEqual([{ a: '45', c: [2] }]);
    expect(JSON.stringify(poslato[0])).toBe('{"a":"45","c":[2]}');
    fixture.detectChanges();
    // posle slanja polja i "Pošalji" nestaju, a ostaje šta je poslato
    expect(dugme('Pošalji')).toBeNull();
    expect(el().querySelectorAll('input').length).toBe(0);
    const poslatoBlok = el().querySelector('[data-poslato]')!;
    expect(poslatoBlok.querySelector('.uz-st-oznaka')?.textContent?.trim()).toBe('Tvoj odgovor');
    expect(Array.from(poslatoBlok.querySelectorAll('li'), li => li.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['a: 45', 'c: $11$']);
    expect(nacrti.at(-1)).toEqual({ rundaId: 55, polja: { a: ' 45 ', c: [2] } });
  });

  it('TEKST i VISE_TACNIH (prekidači): tekst skraćen, izabrane redom opcija', () => {
    napravi(zadatak({ polja: [polje('b', 'TEKST'), polje('d', 'VISE_TACNIH')] }));
    upisi(el().querySelector<HTMLInputElement>('input[data-polje="b"]')!, '  1011 0110 ');
    const opcije = Array.from(el().querySelectorAll<HTMLButtonElement>('[data-polje="d"] button'));
    opcije[2].click();
    opcije[0].click();
    opcije[2].click();
    opcije[2].click();
    fixture.detectChanges();
    expect(opcije.map(o => o.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true']);
    dugme('Pošalji')!.click();
    expect(poslato).toEqual([{ b: '1011 0110', d: [1, 3] }]);
  });

  it('BROJ koji nije broj: poruka uz polje, bez slanja', () => {
    napravi(zadatak({ polja: [polje('a', 'BROJ', { jedinica: 'm' })] }));
    upisi(el().querySelector<HTMLInputElement>('input[data-polje="a"]')!, 'abc');
    dugme('Pošalji')!.click();
    fixture.detectChanges();
    expect(poslato).toEqual([]);
    expect(el().textContent).toContain('Unesi broj.');
    expect(el().textContent).toContain('m');
    upisi(el().querySelector<HTMLInputElement>('input[data-polje="a"]')!, '1 000,5');
    dugme('Pošalji')!.click();
    expect(poslato).toEqual([{ a: '1000,5' }]);
  });

  it('rad na papiru: "Reši na papiru." bez polja i bez "Pošalji"', () => {
    napravi(zadatak({ polja: [] }));
    expect(el().textContent).toContain('Reši na papiru.');
    expect(dugme('Pošalji')).toBeNull();
    expect(el().querySelectorAll('input').length).toBe(0);
  });

  it('zaključan: bez polja i "Pošalji", "Tvoj odgovor" iz nacrta iste runde (jedinica uz broj)', () => {
    napravi(zadatak({ polja: [polje('a', 'BROJ', { jedinica: 'm' }), polje('c', 'JEDAN_TACAN')] }), true,
      { rundaId: 55, polja: { a: '45', c: [2] } });
    expect(el().querySelectorAll('input').length).toBe(0);
    expect(dugme('Pošalji')).toBeNull();
    const redovi = Array.from(el().querySelectorAll<HTMLElement>('[data-poslato] li')).map(r => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(redovi).toEqual(['a: 45 m', 'c: $11$']);
    // bez nacrta (npr. posle ponovnog učitavanja) nema ni spiska
    napravi(zadatak(), true);
    expect(el().querySelector('[data-poslato]')).toBeNull();
    expect(dugme('Pošalji')).toBeNull();
    // nacrt druge runde se ne prenosi
    napravi(zadatak({ rundaId: 56 }), false, { rundaId: 55, polja: { a: '45' } });
    expect(el().querySelector<HTMLInputElement>('input[data-polje="a"]')!.value).toBe('');
  });

  it('otključavanje (greška provere) vraća "Pošalji" iste instance', () => {
    napravi(zadatak({ polja: [polje('a', 'BROJ')] }));
    upisi(el().querySelector<HTMLInputElement>('input[data-polje="a"]')!, '45');
    dugme('Pošalji')!.click();
    fixture.componentRef.setInput('zakljucan', true);
    fixture.detectChanges();
    fixture.componentRef.setInput('zakljucan', false);
    fixture.detectChanges();
    expect(el().querySelector<HTMLInputElement>('input[data-polje="a"]')!.value).toBe('45');
    expect(dugme('Pošalji')!.disabled).toBe(false);
    dugme('Pošalji')!.click();
    expect(poslato).toEqual([{ a: '45' }, { a: '45' }]);
  });

  it('ishod posle zatvaranja: "<oznaka>: tačno|netačno" i bez polja za unos', () => {
    napravi(zadatak({ faza: 'ZATVORENO', primljen: true, ishod: { a: true, c: false }, tacno: false }), true);
    const redovi = Array.from(el().querySelectorAll<HTMLElement>('[data-ishod]')).map(r => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(redovi).toEqual(['a: tačno', 'c: netačno']);
    expect(el().querySelectorAll('input').length).toBe(0);
    expect(dugme('Pošalji')).toBeNull();
    expect(el().textContent).not.toContain('Tačno:');
  });

  it('jedno polje sa slovom liste: label unosa, poslat odgovor i ishod bez "a) "', () => {
    napravi(zadatak({ polja: [polje('a', 'BROJ', { oznaka: 'a) dekadna vrednost' })] }));
    expect(el().querySelector('label.uz-st-oznaka')!.textContent!.trim()).toBe('dekadna vrednost');
    napravi(zadatak({ faza: 'ZATVORENO', ishod: { a: true }, polja: [polje('a', 'BROJ', { oznaka: 'a) dekadna vrednost' })] }), true);
    expect(el().querySelector('[data-ishod]')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('dekadna vrednost: tačno');
  });

  it('TACAN: "Tačno: 45" i tekst tačne opcije kroz app-tekst-formule', () => {
    napravi(zadatak({
      faza: 'ZATVORENO', ishod: null, tacneVrednosti: { a: { ...BEZ, broj: 45 }, c: { ...BEZ, tacna: 2 } },
    }), true);
    const tacna = Array.from(el().querySelectorAll<HTMLElement>('[data-tacno]'));
    expect(tacna[0].textContent!.replace(/\s+/g, ' ').trim()).toBe('Tačno: 45');
    expect(tacna[1].querySelector('app-tekst-formule span.uz-formula')?.textContent).toBe('$11$');
  });

  it('RESENJE: slika rešenja svoje varijante tek kad stigne resenjeSvgId', () => {
    napravi(zadatak({ faza: 'ZATVORENO', resenjeSvgId: 'res-a' }), true);
    const r = el().querySelector<HTMLImageElement>('img[alt="Rešenje"]')!;
    expect(r.getAttribute('src')).toBe('api/public/mediji/res-a');
  });

  it('"Uvećaj" otvara prikaz preko celog ekrana (dijalog, fokus na "Zatvori"); Esc i "Zatvori" ga zatvaraju', async () => {
    napravi(zadatak());
    expect(el().querySelector('[role="dialog"]')).toBeNull();
    dugme('Uvećaj')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const dijalog = el().querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dijalog.getAttribute('aria-modal')).toBe('true');
    expect(dijalog.querySelector<HTMLImageElement>('img')!.getAttribute('src')).toBe('api/public/mediji/svg-a');
    expect(document.activeElement?.textContent?.trim()).toBe('Zatvori');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el().querySelector('[role="dialog"]')).toBeNull();
    dugme('Uvećaj')!.click();
    fixture.detectChanges();
    dugme('Zatvori')!.click();
    fixture.detectChanges();
    expect(el().querySelector('[role="dialog"]')).toBeNull();
  });
});

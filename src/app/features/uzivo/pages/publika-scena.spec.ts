import { TestBed } from '@angular/core/testing';
import { naPitanju, pitanjeSlajd, stanje } from '../data-access/izvodjenje-podaci.testing';
import { NastavnickoStanje, Rezultat } from '../data-access/uzivo.models';
import { PublikaScenaComponent } from './publika-scena.component';

async function prikazi(s: NastavnickoStanje) {
  const fixture = TestBed.createComponent(PublikaScenaComponent);
  fixture.componentRef.setInput('stanje', s);
  fixture.componentRef.setInput('joinLink', 'http://localhost/uzivo/123456');
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const tekst = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * Projektor prikazuje samo javne projekcije sa servera (`javniRezultat`, `javnaRangLista`), nikad nastavnički
 * `rezultat` ni `rangLista` (Ruling 16): `L` ili `Space` pre `C` ne smeju da odaju tačnost.
 */
describe('PublikaScenaComponent (javne projekcije)', () => {
  it('L dok je pitanje otvoreno: rang-lista bez poena trenutne runde (javnaRangLista, ne nastavnička)', async () => {
    const el = await prikazi(naPitanju('OTVORENO', {
      takmicenje: true, rangListaPrikazana: true,
      // nastavnik vidi uživo: Bojan je upravo tačno odgovorio
      rangLista: [{ mesto: 1, ucesnikId: 2, ime: 'Bojan', poeni: 800 }, { mesto: 2, ucesnikId: 1, ime: 'Ana', poeni: 0 }],
      // server: trenutna runda se ne računa pre C
      javnaRangLista: [{ mesto: 1, ucesnikId: null, ime: 'Ana', poeni: 0 }, { mesto: 2, ucesnikId: null, ime: 'Bojan', poeni: 0 }],
    }));
    const rang = el.querySelector('[aria-label="Rang-lista"]');
    expect(rang).not.toBeNull();
    const redovi = Array.from(rang!.querySelectorAll('.uz-rang-red'))
      .map(r => [r.querySelector('.uz-rang-ime')?.textContent, r.querySelector('.uz-rang-poeni')?.textContent]);
    expect(redovi).toEqual([['Ana', '0'], ['Bojan', '0']]);
    expect(tekst(rang)).not.toContain('800');
  });

  it('L bez javne rang-liste (stari snimak, null): prazna lista, nikad nastavnička', async () => {
    const el = await prikazi(naPitanju('ZATVORENO', {
      takmicenje: true, rangListaPrikazana: true,
      rangLista: [{ mesto: 1, ucesnikId: 2, ime: 'Bojan', poeni: 800 }],
      javnaRangLista: null,
    }));
    const rang = el.querySelector('[aria-label="Rang-lista"]');
    expect(tekst(rang)).not.toContain('Bojan');
    expect(tekst(rang)).toContain('Još nema poena.');
  });

  it('Space na pitanju sa brojem pre C: nema "U odstupanju" (javniRezultat, ne nastavnički)', async () => {
    const slajd = pitanjeSlajd('BROJ', { opcije: [], brojTacno: 9.81, brojOdstupanje: 0.1, odstupanjeTip: 'APSOLUTNO', jedinica: 'm/s²' });
    const nastavnicki: Rezultat = {
      tip: 'BROJ', ukupno: 2, opcije: null, tekstovi: null, skala: null,
      brojevi: { medijana: 6.4, uOdstupanju: 1, najcesce: [{ vrednost: 9.8, broj: 1 }, { vrednost: 3, broj: 1 }] },
    };
    const javni: Rezultat = { ...nastavnicki, brojevi: { ...nastavnicki.brojevi!, uOdstupanju: null } };
    const el = await prikazi(naPitanju('ZATVORENO', {
      rezultatiPrikazani: true, rezultat: nastavnicki, javniRezultat: javni, brojOdgovora: 2,
    }, slajd));
    expect(tekst(el)).toMatch(/6[.,]4/);   // medijana se vidi (rezultat je prikazan)
    expect(tekst(el)).not.toContain('U odstupanju');

    // posle C server šalje broj u javnom rezultatu
    const posleC = await prikazi(naPitanju('ZATVORENO', {
      rezultatiPrikazani: true, tacanPrikazan: true, rezultat: nastavnicki, javniRezultat: nastavnicki, brojOdgovora: 2,
    }, slajd));
    expect(tekst(posleC)).toContain('U odstupanju');
    expect(tekst(posleC)).toContain('1/2');
  });

  it('Space pre C: opcije bez oznake tačne (javniRezultat)', async () => {
    const nastavnicki: Rezultat = {
      tip: 'JEDAN_TACAN', ukupno: 1, brojevi: null, tekstovi: null, skala: null,
      opcije: [{ id: 1, tekst: '3', broj: 0, tacna: false }, { id: 2, tekst: '4', broj: 1, tacna: true }],
    };
    const javni: Rezultat = { ...nastavnicki, opcije: nastavnicki.opcije!.map(o => ({ ...o, tacna: null })) };
    const el = await prikazi(naPitanju('ZATVORENO', { rezultatiPrikazani: true, rezultat: nastavnicki, javniRezultat: javni }));
    expect(el.querySelectorAll('.uz-rez-opcija').length).toBe(2);
    expect(el.querySelector('.uz-rez-opcija--tacna, .uz-tacno-znak')).toBeNull();
  });

  it('KRAJ sa takmičenjem: postolje iz javnaRangLista', async () => {
    const el = await prikazi(stanje({
      prikaz: 'KRAJ', indeks: 3, takmicenje: true,
      rangLista: [{ mesto: 1, ucesnikId: 2, ime: 'Nastavnički', poeni: 1 }],
      javnaRangLista: [{ mesto: 1, ucesnikId: null, ime: 'Ana', poeni: 1800 }, { mesto: 2, ucesnikId: null, ime: 'Bojan', poeni: 900 }],
    }));
    expect(tekst(el.querySelector('.uz-scena-naslov'))).toBe('Pobednici');
    const postolje = tekst(el.querySelector('app-postolje'));
    expect(postolje).toContain('Ana');
    expect(postolje).not.toContain('Nastavnički');
  });
});

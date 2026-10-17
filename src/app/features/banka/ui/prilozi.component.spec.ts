import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BankaApi } from '../data-access/banka.api';
import { MedijInfo, PrilogCmd, PrilogInfo } from '../data-access/banka.models';
import { imeIzFajla, MAX_PRILOGA, PriloziComponent, proveriImePriloga } from './prilozi.component';

describe('imeIzFajla', () => {
  it('malim slovima bez dijakritike i ekstenzije, ostalo u crtice', () => {
    expect(imeIzFajla('Dijagram Toka (1).PNG', [])).toBe('dijagram-toka-1');
    expect(imeIzFajla('Šema čvora_đak.ž.pdf', [])).toBe('sema-cvora_djak-z');
    expect(imeIzFajla('###.png', [])).toBe('slika');
    expect(imeIzFajla(`${'a'.repeat(80)}.png`, [])).toBe('a'.repeat(60));
  });

  it('zauzeto ime i "dokument" dobijaju broj', () => {
    expect(imeIzFajla('graf.png', ['graf'])).toBe('graf-2');
    expect(imeIzFajla('graf.png', ['graf', 'graf-2'])).toBe('graf-3');
    expect(imeIzFajla('dokument.pdf', [])).toBe('dokument-2');
    expect(imeIzFajla(`${'b'.repeat(60)}.png`, ['b'.repeat(60)])).toBe(`${'b'.repeat(58)}-2`);
  });
});

describe('proveriImePriloga', () => {
  it('regex, rezervisano "dokument" i ponavljanje', () => {
    expect(proveriImePriloga('graf_1-a', [])).toBeNull();
    expect(proveriImePriloga('', [])).toBe("Ime: 1-60 malih slova, cifara, '_' ili '-'.");
    expect(proveriImePriloga('Graf', [])).toBe("Ime: 1-60 malih slova, cifara, '_' ili '-'.");
    expect(proveriImePriloga('a b', [])).not.toBeNull();
    expect(proveriImePriloga('a'.repeat(61), [])).not.toBeNull();
    expect(proveriImePriloga('dokument', [])).toBe("Ime 'dokument' je rezervisano.");
    expect(proveriImePriloga('graf', ['graf'])).toBe("Ime 'graf' se već koristi.");
  });
});

const medij = (id: string, naziv: string, velicina = 2048, mime = 'image/png'): MedijInfo => ({ id, naziv, mime, velicina });

@Component({
  imports: [PriloziComponent],
  template: `<app-prilozi [prilozi]="prilozi()" [postojeci]="postojeci()" (priloziPromena)="promena($event)" (ubaci)="ubaceno.push($event)" />`,
})
class Host {
  prilozi = signal<PrilogCmd[]>([]);
  postojeci = signal<PrilogInfo[]>([]);
  emitovano: PrilogCmd[][] = [];
  ubaceno: string[] = [];
  promena(p: PrilogCmd[]): void {
    this.emitovano.push(p);
    this.prilozi.set(p);
  }
}

describe('PriloziComponent', () => {
  const api = { prilog: vi.fn() };

  beforeEach(() => {
    api.prilog.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }, { provide: BankaApi, useValue: api }],
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
  });
  afterEach(() => document.body.replaceChildren());

  async function napravi(prilozi: PrilogCmd[] = [], postojeci: PrilogInfo[] = []) {
    const f = TestBed.createComponent(Host);
    f.componentInstance.prilozi.set(prilozi);
    f.componentInstance.postojeci.set(postojeci);
    document.body.appendChild(f.nativeElement);
    const stabilno = async () => {
      await f.whenStable();
      await new Promise(r => setTimeout(r));
      await f.whenStable();
    };
    await stabilno();
    const el = f.nativeElement as HTMLElement;
    const izaberi = async (fajl: File) => {
      const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
      Object.defineProperty(input, 'files', { value: [fajl], configurable: true });
      input.dispatchEvent(new Event('change'));
      await stabilno();
    };
    const redovi = () => [...el.querySelectorAll<HTMLElement>('[data-prilog]')];
    return { f, h: f.componentInstance, el, stabilno, izaberi, redovi };
  }

  const fajl = (ime: string, tip: string, velicina = 10) => new File([new Uint8Array(velicina)], ime, { type: tip });

  it('postojeći prilozi: ime, naziv fajla, veličina; uputstvo za \\includegraphics', async () => {
    const { redovi, el } = await napravi([{ ime: 'graf', medijId: 'm1' }], [{ ime: 'graf', medij: medij('m1', 'graf.png', 2048) }]);
    expect(redovi().length).toBe(1);
    expect(redovi()[0].querySelector<HTMLInputElement>('input[data-ime]')!.value).toBe('graf');
    expect(redovi()[0].textContent).toContain('graf.png');
    expect(redovi()[0].textContent).toContain('2 kB');
    expect(el.textContent).toContain('\\includegraphics{ime}');
    expect(el.querySelector('input[type=file]')!.getAttribute('accept')).toBe('.png,.jpg,.jpeg,.pdf');
  });

  it('otpremanje: stanje u toku, pa nov red sa imenom iz naziva fajla (jedinstvenim) i emitovan prilog', async () => {
    const odgovor = new Subject<MedijInfo>();
    api.prilog.mockReturnValue(odgovor);
    const { izaberi, el, h, stabilno, redovi } = await napravi([{ ime: 'graf', medijId: 'm1' }], [{ ime: 'graf', medij: medij('m1', 'graf.png') }]);
    const f = fajl('Graf.png', 'image/png');
    await izaberi(f);
    expect(api.prilog).toHaveBeenCalledWith(f, { tiho: true });
    expect(el.querySelector('[data-otprema]')!.textContent).toContain('Graf.png');
    expect(el.querySelector<HTMLButtonElement>('button[data-dodaj-prilog]')!.getAttribute('aria-disabled')).toBe('true');

    odgovor.next(medij('m2', 'Graf.png', 3 * 1024 * 1024));
    odgovor.complete();
    await stabilno();
    expect(el.querySelector('[data-otprema]')).toBeNull();
    expect(h.emitovano.at(-1)).toEqual([{ ime: 'graf', medijId: 'm1' }, { ime: 'graf-2', medijId: 'm2' }]);
    expect(redovi()[1].textContent).toContain('3 MB');
    expect(document.activeElement).toBe(redovi()[1].querySelector('input[data-ime]'));
  });

  it('pogrešan tip ili prevelik fajl se ne šalje; greška servera ostaje uz dugme', async () => {
    const { izaberi, el, h } = await napravi();
    await izaberi(fajl('anim.gif', 'image/gif'));
    expect(api.prilog).not.toHaveBeenCalled();
    expect(el.querySelector('[data-greska-priloga]')!.textContent).toContain('PNG, JPEG ili PDF');

    await izaberi(fajl('velik.png', 'image/png', 10 * 1024 * 1024 + 1));
    expect(api.prilog).not.toHaveBeenCalled();
    expect(el.querySelector('[data-greska-priloga]')!.textContent).toContain('10 MB');

    api.prilog.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { reason: 'Fajl nije PNG, JPEG ni PDF.' } })));
    await izaberi(fajl('lazni.png', 'image/png'));
    expect(el.querySelector('[data-greska-priloga]')!.textContent).toContain('Fajl nije PNG, JPEG ni PDF.');
    expect(h.emitovano).toEqual([]);
  });

  it('izmena imena emituje listu; neispravno ime pokazuje poruku i gasi "Ubaci u tekst"', async () => {
    const { redovi, h, stabilno } = await napravi([{ ime: 'graf', medijId: 'm1' }, { ime: 'slika', medijId: 'm2' }]);
    const ime = redovi()[0].querySelector<HTMLInputElement>('input[data-ime]')!;
    ime.value = 'dijagram';
    ime.dispatchEvent(new Event('input', { bubbles: true }));
    await stabilno();
    expect(h.emitovano.at(-1)).toEqual([{ ime: 'dijagram', medijId: 'm1' }, { ime: 'slika', medijId: 'm2' }]);

    ime.value = 'slika';
    ime.dispatchEvent(new Event('input', { bubbles: true }));
    await stabilno();
    expect(redovi()[0].textContent).toContain("Ime 'slika' se već koristi.");
    expect(ime.getAttribute('aria-invalid')).toBe('true');
    const ubaci = redovi()[0].querySelector<HTMLButtonElement>('button[data-ubaci]')!;
    expect(ubaci.getAttribute('aria-disabled')).toBe('true');
    ubaci.click();
    expect(h.ubaceno).toEqual([]);

    ime.value = 'dokument';
    ime.dispatchEvent(new Event('input', { bubbles: true }));
    await stabilno();
    expect(redovi()[0].textContent).toContain("Ime 'dokument' je rezervisano.");
  });

  it('"Ubaci u tekst" emituje ime, "Ukloni" izbacuje prilog', async () => {
    const { redovi, h, stabilno } = await napravi([{ ime: 'graf', medijId: 'm1' }, { ime: 'slika', medijId: 'm2' }]);
    redovi()[1].querySelector<HTMLButtonElement>('button[data-ubaci]')!.click();
    expect(h.ubaceno).toEqual(['slika']);
    redovi()[0].querySelector<HTMLButtonElement>('button[data-ukloni]')!.click();
    await stabilno();
    expect(h.emitovano.at(-1)).toEqual([{ ime: 'slika', medijId: 'm2' }]);
  });

  it(`najviše ${MAX_PRILOGA} priloga`, async () => {
    const puno = Array.from({ length: MAX_PRILOGA }, (_, i) => ({ ime: `p${i}`, medijId: `m${i}` }));
    const { el, izaberi } = await napravi(puno);
    const dugme = el.querySelector<HTMLButtonElement>('button[data-dodaj-prilog]')!;
    expect(dugme.getAttribute('aria-disabled')).toBe('true');
    await izaberi(fajl('x.png', 'image/png'));
    expect(api.prilog).not.toHaveBeenCalled();
  });
});

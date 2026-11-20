import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { FajlKratko } from '../util/fajlovi';
import { FajloviSpisakComponent } from './fajlovi-spisak.component';

const FAJLOVI: FajlKratko[] = [
  { id: 5, naziv: 'Vezba 1.docx', vrsta: 'DOCX', velicina: 12 * 1024 },
  { id: 6, naziv: 'Podaci.xlsx', vrsta: 'XLSX', velicina: 1.4 * 1024 * 1024 },
];

describe('FajloviSpisakComponent', () => {
  let fixture: ComponentFixture<FajloviSpisakComponent>;
  const el = () => fixture.nativeElement as HTMLElement;

  function napravi(ulazi: Record<string, unknown>): void {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(FajloviSpisakComponent);
    fixture.componentRef.setInput('fajlovi', FAJLOVI);
    for (const [k, v] of Object.entries(ulazi)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
  }

  it('naziv, vrsta i veličina; bez hrefZa i mejl nema dugmadi', () => {
    napravi({});
    const prvi = el().querySelector('[data-fajl="5"]')!;
    expect(prvi.textContent).toContain('Vezba 1.docx');
    expect(prvi.textContent).toContain('Word · 12 KB');
    expect(el().querySelector('[data-fajl="6"]')!.textContent).toContain('Excel · 1,4 MB');
    expect(el().querySelector('a, button')).toBeNull();
  });

  it('Preuzmi je link sa hrefZa i atributom download', () => {
    napravi({ hrefZa: (f: FajlKratko) => `api/public/nalog/fajlovi/${f.id}` });
    const a = el().querySelector<HTMLAnchorElement>('[data-fajl="5"] [data-preuzmi]')!;
    expect(a.getAttribute('href')).toBe('api/public/nalog/fajlovi/5');
    expect(a.hasAttribute('download')).toBe(true);
  });

  it('mejl: dugme emituje fajl, poruka po fajlu (greška je alert), dugme blokirano dok se šalje', () => {
    napravi({ mejl: true, poruke: { 5: { vrsta: 'salje', tekst: 'Šaljem…' }, 6: { vrsta: 'greska', tekst: 'Nema mejla.' } } });
    const poslati: FajlKratko[] = [];
    fixture.componentInstance.posaljiMejl.subscribe(f => poslati.push(f));
    expect(el().querySelector<HTMLButtonElement>('[data-fajl="5"] [data-mejl]')!.disabled).toBe(true);
    const drugi = el().querySelector<HTMLButtonElement>('[data-fajl="6"] [data-mejl]')!;
    expect(drugi.disabled).toBe(false);
    drugi.click();
    expect(poslati).toEqual([FAJLOVI[1]]);
    expect(el().querySelector('[data-fajl="6"] [data-poruka]')!.getAttribute('role')).toBe('alert');
    expect(el().querySelector('[data-fajl="5"] [data-poruka]')!.getAttribute('role')).toBe('status');
  });

  it('prijavaNazad: umesto dugmeta za mejl link na nalog?nazad=...', () => {
    napravi({ mejl: true, prijavaNazad: 'uzivo/123456' });
    expect(el().querySelector('[data-mejl]')).toBeNull();
    const a = el().querySelector('[data-fajl="5"] [data-prijava]')!;
    expect(a.textContent).toContain('Prijavi se da ti pošaljemo fajl');
    expect(a.getAttribute('href')).toBe('/nalog?nazad=uzivo%2F123456');
  });
});

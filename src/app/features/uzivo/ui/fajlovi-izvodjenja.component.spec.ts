import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { FajloviSlajda } from '../../../shared/util/fajlovi';
import { FajloviKarticaComponent, FajloviTrakaComponent } from './fajlovi-izvodjenja.component';

const fajlovi: FajloviSlajda = {
  kod: '1234', link: 'gfs.trif.rs/f/1234',
  fajlovi: [{ id: 5, naziv: 'vezba.docx', vrsta: 'DOCX', velicina: 1024 }, { id: 6, naziv: 'podaci.xlsx', vrsta: 'XLSX', velicina: 2048 }],
};

describe('FajloviTrakaComponent', () => {
  it('krupno prikazuje link i natpis "Fajlovi za vežbu:"', () => {
    const f = TestBed.createComponent(FajloviTrakaComponent);
    f.componentRef.setInput('fajlovi', fajlovi);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Fajlovi za vežbu:');
    expect(el.querySelector('[data-fajlovi-link]')?.textContent).toBe('gfs.trif.rs/f/1234');
    expect(el.getAttribute('aria-label')).toContain('gfs.trif.rs/f/1234');
  });
});

describe('FajloviKarticaComponent', () => {
  it('konzola: link i imena fajlova sa vrstom i veličinom', () => {
    const f = TestBed.createComponent(FajloviKarticaComponent);
    f.componentRef.setInput('fajlovi', fajlovi);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-fajlovi-link]')?.textContent).toBe('gfs.trif.rs/f/1234');
    const imena = Array.from(el.querySelectorAll('[data-fajlovi-imena] li')).map(li => (li.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(imena).toEqual(['vezba.docx · Word, 1 KB', 'podaci.xlsx · Excel, 2 KB']);
    expect(el.querySelector('[data-fajlovi-sazetak]')).toBeNull();
  });

  it('daljinski (kompaktno): jedan red sa imenima', () => {
    const f = TestBed.createComponent(FajloviKarticaComponent);
    f.componentRef.setInput('fajlovi', fajlovi);
    f.componentRef.setInput('kompaktno', true);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-fajlovi-sazetak]')?.textContent).toBe('vezba.docx, podaci.xlsx');
  });

  it('prazan spisak (link za K): poruka umesto liste; stanje table samo kad je dato', () => {
    const f = TestBed.createComponent(FajloviKarticaComponent);
    f.componentRef.setInput('fajlovi', { ...fajlovi, fajlovi: [] });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-fajlovi-imena]')).toBeNull();
    expect(el.querySelector('[data-fajlovi-prazno]')).not.toBeNull();
    expect(el.querySelector('[data-fajlovi-tabla]')).toBeNull();
    f.componentRef.setInput('naTabli', false);
    f.detectChanges();
    expect(el.querySelector('[data-fajlovi-tabla]')?.textContent).toContain('nije na tabli');
    f.componentRef.setInput('naTabli', true);
    f.detectChanges();
    expect(el.querySelector('[data-fajlovi-tabla]')?.textContent).toContain('Link je na tabli');
  });
});

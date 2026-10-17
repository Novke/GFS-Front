import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { beforeEach, describe, expect, it } from 'vitest';

import { LatexEditorComponent } from './latex-editor.component';

@Component({
  imports: [LatexEditorComponent, ReactiveFormsModule],
  template: `
    <app-latex-editor oznaka="LaTeX zadatka" [formControl]="c" [greskaLinija]="linija()" [opisId]="opis()" (pregled)="pregledi = pregledi + 1" />
    <button type="button" id="drugo">drugo</button>
  `,
})
class Domacin {
  readonly c = new FormControl('', { nonNullable: true });
  readonly linija = signal<number | null>(null);
  readonly opis = signal<string | null>(null);
  pregledi = 0;
  readonly editor = viewChild.required(LatexEditorComponent);
}

describe('LatexEditorComponent', () => {
  let f: ComponentFixture<Domacin>;
  const el = () => f.nativeElement as HTMLElement;
  const polje = () => el().querySelector<HTMLTextAreaElement>('textarea')!;
  const brojevi = () => [...el().querySelectorAll<HTMLElement>('.bk-le-broj')].map(b => b.textContent!.trim());
  async function stabilno(): Promise<void> {
    await f.whenStable();
  }
  function kucaj(vrednost: string): void {
    polje().value = vrednost;
    polje().dispatchEvent(new Event('input', { bubbles: true }));
  }
  function taster(key: string, opcije: KeyboardEventInit = {}): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opcije });
    polje().dispatchEvent(e);
    return e;
  }

  beforeEach(async () => {
    f = TestBed.createComponent(Domacin);
    await stabilno();
  });

  it('oznaka je labela polja; monospace polje bez prelamanja, bez provere pravopisa', () => {
    const labela = el().querySelector('label')!;
    expect(labela.textContent!.trim()).toBe('LaTeX zadatka');
    expect(labela.htmlFor).toBe(polje().id);
    expect(polje().getAttribute('wrap')).toBe('off');
    expect(polje().getAttribute('spellcheck')).toBe('false');
  });

  it('gutter ima po broj za svaku liniju vrednosti i prati kucanje', async () => {
    expect(brojevi()).toEqual(['1']);
    f.componentInstance.c.setValue('a\nb\nc');
    await stabilno();
    expect(polje().value).toBe('a\nb\nc');
    expect(brojevi()).toEqual(['1', '2', '3']);

    kucaj('a\nb\nc\n');
    await stabilno();
    expect(f.componentInstance.c.value).toBe('a\nb\nc\n');
    expect(brojevi()).toEqual(['1', '2', '3', '4']);
    // gutter je samo vizuelan: čitač ekrana čita tekst polja
    expect(el().querySelector('.bk-le-brojevi')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('Tab ubacuje dva razmaka na mestu kursora (i umesto izbora) i javlja vrednost formi', async () => {
    f.componentInstance.c.setValue('ab\ncd');
    await stabilno();
    polje().setSelectionRange(1, 1);
    const e = taster('Tab');
    expect(e.defaultPrevented).toBe(true);
    expect(polje().value).toBe('a  b\ncd');
    expect(f.componentInstance.c.value).toBe('a  b\ncd');
    expect(polje().selectionStart).toBe(3);

    polje().setSelectionRange(5, 7);
    taster('Tab');
    expect(f.componentInstance.c.value).toBe('a  b\n  ');
  });

  it('Shift+Tab i Tab posle Esc ostaju pregledaču (nema zamke za tastaturu)', async () => {
    expect(taster('Tab', { shiftKey: true }).defaultPrevented).toBe(false);
    taster('Escape');
    expect(taster('Tab').defaultPrevented).toBe(false);
    // samo jedan Tab posle Esc: sledeći opet ubacuje razmake
    expect(taster('Tab').defaultPrevented).toBe(true);
    expect(f.componentInstance.c.value).toBe('  ');
    await stabilno();
    expect(el().querySelector('.bk-le-uputstvo')!.textContent).toContain('Esc');
  });

  it('Ctrl+Enter (i Cmd+Enter) emituje pregled, bez novog reda', () => {
    expect(taster('Enter', { ctrlKey: true }).defaultPrevented).toBe(true);
    taster('Enter', { metaKey: true });
    expect(f.componentInstance.pregledi).toBe(2);
    expect(taster('Enter').defaultPrevented).toBe(false);
    expect(f.componentInstance.pregledi).toBe(2);
  });

  it('greskaLinija ističe liniju u gutter-u i tekstu, polje je aria-invalid, opisano porukom greške', async () => {
    f.componentInstance.c.setValue('a\nb\nc\nd');
    f.componentInstance.linija.set(3);
    f.componentInstance.opis.set('greska-x');
    await stabilno();
    const istaknute = [...el().querySelectorAll('.bk-le-istaknuta')].map(b => b.textContent!.trim());
    expect(istaknute).toEqual(['3']);
    expect(el().querySelector<HTMLElement>('.bk-le-traka')!.style.getPropertyValue('--bk-le-linija')).toBe('2');
    expect(polje().getAttribute('aria-invalid')).toBe('true');
    const opisi = polje().getAttribute('aria-describedby')!.split(' ');
    expect(opisi).toContain('greska-x');
    expect(opisi).toContain(el().querySelector('.bk-le-uputstvo')!.id);

    f.componentInstance.linija.set(null);
    f.componentInstance.opis.set(null);
    await stabilno();
    expect(el().querySelectorAll('.bk-le-istaknuta').length).toBe(0);
    expect(el().querySelector('.bk-le-traka')).toBeNull();
    expect(polje().getAttribute('aria-invalid')).toBeNull();
    expect(polje().getAttribute('aria-describedby')).toBe(el().querySelector('.bk-le-uputstvo')!.id);
  });

  it('istaknuta linija se pomera u vidno polje, ali ne dok korisnik kuca u polju', async () => {
    f.componentInstance.c.setValue(Array.from({ length: 60 }, (_, i) => `linija ${i + 1}`).join('\n'));
    await stabilno();
    f.componentInstance.linija.set(50);
    await stabilno();
    expect(polje().scrollTop).toBeGreaterThan(0);
    // pomeraj gutter-a prati skrol polja
    expect(el().querySelector<HTMLElement>('app-latex-editor')!.style.getPropertyValue('--bk-le-pomak')).toBe(`${-polje().scrollTop}px`);

    polje().scrollTop = 0;
    polje().dispatchEvent(new Event('scroll'));
    polje().focus();
    f.componentInstance.linija.set(40);
    await stabilno();
    expect(polje().scrollTop).toBe(0);
  });

  it('skrol polja pomera gutter (CSS promenljiva)', () => {
    polje().scrollTop = 120;
    polje().dispatchEvent(new Event('scroll'));
    expect(el().querySelector<HTMLElement>('app-latex-editor')!.style.getPropertyValue('--bk-le-pomak')).toBe('-120px');
  });

  it('ubaci() umeće tekst na poslednji položaj kursora, fokusira polje i javlja vrednost', async () => {
    f.componentInstance.c.setValue('prvi\ndrugi');
    await stabilno();
    polje().setSelectionRange(5, 5);
    el().querySelector<HTMLButtonElement>('#drugo')!.focus();
    f.componentInstance.editor().ubaci('\\includegraphics{slika}\n');
    expect(f.componentInstance.c.value).toBe('prvi\n\\includegraphics{slika}\ndrugi');
    expect(document.activeElement).toBe(polje());
    expect(polje().selectionStart).toBe(5 + '\\includegraphics{slika}\n'.length);
  });

  it('onemogućena kontrola onemogućava polje; dodir javlja touched', async () => {
    f.componentInstance.c.disable();
    await stabilno();
    expect(polje().disabled).toBe(true);
    f.componentInstance.c.enable();
    await stabilno();
    expect(polje().disabled).toBe(false);
    polje().dispatchEvent(new Event('blur'));
    expect(f.componentInstance.c.touched).toBe(true);
  });
});

import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  beforeEach(async () => {
    f = TestBed.createComponent(Domacin);
    await stabilno();
  });

  it('oznaka je labela polja; monospace polje koje prelama dugačke redove, bez provere pravopisa', () => {
    const labela = el().querySelector('label')!;
    expect(labela.textContent!.trim()).toBe('LaTeX zadatka');
    expect(labela.htmlFor).toBe(polje().id);
    expect(polje().getAttribute('wrap')).toBe('soft');
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
    for (const red of el().querySelectorAll('.bk-le-red')) {
      expect(red.getAttribute('aria-hidden')).toBe('true');
    }
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

  it('držan Ctrl+Enter (ponavljanje tastera) ne emituje ponovo, niti dodaje novi red', () => {
    taster('Enter', { ctrlKey: true });
    for (let i = 0; i < 5; i++) {
      expect(taster('Enter', { ctrlKey: true, repeat: true }).defaultPrevented).toBe(true);
    }
    expect(f.componentInstance.pregledi).toBe(1);
  });

  it('greskaLinija ističe liniju u gutter-u i tekstu, polje je aria-invalid, opisano porukom greške', async () => {
    f.componentInstance.c.setValue('a\nb\nc\nd');
    f.componentInstance.linija.set(3);
    f.componentInstance.opis.set('greska-x');
    await stabilno();
    const istaknute = [...el().querySelectorAll('.bk-le-istaknuta')].map(b => b.textContent!.trim());
    expect(istaknute).toEqual(['3']);
    expect([...el().querySelectorAll('.bk-le-red')].map(r => r.classList.contains('bk-le-istaknut'))).toEqual([false, false, true, false]);
    expect(polje().getAttribute('aria-invalid')).toBe('true');
    const opisi = polje().getAttribute('aria-describedby')!.split(' ');
    expect(opisi).toContain('greska-x');
    expect(opisi).toContain(el().querySelector('.bk-le-uputstvo')!.id);

    f.componentInstance.linija.set(null);
    f.componentInstance.opis.set(null);
    await stabilno();
    expect(el().querySelectorAll('.bk-le-istaknuta').length).toBe(0);
    expect(el().querySelectorAll('.bk-le-istaknut').length).toBe(0);
    expect(polje().getAttribute('aria-invalid')).toBeNull();
    expect(polje().getAttribute('aria-describedby')).toBe(el().querySelector('.bk-le-uputstvo')!.id);
  });

  it('svaka linija je jedan red sa ogledalom teksta (visina reda prati prelomljen tekst)', async () => {
    f.componentInstance.c.setValue('prva linija\n\ntreća');
    await stabilno();
    const ogledala = [...el().querySelectorAll('.bk-le-ogledalo')].map(o => o.textContent);
    expect(ogledala).toEqual(['prva linija', '', 'treća']);
  });

  it('istaknuta linija se pomera u vidno polje, ali ne dok korisnik kuca u polju', async () => {
    const pomeri = vi.fn();
    Element.prototype.scrollIntoView = pomeri;
    f.componentInstance.c.setValue(Array.from({ length: 60 }, (_, i) => `linija ${i + 1}`).join('\n'));
    await stabilno();
    f.componentInstance.linija.set(50);
    await stabilno();
    expect(pomeri).toHaveBeenCalledTimes(1);
    expect(pomeri.mock.contexts[0]).toBe(el().querySelectorAll('.bk-le-red')[49]);

    polje().focus();
    f.componentInstance.linija.set(40);
    await stabilno();
    expect(pomeri).toHaveBeenCalledTimes(1);
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

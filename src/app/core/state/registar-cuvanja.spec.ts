import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { NesacuvaneIzmene } from './nesacuvane-izmene';
import { bezPrekidaReda, RegistarCuvanja, SesijaCuvanja } from './registar-cuvanja';

class Sesija implements SesijaCuvanja {
  uToku = 0;
  readonly mirovanje = new Subject<void>();
  constructor(readonly kljuc: string) {}
  nesacuvano(): number {
    return this.uToku;
  }
  zavrsi(): void {
    this.uToku--;
    if (this.uToku === 0) {
      this.mirovanje.next();
    }
  }
}

describe('RegistarCuvanja', () => {
  it('sacekaj: odmah kad nema zauzetih sesija istog ključa', () => {
    const r = TestBed.inject(RegistarCuvanja);
    const tudja = new Sesija('test-6');
    tudja.uToku = 1;
    r.prijavi(tudja);
    r.prijavi(new Sesija('test-5'));
    const gotovo = vi.fn();
    r.sacekaj('test-5').subscribe(gotovo);
    expect(gotovo).toHaveBeenCalledTimes(1);
  });

  it('sacekaj: čeka sve zauzete sesije istog ključa, i one prijavljene u međuvremenu', () => {
    const r = TestBed.inject(RegistarCuvanja);
    const a = new Sesija('domaci-5');
    const b = new Sesija('domaci-5');
    a.uToku = 1;
    b.uToku = 2;
    r.prijavi(a);
    r.prijavi(b);
    const gotovo = vi.fn();
    r.sacekaj('domaci-5').subscribe(gotovo);
    a.zavrsi();
    b.zavrsi();
    const c = new Sesija('domaci-5'); // npr. drugi ekran istog domaćeg je u međuvremenu poslao izmenu
    c.uToku = 1;
    r.prijavi(c);
    b.zavrsi();
    expect(gotovo).not.toHaveBeenCalled();
    c.zavrsi();
    expect(gotovo).toHaveBeenCalledTimes(1);
  });

  it('prijavljene sesije se vide u NesacuvaneIzmene; odjavljene ne', () => {
    const r = TestBed.inject(RegistarCuvanja);
    const s = new Sesija('predavanje-5');
    s.uToku = 2;
    r.prijavi(s);
    expect(TestBed.inject(NesacuvaneIzmene).broj()).toBe(2);
    r.odjavi(s);
    expect(TestBed.inject(NesacuvaneIzmene).broj()).toBe(0);
  });
});

describe('bezPrekidaReda', () => {
  it('izuzetak posla ide u ErrorHandler, a tok se završava bez greške', () => {
    const greske = { handleError: vi.fn() } as unknown as ErrorHandler;
    const kraj = vi.fn();
    const greska = vi.fn();
    bezPrekidaReda(throwError(() => new Error('pukao handler')), greske).subscribe({ complete: kraj, error: greska });
    expect(kraj).toHaveBeenCalled();
    expect(greska).not.toHaveBeenCalled();
    expect(greske.handleError).toHaveBeenCalledWith(new Error('pukao handler'));
  });
});

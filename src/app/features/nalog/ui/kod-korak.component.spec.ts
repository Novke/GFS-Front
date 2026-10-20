import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CEKANJE_PONOVO_S, KodKorak } from './kod-korak.component';

/** Korak "kod" (spec prijave 5.1 tačke 2 i 4): prezentaciona komponenta, F5 (`nalog/moodle`) je koristi isto. */
describe('KodKorak', () => {
  let fixture: ComponentFixture<KodKorak>;
  const el = () => fixture.nativeElement as HTMLElement;
  const polje = () => el().querySelector<HTMLInputElement>('input[name="kod"]')!;
  const dugme = (tekst: string) =>
    [...el().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim().startsWith(tekst))!;

  function napravi(): void {
    fixture = TestBed.createComponent(KodKorak);
    fixture.componentRef.setInput('indeks', 'GD12');
    fixture.componentRef.setInput('maska', 'n***@example.test');
    fixture.componentRef.setInput('poruka', 'Ako nalog postoji, kod je poslat.');
    fixture.componentRef.setInput('slanjeBroj', 1);
    fixture.detectChanges();
  }

  function upisi(vrednost: string): void {
    polje().value = vrednost;
    polje().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    napravi();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('polje koda: numerička tastatura, autofill jednokratnog koda, 6 cifara', () => {
    const p = polje();
    expect(p.getAttribute('inputmode')).toBe('numeric');
    expect(p.getAttribute('autocomplete')).toBe('one-time-code');
    expect(p.getAttribute('maxlength')).toBe('6');
    expect(el().textContent).toContain('Ako nalog postoji, kod je poslat.');
    expect(el().textContent).toContain('n***@example.test');
    expect(el().textContent).toContain('Kod ide na mejl koji si dao pri upisu. Proveri i Spam. Ako ga nemaš, nastavnik može da upiše novi.');
  });

  it('nalepljen kod sa razmacima (i crticom) postaje 6 cifara', () => {
    // jsdom nema ClipboardEvent/DataTransfer: isti oblik koji komponenta čita (`clipboardData.getData('text')`)
    const dogadjaj = new Event('paste', { cancelable: true, bubbles: true });
    Object.defineProperty(dogadjaj, 'clipboardData', { value: { getData: () => ' 123 456 ' } });
    polje().dispatchEvent(dogadjaj);
    fixture.detectChanges();
    expect(dogadjaj.defaultPrevented).toBe(true);
    expect(polje().value).toBe('123456');

    upisi('12-34 5');
    expect(polje().value).toBe('12345');
  });

  it('"Prijavi se" šalje tačno 6 cifara; manje cifara: poruka, bez izlaza', () => {
    const prijavi = vi.fn();
    fixture.componentInstance.prijavi.subscribe(prijavi);
    upisi('12345');
    dugme('Prijavi se').click();
    fixture.detectChanges();
    expect(prijavi).not.toHaveBeenCalled();
    expect(el().textContent).toContain('Kod ima 6 cifara.');

    upisi('123456');
    dugme('Prijavi se').click();
    expect(prijavi).toHaveBeenCalledExactlyOnceWith('123456');
  });

  it(`"Pošalji ponovo" tek posle ${CEKANJE_PONOVO_S} s; novo slanje ponovo čeka`, async () => {
    const ponovo = vi.fn();
    fixture.componentInstance.posaljiPonovo.subscribe(ponovo);
    expect(dugme('Pošalji ponovo').disabled).toBe(true);
    expect(dugme('Pošalji ponovo').textContent).toContain('60 s');

    await vi.advanceTimersByTimeAsync(59_000);
    fixture.detectChanges();
    expect(dugme('Pošalji ponovo').disabled).toBe(true);
    expect(dugme('Pošalji ponovo').textContent).toContain('1 s');
    dugme('Pošalji ponovo').click();
    expect(ponovo).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    fixture.detectChanges();
    expect(dugme('Pošalji ponovo').disabled).toBe(false);
    dugme('Pošalji ponovo').click();
    expect(ponovo).toHaveBeenCalledOnce();

    // roditelj javi novo slanje: tajmer kreće ispočetka
    fixture.componentRef.setInput('slanjeBroj', 2);
    fixture.detectChanges();
    expect(dugme('Pošalji ponovo').disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(CEKANJE_PONOVO_S * 1000);
    fixture.detectChanges();
    expect(dugme('Pošalji ponovo').disabled).toBe(false);
  });

  it('greška servera posle slanja koda: polje se prazni (fokus ostaje na traci greške)', async () => {
    upisi('111111');
    expect(polje().value).toBe('111111');
    fixture.componentRef.setInput('greska', 'Kod nije ispravan ili je istekao.');
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(polje().value).toBe('');
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Kod nije ispravan ili je istekao.');
  });

  it('dok se kod šalje (salje=true) greška ne briše upisane cifre', async () => {
    upisi('111111');
    fixture.componentRef.setInput('salje', true);
    fixture.componentRef.setInput('greska', 'Neka greška.');
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    expect(polje().value).toBe('111111');
  });

  it('"Ne stiže mi kod" i "Drugi indeks" su izlazi; odgovor pomoći je status', () => {
    const neStize = vi.fn();
    const drugi = vi.fn();
    fixture.componentInstance.neStize.subscribe(neStize);
    fixture.componentInstance.promeniIndeks.subscribe(drugi);
    dugme('Ne stiže mi kod').click();
    dugme('Drugi indeks').click();
    expect(neStize).toHaveBeenCalledOnce();
    expect(drugi).toHaveBeenCalledOnce();

    fixture.componentRef.setInput('pomoc', 'Javili smo nastavniku.');
    fixture.detectChanges();
    expect(el().querySelector('[role="status"]')?.textContent).toContain('Javili smo nastavniku.');
  });
});

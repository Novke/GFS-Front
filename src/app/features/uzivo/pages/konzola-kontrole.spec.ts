import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { naPitanju, naZadatku } from '../data-access/izvodjenje-podaci.testing';
import { dozvoljeneKomande } from '../data-access/izvodjenje-pravila';
import { TasterAkcija } from '../tastatura';
import { KomandaZahtev, KonzolaKontroleComponent } from './konzola-kontrole.component';
import { TastaturaIzvodjenja } from './precice';

/** Kontrole plus prečice na `document`, kao u konzoli. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KonzolaKontroleComponent],
  host: { '(document:keydown)': 'dole($event)', '(document:keyup)': 'tast.pusten($event)' },
  template: `<app-konzola-kontrole [stanje]="stanje()" [dozvoljene]="dozvoljene()" (komanda)="kliknuto.push($event)" />`,
})
class DomacinKontrola {
  readonly stanje = signal(naPitanju('ZATVORENO', { takmicenje: true }));
  readonly dozvoljene = signal(dozvoljeneKomande(this.stanje()));
  readonly tast = new TastaturaIzvodjenja();
  readonly kliknuto: KomandaZahtev[] = [];
  readonly precice: TasterAkcija[] = [];
  dole(e: KeyboardEvent): void {
    const a = this.tast.akcija(e, 3, false);
    if (a) this.precice.push(a);
  }
}

describe('KonzolaKontroleComponent', () => {
  function dugme(el: HTMLElement, tekst: string): HTMLButtonElement {
    return [...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent!.includes(tekst))!;
  }

  it('klik mišem pa Space: REZULTATI, a ne kliknuta komanda; dugme ne zadržava fokus', () => {
    const f = TestBed.createComponent(DomacinKontrola);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    document.body.appendChild(el);
    const qr = dugme(el, 'QR preko ekrana');
    qr.focus();
    qr.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(f.componentInstance.kliknuto).toEqual([{ tip: 'QR', vrednost: undefined }]);
    expect(document.activeElement).not.toBe(qr);

    // I kad fokus ostane na dugmetu (npr. posle Tab-a), Space je prečica, a keyup ne klikne dugme.
    qr.focus();
    const dole = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    qr.dispatchEvent(dole);
    const gore = new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true });
    qr.dispatchEvent(gore);
    expect(f.componentInstance.precice).toEqual([{ komanda: 'REZULTATI' }]);
    expect(dole.defaultPrevented).toBe(true);
    expect(gore.defaultPrevented).toBe(true);
    expect(f.componentInstance.kliknuto.length).toBe(1);
    el.remove();
  });

  it('klik sa tastature (detail 0) zadržava fokus za Tab navigaciju', () => {
    const f = TestBed.createComponent(DomacinKontrola);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    document.body.appendChild(el);
    const qr = dugme(el, 'QR preko ekrana');
    qr.focus();
    qr.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(document.activeElement).toBe(qr);
    el.remove();
  });

  it('dugmad van faze su onemogućena (TAJMER kad je pitanje zatvoreno)', () => {
    const f = TestBed.createComponent(DomacinKontrola);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(dugme(el, 'Pokreni tajmer').disabled).toBe(true);
    expect(dugme(el, 'Tačan odgovor').disabled).toBe(false);
  });

  it('Rešenje (Shift+R): onemogućeno u CEKA i na pitanju, prekidač posle zatvaranja Zadatak runde', () => {
    const f = TestBed.createComponent(DomacinKontrola);
    const postavi = (s: ReturnType<typeof naZadatku>) => {
      f.componentInstance.stanje.set(s);
      f.componentInstance.dozvoljene.set(dozvoljeneKomande(s));
      f.detectChanges();
    };
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const resenje = () => dugme(el, 'Rešenje');
    // pitanje: dugme postoji, ali nema šta da prikaže
    expect(resenje().disabled).toBe(true);
    expect(resenje().getAttribute('aria-keyshortcuts')).toBe('Shift+R');
    expect(resenje().querySelector('kbd')?.textContent).toBe('Shift+R');

    postavi(naZadatku('CEKA'));
    expect(resenje().disabled).toBe(true);
    expect(resenje().getAttribute('aria-pressed')).toBe('false');
    expect(dugme(el, 'Ponovi zadatak')).toBeDefined();

    postavi(naZadatku('ZATVORENO'));
    expect(resenje().disabled).toBe(false);
    expect(resenje().getAttribute('aria-pressed')).toBe('false');
    resenje().click();
    expect(f.componentInstance.kliknuto.at(-1)).toEqual({ tip: 'RESENJE', vrednost: undefined });

    postavi(naZadatku('ZATVORENO', { zadatak: { resenjePrikazano: true } }));
    expect(resenje().getAttribute('aria-pressed')).toBe('true');
    expect(resenje().classList).toContain('uz-kon-dugme--ukljuceno');

    document.body.appendChild(el);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', shiftKey: true, bubbles: true, cancelable: true }));
    expect(f.componentInstance.precice.at(-1)).toEqual({ komanda: 'RESENJE' });
    el.remove();
  });
});

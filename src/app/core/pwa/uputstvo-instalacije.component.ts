import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { PonudaInstalacije } from './instalacija';
import { NacinInstalacije } from './instalacija.pravila';

type Rucno = 'android' | 'ios-safari' | null;

/**
 * Šta tačno da uradi korisnik (spec „Aplikacija i obaveštenja“ 4.3 i skica telefona A i B): dugme „Instaliraj“ kad je browser
 * poslao ponudu, inače uputstvo za iPhone (Safari ili Chrome; natpisi i na engleskom, jer većina iPhone-a nije na srpskom),
 * za Android bez ponude ili za računar. Ispod je ručni izbor „Nije tvoj telefon?“. Bez Material-a i bez HTTP poziva
 * (koristi je i javni nalog studenta); dugme „Već sam dodao“ i ishod instalacije idu roditelju.
 */
@Component({
  selector: 'app-uputstvo-instalacije',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (prikaz()) {
      @case ('ponuda') {
        <div class="akcije">
          <button type="button" class="dugme glavno" (click)="instaliraj()" data-instaliraj>Instaliraj</button>
          <ng-content select="[dodatna-akcija]" />
        </div>
      }
      @case ('instalirano') {
        <p class="tekst" data-instalirano>Već koristiš aplikaciju GFS na ovom uređaju.</p>
      }
      @case ('android') {
        <ol class="koraci" data-uputstvo="android">
          <li>Otvori ovu stranicu u <strong>Chrome-u</strong>. Ako si u Gmail-u, WhatsApp-u ili Instagramu: meni
            <span class="znak">⋮</span> → <strong>Otvori u browseru</strong>.</li>
          <li>Meni <span class="znak">⋮</span> → <strong>Instaliraj aplikaciju</strong> ili <strong>Dodaj na početni ekran</strong>.</li>
        </ol>
      }
      @case ('racunar') {
        <p class="tekst" data-uputstvo="racunar">U Chrome-u ili Edge-u: ikonica za instalaciju na desnom kraju adresne trake ili meni
          <span class="znak">⋮</span> → <strong>Instaliraj GFS</strong>. Safari na Mac-u: <strong>File → Add to Dock</strong>.</p>
      }
      @default {
        <ol class="koraci" [attr.data-uputstvo]="prikaz()">
          <li>
            <span class="slika" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4" /><path d="M7 10H5v11h14V10h-2" /></svg>
            </span>
            @if (prikaz() === 'ios-safari') {
              <span>Dodirni <strong>Podeli</strong> (Share) dole u Safari-ju. Ako ga ne vidiš, prvo <span class="znak">•••</span>.</span>
            } @else {
              <span>Dodirni <strong>Podeli</strong> (Share) desno u adresnoj traci ili u meniju <span class="znak">•••</span>.</span>
            }
          </li>
          <li>
            <span class="slika" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" /></svg>
            </span>
            <span>Pomeri listu i izaberi <strong>Dodaj na početni ekran</strong> (Add to Home Screen).</span>
          </li>
          <li>
            <span class="slika broj" aria-hidden="true">3</span>
            <span>Ostavi uključeno <strong>Otvori kao veb aplikaciju</strong> (Open as Web App) i dodirni <strong>Dodaj</strong> (Add).</span>
          </li>
        </ol>
        <p class="pomoc">Ako nema „Podeli“, otvori stranicu u Safari-ju. Zapne? Pokaži nastavniku na času.</p>
        <div class="akcije">
          <button type="button" class="dugme" (click)="dodao.emit()" data-dodao>Već sam dodao</button>
          <ng-content select="[dodatna-akcija]" />
        </div>
      }
    }
    @if (prikaz() !== 'instalirano' && prikaz() !== 'ponuda') {
      <p class="rucno">Nije tvoj telefon? Uputstvo za
        <button type="button" class="veza" (click)="rucno.set('android')" data-rucno="android">Android</button> ·
        <button type="button" class="veza" (click)="rucno.set('ios-safari')" data-rucno="iphone">iPhone</button>
      </p>
    }
  `,
  styles: `
    :host { display: block; }
    .tekst, .pomoc { margin: 8px 0 0; }
    .pomoc { color: var(--muted); font-size: 13px; }
    .koraci { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
    .koraci li { display: flex; gap: 10px; align-items: flex-start; }
    ol[data-uputstvo='android'] { padding-left: 20px; list-style: decimal; }
    ol[data-uputstvo='android'] li { display: list-item; }
    .slika { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px;
      border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--primary); }
    .slika svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round;
      stroke-linejoin: round; }
    .slika.broj { font-weight: 700; }
    .znak { font-weight: 700; white-space: nowrap; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .dugme { min-height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
    .dugme.glavno { border-color: var(--primary); background: var(--primary); color: var(--primary-ink); }
    .dugme:focus-visible, .veza:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .rucno { margin: 10px 0 0; color: var(--muted); font-size: 13px; }
    .veza { min-height: 32px; padding: 0 2px; border: 0; background: none; color: var(--primary); font: inherit;
      text-decoration: underline; cursor: pointer; }
  `,
})
export class UputstvoInstalacije {
  private readonly ponuda = inject(PonudaInstalacije);

  /** Način iz detekcije; ručni izbor ga zamenjuje. */
  readonly nacin = input.required<NacinInstalacije>();
  readonly dodao = output<void>();
  readonly ishod = output<'prihvaceno' | 'odbijeno' | 'nema'>();

  protected readonly rucno = signal<Rucno>(null);
  protected readonly prikaz = computed<NacinInstalacije>(() => this.rucno() ?? this.nacin());

  protected async instaliraj(): Promise<void> {
    this.ishod.emit(await this.ponuda.instaliraj());
  }
}

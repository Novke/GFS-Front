import { ChangeDetectionStrategy, Component, computed, DestroyRef, DOCUMENT, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { PushUredjaj } from '../../../core/pwa/push-uredjaj';
import { ObavestenjaApi } from '../data-access/obavestenja.api';
import { porukaGreske } from '../data-access/nalog.pravila';
import { PortalApi } from '../data-access/portal.api';
import { PodesavanjaNaloga } from '../data-access/portal.models';

type Prekidac = keyof PodesavanjaNaloga;

interface Vrsta {
  naziv: string;
  telefon: Prekidac;
  /** `null`: u zvonu uvek (otkazan čas) ili nikad (podsetnik, `zvonoNikad`). */
  zvono: Prekidac | null;
  zvonoNikad?: boolean;
}

const VRSTE: readonly Vrsta[] = [
  { naziv: 'Podsetnik dan pre časa', telefon: 'pushPodsetnik', zvono: null, zvonoNikad: true },
  { naziv: 'Čas otkazan / ipak se održava', telefon: 'pushOtkazanCas', zvono: null },
  { naziv: 'Ocene objavljene', telefon: 'pushOcene', zvono: 'zvonoOcene' },
  { naziv: 'Posle časa: prezentacija i vežbanje', telefon: 'pushPosleCasa', zvono: 'zvonoPosleCasa' },
];

/**
 * Kartica „Obaveštenja“ na tabu Ja (spec „Aplikacija i obaveštenja“ 6.5 i 6.8, skica telefona C). **Samostalna:** sama
 * učitava i čuva, bez ulaza i izlaza.
 *
 * - **Ovaj uređaj** (`PushUredjaj` nad `api/public/nalog/push`): stanje, „Uključi obaveštenja“ (dozvola se traži tek na
 *   dodir), „Probno obaveštenje“, „Isključi“. Na iPhone-u u browseru: push radi samo iz aplikacije sa početnog ekrana.
 * - **Šta mi javljaš** (`GET|PUT api/public/nalog/podesavanja`, važi za sve uređaje studenta): po vrsti „Telefon“ i „Zvono“;
 *   otkazan čas je u zvonu uvek, podsetnik nikad. Ispod „Javi mi mejlom kad je čas otkazan“ (mejl samo za tu vrstu).
 *   Promena se odmah prikazuje i šalje (ceo objekat); greška vraća prethodno stanje i prikazuje poruku servera. Stariji
 *   backend bez push polja: vidi se samo mejl.
 */
@Component({
  selector: 'app-podesavanja-obavestenja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="kartica" aria-labelledby="naslov-obavestenja" data-podesavanja>
      <h3 id="naslov-obavestenja">Obaveštenja</h3>

      <div class="uredjaj" data-push [attr.data-stanje]="push.stanje()">
        <h4>Na ovom uređaju</h4>
        @switch (push.stanje()) {
          @case ('ucitavanje') {
            <p class="opis" role="status">Učitavanje...</p>
          }
          @case ('ukljuceno') {
            <p class="opis"><strong>Uključena.</strong> Stižu na ovaj uređaj i kad je aplikacija zatvorena.</p>
            <div class="akcije">
              <button type="button" class="dugme" [disabled]="push.radi()" (click)="push.proba()" data-proba>Probno obaveštenje</button>
              <button type="button" class="dugme" [disabled]="push.radi()" (click)="push.iskljuci()" data-iskljuci-push>Isključi</button>
            </div>
          }
          @case ('iskljuceno') {
            <p class="opis">Isključena. Telefon će te pitati za dozvolu.</p>
            <div class="akcije">
              <button type="button" class="dugme glavno" [disabled]="push.radi()" (click)="push.ukljuci()" data-ukljuci-push>
                Uključi obaveštenja
              </button>
            </div>
          }
          @case ('samo-iz-aplikacije') {
            <p class="opis">Na iPhone-u obaveštenja stižu samo u aplikaciji sa početnog ekrana. Dodaj GFS na početni ekran
              (uputstvo je ispod, „Aplikacija na telefonu“), otvori ga odatle i uključi obaveštenja.</p>
          }
          @case ('blokirano') {
            <p class="opis">Obaveštenja su zabranjena za ovaj sajt. Dozvoli ih u podešavanjima browsera (katanac ili ⓘ pored adrese
              → Obaveštenja), ili na iPhone-u: Settings → Notifications → GFS. Pa osveži stranicu.</p>
          }
          @case ('nepodrzano') {
            <p class="opis">Ovaj browser ne prima obaveštenja. Otvori GFS u Chrome-u ili ga instaliraj na telefon.</p>
          }
          @default {
            <p class="greska" role="alert">{{ push.poruka() }}</p>
            <button type="button" class="dugme" (click)="push.ucitaj()">Pokušaj ponovo</button>
          }
        }
        @if (push.stanje() !== 'greska' && push.poruka(); as p) {
          <p class="poruka" role="status" data-poruka-push>{{ p }}</p>
        }
      </div>

      @if (stanje(); as s) {
        @if (imaPush()) {
          <h4>Šta mi javljaš</h4>
          <ul class="vrste">
            @for (v of vrste; track v.telefon) {
              <li class="vrsta">
                <span class="naziv">{{ v.naziv }}</span>
                <label class="izbor">
                  <input type="checkbox" [checked]="s[v.telefon] !== false" [disabled]="salje()" (change)="promeni(v.telefon, $event)"
                         [attr.aria-label]="'Telefon: ' + v.naziv" [attr.data-prekidac]="v.telefon" />
                  <span>Telefon</span>
                </label>
                @if (v.zvono; as z) {
                  <label class="izbor">
                    <input type="checkbox" [checked]="s[z] !== false" [disabled]="salje()" (change)="promeni(z, $event)"
                           [attr.aria-label]="'Zvono: ' + v.naziv" [attr.data-prekidac]="z" />
                    <span>Zvono</span>
                  </label>
                } @else if (!v.zvonoNikad) {
                  <span class="izbor uvek" title="Otkazan čas je uvek u zvonu">Zvono: uvek</span>
                }
              </li>
            }
          </ul>
        }
        <label class="izbor mejl">
          <input type="checkbox" [checked]="s.mejlOtkazanCas" [disabled]="salje()" (change)="promeni('mejlOtkazanCas', $event)"
                 aria-describedby="pomoc-obavestenja" data-mejl-otkazan />
          <span>Javi mi mejlom kad je čas otkazan</span>
        </label>
        <p class="pomoc" id="pomoc-obavestenja">I kad se otkazan čas ipak održava. Mejl stiže na adresu sa tvog naloga.</p>
        @if (greska(); as g) {
          <p class="greska" role="alert">{{ g }}</p>
        } @else if (sacuvano()) {
          <p class="sacuvano" role="status" data-sacuvano>Sačuvano.</p>
        }
      } @else if (greska(); as g) {
        <p class="greska" role="alert">{{ g }}</p>
        <button type="button" class="dugme" (click)="ucitaj()">Pokušaj ponovo</button>
      } @else {
        <p class="stanje" role="status">Učitavanje...</p>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .kartica { margin: 16px 0 0; padding: 12px 16px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); }
    h3 { margin: 0 0 8px; font-size: 16px; }
    h4 { margin: 12px 0 6px; font-size: 14px; color: var(--ink-2); }
    .uredjaj h4 { margin-top: 0; }
    .uredjaj { padding-bottom: 12px; border-bottom: 1px solid var(--line); }
    .opis { margin: 0; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .dugme { min-height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
    .dugme.glavno { border-color: var(--primary); background: var(--primary); color: var(--primary-ink); }
    .dugme:disabled { opacity: .6; cursor: default; }
    .dugme:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .vrste { margin: 0; padding: 0; list-style: none; }
    .vrsta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; padding: 6px 0; border-bottom: 1px solid var(--line); }
    .naziv { flex: 1 1 100%; font-weight: 600; }
    .izbor { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; cursor: pointer; }
    .izbor input { width: 20px; height: 20px; margin: 0; flex: none; accent-color: var(--primary); }
    .izbor.uvek { color: var(--muted); font-size: 13px; cursor: default; }
    .izbor.mejl { display: flex; margin-top: 8px; min-height: 44px; font-weight: 600; }
    .pomoc { margin: 0 0 0 28px; color: var(--muted); font-size: 13px; }
    .greska { margin: 8px 0 0; color: var(--danger); }
    .poruka, .sacuvano { margin: 8px 0 0; color: var(--ink-2); font-size: 13px; }
    .stanje { margin: 0; color: var(--muted); }
  `,
})
export class PodesavanjaObavestenja {
  private readonly api = inject(PortalApi);

  protected readonly vrste = VRSTE;
  protected readonly push = new PushUredjaj(inject(ObavestenjaApi), inject(DOCUMENT), porukaGreske);
  protected readonly stanje = signal<PodesavanjaNaloga | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly salje = signal(false);
  protected readonly sacuvano = signal(false);
  /** Backend zna za push i zvono (stariji vraća samo `mejlOtkazanCas`). */
  protected readonly imaPush = computed(() => this.stanje()?.pushOtkazanCas !== undefined);
  private zahtev?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
    this.ucitaj();
    void this.push.ucitaj();
  }

  protected ucitaj(): void {
    this.zahtev?.unsubscribe();
    this.greska.set(null);
    this.zahtev = this.api.podesavanja().subscribe({
      next: p => this.stanje.set(p),
      error: (e: unknown) => this.greska.set(porukaGreske(e)),
    });
  }

  protected promeni(polje: Prekidac, e: Event): void {
    const pre = this.stanje();
    if (!pre || this.salje()) {
      return;
    }
    const novo: PodesavanjaNaloga = { ...pre, [polje]: (e.target as HTMLInputElement).checked };
    this.stanje.set(novo);
    this.salje.set(true);
    this.greska.set(null);
    this.sacuvano.set(false);
    this.zahtev?.unsubscribe();
    this.zahtev = this.api.sacuvajPodesavanja(novo).subscribe({
      next: p => {
        this.salje.set(false);
        this.stanje.set(p);
        this.sacuvano.set(true);
      },
      error: (err: unknown) => {
        this.salje.set(false);
        this.stanje.set(pre);
        this.greska.set(porukaGreske(err));
      },
    });
  }
}

import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, DOCUMENT, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCheckbox, MatCheckboxChange } from '@angular/material/checkbox';
import { Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { PonudaInstalacije } from '../../../core/pwa/instalacija';
import { PushUredjaj } from '../../../core/pwa/push-uredjaj';
import { UputstvoInstalacije } from '../../../core/pwa/uputstvo-instalacije.component';
import { ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { NastavnikPushApi, VrstaPushaNastavnika } from '../data-access/push.api';

const greskaZa = (e: unknown) => (e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);

/**
 * Podešavanja -> Obaveštenja na telefonu (nastavnik; spec „Aplikacija i obaveštenja“ 4.3 i 6.6): aplikacija na telefonu
 * (`UputstvoInstalacije`; ovde vodi i stavka „Instaliraj na telefon“ iz menija naloga), push na ovom uređaju (`PushUredjaj`
 * nad `api/push`; dozvola tek na dodir) i vrste obaveštenja iz zvona koje stižu kao push (`api/push/podesavanja`, važe
 * za sve nastavnikove uređaje). Greške su na stranici, ne u snackbar-u.
 */
@Component({
  selector: 'app-obavestenja-telefona-page',
  imports: [ErrorPanel, MatButton, MatCheckbox, PageHeader, SkeletonRows, UputstvoInstalacije],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Obaveštenja na telefonu"
                     podnaslov="GFS kao aplikacija na telefonu i push za obaveštenja iz zvona (mnogo najava, studentu ne stiže kod)." />

    <section class="kartica" aria-labelledby="ot-aplikacija" data-aplikacija>
      <h2 id="ot-aplikacija">Aplikacija na telefonu</h2>
      <p class="uvod">Otvori ovu stranicu na telefonu. Ikonica otvara kontrolnu tablu, a push stiže i kad je aplikacija zatvorena.</p>
      <app-uputstvo-instalacije [nacin]="ponuda.prikaz().nacin" />
    </section>

    <section class="kartica" aria-labelledby="ot-uredjaj" data-push [attr.data-stanje]="push.stanje()">
      <h2 id="ot-uredjaj">Na ovom uređaju</h2>
      @switch (push.stanje()) {
        @case ('ucitavanje') {
          <app-skeleton-rows redovi="1" />
        }
        @case ('ukljuceno') {
          <p class="uvod"><strong>Uključena.</strong> Obaveštenja stižu na ovaj uređaj.</p>
          <div class="akcije">
            <button matButton="filled" type="button" [disabled]="push.radi()" (click)="push.proba()" data-proba>Probno obaveštenje</button>
            <button matButton type="button" [disabled]="push.radi()" (click)="push.iskljuci()" data-iskljuci-push>Isključi</button>
          </div>
        }
        @case ('iskljuceno') {
          <p class="uvod">Isključena. Browser će pitati za dozvolu.</p>
          <button matButton="filled" type="button" [disabled]="push.radi()" (click)="push.ukljuci()" data-ukljuci-push>
            Uključi obaveštenja
          </button>
        }
        @case ('samo-iz-aplikacije') {
          <p class="uvod">Na iPhone-u push radi samo iz aplikacije sa početnog ekrana: dodaj GFS (gore), otvori ga odatle i uključi ovde.</p>
        }
        @case ('blokirano') {
          <p class="uvod">Obaveštenja su zabranjena za ovaj sajt. Dozvoli ih u podešavanjima browsera (katanac pored adrese), pa osveži stranicu.</p>
        }
        @case ('nepodrzano') {
          <p class="uvod">Ovaj browser ne prima push obaveštenja.</p>
        }
        @default {
          <app-error-panel [poruka]="push.poruka()" (ponovo)="push.ucitaj()" />
        }
      }
      @if (push.stanje() !== 'greska' && push.poruka(); as p) {
        <p class="poruka" role="status" data-poruka-push>{{ p }}</p>
      }
    </section>

    <section class="kartica" aria-labelledby="ot-vrste" data-vrste>
      <h2 id="ot-vrste">Šta mi javljaš</h2>
      @if (vrste(); as lista) {
        <ul class="vrste">
          @for (v of lista; track v.vrsta) {
            <li>
              <mat-checkbox [checked]="v.ukljuceno" [disabled]="salje()" (change)="promeni(v, $event)" [attr.data-vrsta]="v.vrsta">
                {{ v.naziv }}
              </mat-checkbox>
            </li>
          }
        </ul>
        @if (greskaVrste(); as g) {
          <p class="greska" role="alert">{{ g }}</p>
        }
      } @else if (greskaVrste(); as g) {
        <app-error-panel [poruka]="g" (ponovo)="ucitajVrste()" />
      } @else {
        <app-skeleton-rows redovi="3" />
      }
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; }
    .kartica { padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
      box-shadow: var(--shadow); min-width: 0; max-width: 720px; }
    h2 { margin: 0 0 12px; font-size: 17px; }
    .uvod { margin: 0 0 12px; color: var(--ink-2); }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; }
    .poruka { margin: 10px 0 0; color: var(--ink-2); }
    .greska { margin: 10px 0 0; color: var(--danger); }
    .vrste { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
  `,
})
export class ObavestenjaTelefonaPage {
  private readonly api = inject(NastavnikPushApi);
  protected readonly ponuda = inject(PonudaInstalacije);
  protected readonly push = new PushUredjaj(this.api, inject(DOCUMENT), greskaZa);
  protected readonly vrste = signal<VrstaPushaNastavnika[] | null>(null);
  protected readonly greskaVrste = signal<string | null>(null);
  protected readonly salje = signal(false);
  private zahtev?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
    void this.push.ucitaj();
    this.ucitajVrste();
  }

  protected ucitajVrste(): void {
    this.zahtev?.unsubscribe();
    this.greskaVrste.set(null);
    this.zahtev = this.api.vrste().subscribe({
      next: v => this.vrste.set(v),
      error: (e: unknown) => this.greskaVrste.set(greskaZa(e)),
    });
  }

  protected promeni(v: VrstaPushaNastavnika, e: MatCheckboxChange): void {
    const pre = this.vrste();
    if (!pre || this.salje()) {
      return;
    }
    this.vrste.set(pre.map(x => (x.vrsta === v.vrsta ? { ...x, ukljuceno: e.checked } : x)));
    this.salje.set(true);
    this.greskaVrste.set(null);
    this.zahtev?.unsubscribe();
    this.zahtev = this.api.promeniVrstu(v.vrsta, e.checked).subscribe({
      next: lista => {
        this.salje.set(false);
        this.vrste.set(lista);
      },
      error: (err: unknown) => {
        this.salje.set(false);
        this.vrste.set(pre);
        this.greskaVrste.set(greskaZa(err));
      },
    });
  }
}

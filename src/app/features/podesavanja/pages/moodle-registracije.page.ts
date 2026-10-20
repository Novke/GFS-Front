import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { NotificationStore } from '../../../core/state/notification.store';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { PageHeader } from '../../../shared/ui/page-header';
import { StatusChip } from '../../../shared/ui/status-chip';
import { kopirajTekst } from '../../../shared/util/kopiraj';
import { LtiApi } from '../data-access/lti.api';
import { LtiRegistracijaInfo, LtiVrednostiZaMoodle } from '../data-access/lti.models';
import { RegistracijaDialog } from '../ui/registracija.dialog';

type Status = 'ucitavanje' | 'greska' | 'ok';

/** Polja Moodle forme alata, redom kao u Moodle-u (oznake su engleske, kao na ekranu Moodle-a). */
const POLJA_VREDNOSTI: readonly { kljuc: keyof LtiVrednostiZaMoodle; oznaka: string }[] = [
  { kljuc: 'toolUrl', oznaka: 'Tool URL' },
  { kljuc: 'initiateLoginUrl', oznaka: 'Initiate login URL' },
  { kljuc: 'redirectionUri', oznaka: 'Redirection URI(s)' },
  { kljuc: 'publicKeysetUrl', oznaka: 'Public keyset URL' },
];

const greskaZa = (e: unknown) => (e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);

/**
 * Podešavanja -> Moodle (nastavnik, u ljusci; spec prijave 8.1): registracije alata po Moodle predmetu (lista, "Nova
 * registracija" i "Izmeni" kroz `RegistracijaDialog`, "Obriši" uz `ConfirmDialog`), "Vrednosti za Moodle" sa "Kopiraj"
 * (`GET api/lti/registracije/vrednosti`; Clipboard API, pa rezervni `execCommand`, potvrda u snackbar-u) i kratko uputstvo
 * za Moodle formu (LTI 1.3, Keyset URL, New window, privatnost: ime Always, mejl Never). Učitavanje je tiho (panel sa
 * "Pokušaj ponovo"), brisanje nije (greška u snackbar-u).
 */
@Component({
  selector: 'app-moodle-registracije-page',
  imports: [EmptyState, ErrorPanel, MatButton, MatIcon, PageHeader, SkeletonRows, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Moodle" podnaslov="GFS kao alat na Moodle predmetima (LTI 1.3): studenti ulaze jednim klikom.">
      <button akcije matButton="filled" type="button" (click)="nova()">
        <mat-icon svgIcon="add" aria-hidden="true" />Nova registracija
      </button>
    </app-page-header>

    <section class="kartica" aria-labelledby="pd-registracije">
      <h2 id="pd-registracije">Registracije</h2>
      @switch (status()) {
        @case ('ucitavanje') {
          <app-skeleton-rows redovi="2" />
        }
        @case ('greska') {
          <app-error-panel [poruka]="greska()" (ponovo)="ucitajListu()" />
        }
        @default {
          @if (lista().length === 0) {
            <app-empty-state
              naslov="Nema registracija"
              tekst="Svaki Moodle predmet registruje GFS posebno. Uputstvo je ispod; podaci iz Moodle-a idu u „Nova registracija“."
              ikona="settings"
            >
              <button matButton="outlined" type="button" (click)="nova()">Nova registracija</button>
            </app-empty-state>
          } @else {
            <ul class="registracije">
              @for (r of lista(); track r.id) {
                <li data-registracija>
                  <div class="glava">
                    <h3>{{ r.naziv }}</h3>
                    <app-status-chip [tekst]="r.aktivna ? 'Aktivna' : 'Isključena'" [ton]="r.aktivna ? 'ok' : 'neutral'" />
                  </div>
                  <dl class="podaci">
                    <dt>Issuer</dt><dd class="mono">{{ r.izdavac }}</dd>
                    <dt>Client ID</dt><dd class="mono">{{ r.clientId }}</dd>
                    <dt>Deployment ID</dt><dd class="mono">{{ r.deploymentId }}</dd>
                  </dl>
                  <div class="akcije">
                    <button matButton="outlined" type="button" [attr.aria-label]="'Izmeni ' + r.naziv" (click)="izmeni(r)">
                      <mat-icon svgIcon="edit" aria-hidden="true" />Izmeni
                    </button>
                    <button matButton type="button" class="destruktivno" [attr.aria-label]="'Obriši ' + r.naziv"
                            [disabled]="brise() === r.id" (click)="obrisi(r)">
                      <mat-icon svgIcon="delete" aria-hidden="true" />Obriši
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
        }
      }
    </section>

    <section class="kartica" aria-labelledby="pd-vrednosti" data-vrednosti>
      <h2 id="pd-vrednosti">Vrednosti za Moodle</h2>
      <p class="uvod">Iste su za svaki predmet. Upisuju se u Moodle formu alata (uputstvo ispod).</p>
      @if (vrednostiStatus() === 'greska') {
        <app-error-panel [poruka]="vrednostiGreska()" (ponovo)="ucitajVrednosti()" />
      } @else if (stavkeVrednosti(); as stavke) {
        <dl class="vrednosti">
          @for (s of stavke; track s.oznaka) {
            <div class="vrednost">
              <dt>{{ s.oznaka }}</dt>
              <dd>
                <code class="mono">{{ s.vrednost }}</code>
                <button matButton="outlined" type="button" [attr.aria-label]="'Kopiraj ' + s.oznaka" (click)="kopiraj(s.oznaka, s.vrednost)">
                  <mat-icon svgIcon="content_copy" aria-hidden="true" />Kopiraj
                </button>
              </dd>
            </div>
          }
        </dl>
      } @else {
        <p class="uvod" role="status">Učitavanje…</p>
      }
    </section>

    <section class="kartica" aria-labelledby="pd-uputstvo" data-uputstvo>
      <h2 id="pd-uputstvo">Uputstvo za Moodle</h2>
      <ol class="koraci">
        <li>
          Na predmetu u Moodle-u (Moodle 4.3+): <strong>More → LTI External tools → Add tool</strong> (administrator nije
          potreban). U starijim verzijama alat dodaje administrator Moodle-a: <strong>Site administration → Plugins → Activity
          modules → External tool → Manage tools</strong>.
        </li>
        <li>
          Tool name po želji (npr. GFS). <strong>Tool URL</strong>, <strong>Initiate login URL</strong> i
          <strong>Redirection URI(s)</strong>: vrednosti iznad. LTI version: <strong>LTI 1.3</strong>; Public key type:
          <strong>Keyset URL</strong>; Public keyset: vrednost iznad.
        </li>
        <li>Default launch container: <strong>New window</strong> (GFS se ne otvara unutar Moodle stranice).</li>
        <li>
          Services: sve isključeno. Privacy: <strong>Share launcher's name with tool: Always</strong>,
          <strong>Share launcher's email with tool: Never</strong>, Accept grades from the tool: Never.
        </li>
        <li>
          Sačuvaj, pa na kartici alata otvori "View configuration details": <strong>Platform ID</strong>,
          <strong>Client ID</strong> i <strong>Deployment ID</strong> idu u „Nova registracija“ ovde. Auth i JWKS URL mogu
          ostati prazni (izvode se iz Platform ID-ja).
        </li>
        <li>
          U LTI External tools alat mora imati uključeno <strong>Show in activity chooser</strong>, inače ga nema u izboru
          aktivnosti. Na predmetu: Add an activity or resource → GFS. Kad aktivnost otvoriš kao nastavnik, GFS kaže
          „Alat je ispravno registrovan.“; student je prvi put poveže kodom sa mejla, posle toga ulazi jednim klikom.
        </li>
      </ol>
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; }
    .kartica { padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
      box-shadow: var(--shadow); min-width: 0; }
    h2 { margin: 0 0 12px; font-size: 17px; }
    h3 { margin: 0; font-size: 15px; overflow-wrap: anywhere; }
    .uvod { margin: 0 0 12px; color: var(--ink-2); }
    .mono { font-family: var(--font-mono); overflow-wrap: anywhere; }

    .registracije { margin: 0; padding: 0; list-style: none; }
    .registracije li { padding: 12px 0; border-top: 1px solid var(--line); }
    .registracije li:first-child { border-top: 0; padding-top: 0; }
    .glava { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 8px; }
    .podaci { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0 0 8px; font-size: 14px; }
    .podaci dt { color: var(--muted); }
    .podaci dd { margin: 0; min-width: 0; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; }
    .destruktivno { --mat-button-text-label-text-color: var(--danger); }

    .vrednosti { margin: 0; display: flex; flex-direction: column; gap: 10px; }
    .vrednost dt { color: var(--muted); font-size: 13px; font-weight: 600; margin-bottom: 2px; }
    .vrednost dd { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
    .vrednost code { flex: 1 1 240px; min-width: 0; padding: 6px 10px; border-radius: var(--radius-sm);
      background: var(--surface-2); font-size: 13px; }

    .koraci { margin: 0; padding-left: 1.4em; display: flex; flex-direction: column; gap: 8px; color: var(--ink-2); }
    .koraci strong { color: var(--ink); }
  `,
})
export class MoodleRegistracijePage {
  private readonly api = inject(LtiApi);
  private readonly dialog = inject(MatDialog);
  private readonly poruke = inject(NotificationStore);
  private readonly dokument = inject(DOCUMENT);

  protected readonly lista = signal<LtiRegistracijaInfo[]>([]);
  protected readonly status = signal<Status>('ucitavanje');
  protected readonly greska = signal<string | null>(null);
  protected readonly vrednosti = signal<LtiVrednostiZaMoodle | null>(null);
  protected readonly vrednostiStatus = signal<Status>('ucitavanje');
  protected readonly vrednostiGreska = signal<string | null>(null);
  /** Id registracije čije brisanje je u toku. */
  protected readonly brise = signal<number | null>(null);

  protected readonly stavkeVrednosti = computed(() => {
    const v = this.vrednosti();
    return v ? POLJA_VREDNOSTI.map(p => ({ oznaka: p.oznaka, vrednost: v[p.kljuc] })) : null;
  });

  private ucitavanjeListe?: Subscription;
  private ucitavanjeVrednosti?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.ucitavanjeListe?.unsubscribe();
      this.ucitavanjeVrednosti?.unsubscribe();
    });
    this.ucitajListu();
    this.ucitajVrednosti();
  }

  protected ucitajListu(): void {
    this.ucitavanjeListe?.unsubscribe();
    this.status.set('ucitavanje');
    this.ucitavanjeListe = this.api.lista({ tiho: true }).subscribe({
      next: l => {
        this.lista.set(l ?? []);
        this.status.set('ok');
      },
      error: (e: unknown) => {
        this.greska.set(greskaZa(e));
        this.status.set('greska');
      },
    });
  }

  protected ucitajVrednosti(): void {
    this.ucitavanjeVrednosti?.unsubscribe();
    this.vrednostiStatus.set('ucitavanje');
    this.ucitavanjeVrednosti = this.api.vrednosti({ tiho: true }).subscribe({
      next: v => {
        this.vrednosti.set(v);
        this.vrednostiStatus.set('ok');
      },
      error: (e: unknown) => {
        this.vrednostiGreska.set(greskaZa(e));
        this.vrednostiStatus.set('greska');
      },
    });
  }

  protected nova(): void {
    RegistracijaDialog.otvori(this.dialog, { registracija: null }).subscribe(r => {
      if (r) {
        if (this.status() === 'ok') {
          this.lista.update(l => [r, ...l]);
        } else {
          // lista nije učitana (greška ili još traje): red bi bio jedini prikazan, pa se lista učitava iznova (nova je u njoj)
          this.ucitajListu();
        }
        this.poruke.uspeh('Registracija je sačuvana.');
      }
    });
  }

  protected izmeni(reg: LtiRegistracijaInfo): void {
    RegistracijaDialog.otvori(this.dialog, { registracija: reg }).subscribe(r => {
      if (r) {
        this.lista.update(l => l.map(x => (x.id === r.id ? r : x)));
        this.poruke.uspeh('Registracija je sačuvana.');
      }
    });
  }

  protected obrisi(reg: LtiRegistracijaInfo): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: `Obrisati registraciju „${reg.naziv}“?`,
      tekst: 'Moodle predmet sa ovom registracijom više neće moći da otvori GFS. Studenti koji su već povezali Moodle nalog ostaju povezani.',
      potvrdi: 'Obriši',
      destruktivno: true,
    }).subscribe(da => {
      if (!da) {
        return;
      }
      this.brise.set(reg.id);
      this.api.obrisi(reg.id).subscribe({
        next: () => {
          this.brise.set(null);
          this.lista.update(l => l.filter(x => x.id !== reg.id));
          this.poruke.uspeh('Registracija je obrisana.');
        },
        error: () => this.brise.set(null), // poruku servera prikazuje snackbar (zahtev nije tih)
      });
    });
  }

  protected kopiraj(oznaka: string, vrednost: string): void {
    void kopirajTekst(vrednost, this.dokument).then(ok =>
      ok ? this.poruke.uspeh(`Kopirano: ${oznaka}.`) : this.poruke.greska('Kopiranje nije uspelo. Označi adresu i kopiraj je ručno.'),
    );
  }
}

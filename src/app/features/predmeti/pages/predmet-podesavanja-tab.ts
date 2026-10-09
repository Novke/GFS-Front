import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { catchError, filter, forkJoin, map, Observable, of } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { NotificationStore } from '../../../core/state/notification.store';
import { ReferenceStore } from '../../../core/state/reference.store';
import { NemaNesacuvanih } from '../../../shared/forms/unsaved-changes.guard';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { SaveStatus, StanjeCuvanja } from '../../../shared/ui/save-status';
import { OceneApi } from '../../ocene/data-access/ocene.api';
import { KoeficijentiInfo } from '../../ocene/data-access/ocene.models';
import { KoeficijentiForma } from '../../ocene/ui/koeficijenti-forma';
import { PredmetStore } from '../data-access/predmet.store';
import { PredmetiApi } from '../data-access/predmeti.api';
import { TipTestaInfo } from '../data-access/predmeti.models';
import { TipTestaDialog } from '../ui/tip-testa-dialog';

/** Red H5. */
export interface TipUPodesavanjima {
  id: number;
  naziv: string;
  aktivan: boolean;
}

/**
 * Tipovi testa za H5. Server daje samo aktivne (`GET predmeti/{id}/tipovi`); isključeni se vide ako imaju sačuvan red u
 * koeficijentima (`koeficijentiTipova`), a tipovi menjani u ovoj sesiji (`izmene`, odgovori `PUT`/`POST`) uvek. Redosled:
 * aktivni sa servera, isključeni iz koeficijenata, novi iz sesije.
 */
export function tipoviZaPodesavanja(
  aktivni: readonly TipTestaInfo[],
  koef: Pick<KoeficijentiInfo, 'koeficijentiTipova'> | null | undefined,
  izmene: ReadonlyMap<number, TipTestaInfo>,
): TipUPodesavanjima[] {
  const redovi = new Map<number, TipUPodesavanjima>();
  for (const t of aktivni) {
    if (typeof t?.id === 'number') {
      redovi.set(t.id, { id: t.id, naziv: t.naziv?.trim() || `Tip ${t.id}`, aktivan: t.aktivan !== false });
    }
  }
  for (const k of koef?.koeficijentiTipova ?? []) {
    if (typeof k?.tipTestaId === 'number' && !redovi.has(k.tipTestaId)) {
      redovi.set(k.tipTestaId, { id: k.tipTestaId, naziv: k.tipTestaNaziv?.trim() || `Tip ${k.tipTestaId}`, aktivan: false });
    }
  }
  for (const [id, t] of izmene) {
    redovi.set(id, { id, naziv: t.naziv?.trim() || redovi.get(id)?.naziv || `Tip ${id}`, aktivan: t.aktivan !== false });
  }
  return [...redovi.values()];
}

interface Ucitano {
  koef: KoeficijentiInfo | null;
  tipovi: TipTestaInfo[];
  greska: string | null;
}

interface StanjeReda {
  stanje: StanjeCuvanja;
  greska: string | null;
}

/**
 * Tab Podešavanja huba: koeficijenti ocenjivanja (premešteni sa `ocene`, eksplicitno čuvanje, potvrda pri napuštanju sa
 * nesačuvanim izmenama), H5 tipovi testa (preimenovanje u redu: Enter ili napuštanje polja čuva, Esc vraća; prekidač
 * aktivan, isključenje uz potvrdu; "Nov tip" u dijalogu) i H6 mesto za šemu bodovanja (uskoro, bez funkcije).
 */
@Component({
  selector: 'app-predmet-podesavanja-tab',
  imports: [ErrorPanel, KoeficijentiForma, MatButton, MatIcon, MatSlideToggle, SaveStatus, SkeletonRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let st = stanje();
    @if (st?.greska) {
      <app-error-panel naslov="Podešavanja nisu učitana." [poruka]="st?.greska" (ponovo)="podaci.reload()" />
    } @else if (!st || !koef()) {
      <app-skeleton-rows [redovi]="8" />
    } @else {
      <section class="kartica" aria-labelledby="naslov-koef">
        <h2 id="naslov-koef">Koeficijenti ocenjivanja</h2>
        <app-koeficijenti-forma [predmetId]="predmetId()!" [koeficijenti]="koef()!" [tipovi]="tipovi()" (sacuvano)="koef.set($event)" />
      </section>

      <section class="kartica" aria-labelledby="naslov-tipova">
        <div class="naslov-reda">
          <h2 id="naslov-tipova">Tipovi testa</h2>
          <button matButton="outlined" type="button" (click)="novTip()" data-nov-tip><mat-icon svgIcon="add" aria-hidden="true" />Nov tip</button>
        </div>
        <p class="objasnjenje">Isključen tip se ne nudi za nove testove i ne ulazi u predlog ocena; postojeći testovi tog tipa ostaju.</p>
        @if (tipovi().length === 0) {
          <p class="prazno">Predmet još nema tipova testa.</p>
        } @else {
          <div class="tabela-okvir">
            <table class="tipovi">
              <caption class="sr-only">Tipovi testa</caption>
              <thead>
                <tr><th scope="col">Naziv</th><th scope="col">Aktivan</th><th scope="col"><span class="sr-only">Status čuvanja</span></th></tr>
              </thead>
              <tbody>
                @for (t of tipovi(); track t.id) {
                  @let r = redovi()[t.id];
                  <tr [attr.data-tip]="t.id">
                    <td>
                      <input class="naziv-polje" type="text" maxlength="60" [value]="t.naziv" [attr.aria-label]="'Naziv tipa ' + t.naziv"
                        [attr.aria-invalid]="r?.greska ? true : null" (keydown.enter)="preimenuj(t, $any($event.target))"
                        (keydown.escape)="$any($event.target).value = t.naziv" (blur)="preimenuj(t, $any($event.target))" data-naziv-tipa />
                      @if (r?.greska) {
                        <span class="greska-reda" role="alert">{{ r?.greska }}</span>
                      }
                    </td>
                    <td>
                      <mat-slide-toggle [checked]="t.aktivan" [disabled]="r?.stanje === 'cuva'" (change)="promeniAktivan(t, $event.checked, $event.source)"
                        [attr.aria-label]="'Aktivan: ' + t.naziv" data-aktivan>{{ t.aktivan ? 'Aktivan' : 'Isključen' }}</mat-slide-toggle>
                    </td>
                    <td class="status"><app-save-status kompaktno [stanje]="r?.stanje" (ponovo)="ponovi(t)" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <section class="kartica uskoro" aria-labelledby="naslov-seme" data-sema-bodovanja>
        <div class="naslov-reda">
          <h2 id="naslov-seme">Šema bodovanja</h2>
          <span class="oznaka">uskoro</span>
        </div>
        <p class="objasnjenje">Ovde će se podešavati šema bodovanja predmeta (projekti i drugi delovi ocene). Do tada se predlog ocena računa po koeficijentima iznad.</p>
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .kartica { margin-bottom: 16px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    h2 { margin: 0 0 12px; font-size: 17px; }
    .naslov-reda { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .naslov-reda h2 { margin: 0; }
    .objasnjenje { margin: 4px 0 12px; color: var(--muted); max-width: 72ch; }
    .prazno { margin: 0; color: var(--muted); }
    .tipovi { width: 100%; border-collapse: collapse; }
    .tipovi th { padding: 8px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 600; text-align: left; }
    .tipovi td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
    .tipovi tbody tr:last-child td { border-bottom: 0; }
    .naziv-polje { width: 100%; max-width: 320px; min-height: 40px; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface); color: var(--ink); font: inherit; }
    .naziv-polje:hover { border-color: var(--muted); }
    .naziv-polje:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
    .naziv-polje[aria-invalid='true'] { border-color: var(--danger); }
    .greska-reda { display: block; margin-top: 2px; color: var(--danger); font-size: 12.5px; }
    .status { width: 1%; white-space: nowrap; }
    .uskoro { border-style: dashed; box-shadow: none; }
    .uskoro .objasnjenje { margin-bottom: 0; }
    @media (max-width: 599.98px) { .naziv-polje { font-size: 16px; min-height: 44px; } }
  `,
})
export class PredmetPodesavanjaTab implements NemaNesacuvanih {
  private readonly predmet = inject(PredmetStore);
  private readonly predmeti = inject(PredmetiApi);
  private readonly ocene = inject(OceneApi);
  private readonly dialog = inject(MatDialog);
  private readonly reference = inject(ReferenceStore);
  private readonly obavestenja = inject(NotificationStore);
  private readonly forma = viewChild(KoeficijentiForma);

  protected readonly predmetId = computed(() => this.predmet.id());

  protected readonly podaci = rxResource<Ucitano, number | undefined>({
    params: () => this.predmetId() ?? undefined,
    stream: ({ params: id }): Observable<Ucitano> =>
      forkJoin({ koef: this.ocene.koeficijenti(id, { tiho: true }), tipovi: this.predmeti.tipovi(id, { tiho: true }) }).pipe(
        map(x => ({ koef: x.koef, tipovi: x.tipovi ?? [], greska: null })),
        catchError((e: unknown) => of({ koef: null, tipovi: [], greska: e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM })),
      ),
  });
  protected readonly stanje = computed(() => (this.podaci.hasValue() ? this.podaci.value() : null));
  /** Koeficijenti sa servera; posle čuvanja odgovor `POST`-a. */
  protected readonly koef = linkedSignal(() => this.stanje()?.koef ?? null);
  /** Tipovi izmenjeni ili dodati u ovoj sesiji (odgovori servera). */
  private readonly izmene = signal<ReadonlyMap<number, TipTestaInfo>>(new Map());
  protected readonly tipovi = computed(() => tipoviZaPodesavanja(this.stanje()?.tipovi ?? [], this.koef(), this.izmene()));
  protected readonly redovi = signal<Record<number, StanjeReda>>({});
  /** Poslednji neuspeli zahtev po tipu, za "Pokušaj ponovo". */
  private readonly neuspeli = new Map<number, { naziv: string; aktivan: boolean }>();

  imaNesacuvanihIzmena(): boolean {
    return this.forma()?.imaNesacuvanihIzmena() ?? false;
  }

  protected novTip(): void {
    const id = this.predmetId();
    if (id === null) {
      return;
    }
    TipTestaDialog.otvori(this.dialog, { predmetId: id })
      .pipe(filter((t): t is TipTestaInfo => !!t))
      .subscribe(t => {
        this.zapamti({ ...t, aktivan: t.aktivan ?? true });
        this.obavestenja.uspeh(`Tip testa ${t.naziv} je dodat.`);
      });
  }

  protected preimenuj(t: TipUPodesavanjima, polje: HTMLInputElement): void {
    const naziv = (polje.value ?? '').trim();
    if (naziv === t.naziv) {
      polje.value = t.naziv;
      this.postaviRed(t.id, null);
      return;
    }
    if (!naziv) {
      this.redovi.update(r => ({ ...r, [t.id]: { stanje: 'greska', greska: 'Naziv tipa testa je obavezan.' } }));
      return;
    }
    polje.value = naziv;
    this.posalji(t.id, { naziv, aktivan: t.aktivan });
  }

  protected promeniAktivan(t: TipUPodesavanjima, aktivan: boolean, prekidac: MatSlideToggle): void {
    if (aktivan) {
      this.posalji(t.id, { naziv: t.naziv, aktivan: true }, prekidac);
      return;
    }
    ConfirmDialog.otvori(this.dialog, {
      naslov: `Isključiti tip ${t.naziv}?`,
      tekst: 'Isključen tip se ne nudi za nove testove i ne ulazi u predlog ocena. Postojeći testovi tog tipa ostaju.',
      potvrdi: 'Isključi',
    }).subscribe(da => {
      if (da) {
        this.posalji(t.id, { naziv: t.naziv, aktivan: false }, prekidac);
      } else {
        prekidac.checked = true;
      }
    });
  }

  protected ponovi(t: TipUPodesavanjima): void {
    const cmd = this.neuspeli.get(t.id);
    if (cmd) {
      this.posalji(t.id, cmd);
    }
  }

  /** `PUT test/tip/{id}`; prekidač koji je promenio stanje se posle greške vraća na staro. */
  private posalji(id: number, cmd: { naziv: string; aktivan: boolean }, prekidac?: MatSlideToggle): void {
    this.postaviRed(id, { stanje: 'cuva', greska: null });
    this.predmeti.izmeniTip(id, cmd, { tiho: true }).subscribe({
      next: t => {
        this.neuspeli.delete(id);
        this.zapamti({ ...t, id, aktivan: t?.aktivan ?? cmd.aktivan, naziv: t?.naziv ?? cmd.naziv });
        this.postaviRed(id, { stanje: 'sacuvano', greska: null });
      },
      error: (e: unknown) => {
        this.neuspeli.set(id, cmd);
        if (prekidac) {
          prekidac.checked = !cmd.aktivan;
        }
        this.postaviRed(id, { stanje: 'greska', greska: e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM });
      },
    });
  }

  private zapamti(t: TipTestaInfo): void {
    this.izmene.update(m => new Map(m).set(t.id, t));
    const id = this.predmetId();
    if (id !== null) {
      this.reference.invalidiraj('tipovi', id);
    }
  }

  private postaviRed(id: number, s: StanjeReda | null): void {
    this.redovi.update(r => {
      const novo = { ...r };
      if (s) {
        novo[id] = s;
      } else {
        delete novo[id];
      }
      return novo;
    });
  }
}

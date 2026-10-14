import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { catchError, map, Observable, of, switchMap } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { Histogram } from '../../../shared/ui/histogram';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { brojStudenataTekst } from '../../../shared/util/mnozina';
import { OceneApi } from '../../../core/api/ocene.api';
import { KoeficijentiInfo, raspodelaOcena, RezultatiStudentaInfo } from '../../../core/api/ocene.models';
import { OceneTabela } from './ocene-tabela';

/** Rezultat učitavanja: podaci ili poruka greške (greška se hvata u toku, pa `value()` nikad ne baca). */
interface Stanje {
  podaci: { koef: KoeficijentiInfo; rezultati: RezultatiStudentaInfo[] } | null;
  greska: string | null;
}

/**
 * Predlog ocena za predmet i grupu (H2): kratak opis koeficijenata sa linkom "Podesi koeficijente"
 * (`/predmeti/:id/podesavanja`), histogram raspodele (nije položio, 6-10; `@defer`) i tabela predloga. Isti sadržaj
 * prikazuju `/ocene?predmet&grupa` i tab Ocene u hubu predmeta. Sve poene i ocene računa server.
 */
@Component({
  selector: 'app-ocene-pregled',
  imports: [EmptyState, ErrorPanel, Histogram, MatButton, MatIcon, OceneTabela, RouterLink, SkeletonRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let st = stanje();
    @if (st?.podaci; as p) {
      <div class="opis">
        <p data-opis-koeficijenata>
          {{ brojStudenata(p.rezultati.length) }} · testovi: {{ p.koef.koristiMaxRezultat === false ? 'poslednji rezultat' : 'najbolji rezultat' }}
          · domaći i aktivnost {{ p.koef.prikaziZbirno ? 'zbirno' : 'razdvojeno' }}
        </p>
        <a matButton="outlined" [routerLink]="['/predmeti', predmetId(), 'podesavanja']" data-podesi>
          <mat-icon svgIcon="settings" aria-hidden="true" />Podesi koeficijente
        </a>
      </div>
      @if (p.rezultati.length === 0) {
        <app-empty-state naslov="Grupa nema studenata" ikona="groups" tekst="Predlog ocena se računa za studente grupe." />
      } @else {
        <section class="kartica raspodela" aria-labelledby="naslov-raspodele">
          <h2 id="naslov-raspodele">Raspodela predloga ocena</h2>
          <p class="podnaslov">Broj studenata po predlogu ocene; 5 = nije položio.</p>
          @defer (on viewport) {
            <app-histogram naslov="Raspodela predloga ocena (5 = nije položio)" [vrednosti]="raspodela()" />
          } @placeholder {
            <div class="mesto-grafikona"></div>
          }
        </section>
        <section class="lista-kartica" aria-label="Predlog ocena">
          <app-ocene-tabela [rezultati]="p.rezultati" [koeficijenti]="p.koef" [predmetId]="predmetId()" />
        </section>
      }
    } @else if (st?.greska) {
      <app-error-panel naslov="Predlog ocena nije učitan." [poruka]="st?.greska" (ponovo)="podaci.reload()" />
    } @else {
      <app-skeleton-rows [redovi]="6" />
    }
  `,
  styles: `
    :host { display: block; }
    .opis { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; margin-bottom: 12px; }
    .opis p { margin: 0; color: var(--muted); }
    .kartica { margin-bottom: 16px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    h2 { margin: 0 0 2px; font-size: 16px; }
    .podnaslov { margin: 0 0 8px; color: var(--muted); font-size: 13px; }
    .mesto-grafikona { min-height: 238px; }
  `,
})
export class OcenePregled {
  private readonly api = inject(OceneApi);

  readonly predmetId = input.required<number>();
  readonly grupaId = input.required<number>();

  protected readonly brojStudenata = brojStudenataTekst;

  protected readonly podaci = rxResource<Stanje, { predmet: number; grupa: number }>({
    params: () => ({ predmet: this.predmetId(), grupa: this.grupaId() }),
    // Redom, ne paralelno: oba poziva prave podrazumevane koeficijente kad ih predmet nema (jedinstven predmet_id), pa bi
    // istovremeni zahtevi za nov predmet pali na serveru. Prvo koeficijenti, pa rezultati.
    stream: ({ params }): Observable<Stanje> =>
      this.api.koeficijenti(params.predmet, { tiho: true }).pipe(
        switchMap(koef => this.api.rezultati(params.predmet, params.grupa, { tiho: true }).pipe(map(rezultati => ({ koef, rezultati })))),
        map(p => ({ podaci: { koef: p.koef, rezultati: p.rezultati ?? [] }, greska: null })),
        catchError((e: unknown) => of({ podaci: null, greska: e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM })),
      ),
  });

  /** Tokom ponovnog učitavanja (`reload`) ostaje prethodno stanje; nova grupa ili predmet ga briše (skeleton). */
  protected readonly stanje = computed(() => (this.podaci.hasValue() ? this.podaci.value() : null));

  protected readonly raspodela = computed(() => raspodelaOcena(this.stanje()?.podaci?.rezultati ?? []));
}

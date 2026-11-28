import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { Observable, filter } from 'rxjs';

import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { tacnoPolja } from '../../uzivo/ui/polja-zadatka';
import { OnlineTestoviApi } from '../data-access/online-testovi.api';
import { GrupaOdgovora, IspravkaCmd, IspravkaTesta, OdgovoriTesta, OdgovorPolja, PoljeOdgovora, VarijantaOdgovora } from '../data-access/online.models';
import { formatPoena, svgUrl, vremeIzIso, zvezdice } from '../data-access/online.pravila';
import { kljucIzTeksta } from '../data-access/online-ispravke';
import { UnosDialog } from './unos-dialog';

const NAZIV_ISPRAVKE: Record<IspravkaTesta['vrsta'], string> = { PRIHVATI: 'Prihvaćen odgovor', PONISTI: 'Poništeno polje', KLJUC: 'Ispravljen ključ' };

/**
 * Tab **Po zadacima** online testa (spec 13.2, plan 4.4): za svaku izvučenu varijantu grupisani odgovori po polju (koliko je
 * studenata uneo isto, tačno ili ne), „Prihvati“ (odgovor važi kao tačan), „Poništi polje“ (ne boduje se nikome, poeni se
 * dele na ostala polja), „Ispravi ključ“; spisak ispravki sa „Vrati“. Svaka ispravka odmah preračunava poene.
 */
@Component({
  selector: 'app-online-odgovori',
  imports: [MatButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (o(); as o) {
      @if (o.ispravke.length) {
        <section class="ispravke" data-ispravke>
          <h2>Ispravke</h2>
          <ul>
            @for (i of o.ispravke; track i.id) {
              <li [attr.data-ispravka]="i.id">
                <span>{{ nazivIspravke(i) }} · {{ opisPolja(o, i) }}@if (i.vrednost) { · <code>{{ i.vrednost }}</code> } <span class="tiho">{{ vreme(i.kreirano) }}</span></span>
                <button matButton type="button" [disabled]="radi()" (click)="vrati(i)" data-vrati-ispravku>Vrati</button>
              </li>
            }
          </ul>
        </section>
      }
      @for (v of o.varijante; track v.varijantaId) {
        <section class="varijanta" [attr.data-varijanta-odgovora]="v.varijantaId">
          <header class="glava">
            <h2>{{ v.stavkaRb }}. {{ v.naziv }}</h2>
            <span class="tiho">{{ v.tip }} · {{ zvezdice(v.nivo) }}@if (v.grupeTesta.length) { · grupa {{ v.grupeTesta.join(', ') }} } · {{ v.primeraka }} primeraka</span>
          </header>
          <details>
            <summary>Slika zadatka i rešenje</summary>
            <div class="slike">
              <img [src]="svg(v.svgId)" [alt]="'Zadatak ' + v.stavkaRb" loading="lazy" />
              @if (v.resenjeSvgId) { <img [src]="svg(v.resenjeSvgId)" alt="Rešenje" loading="lazy" /> }
            </div>
          </details>
          @for (p of v.polja; track p.kljuc) {
            <div class="polje" [class.ponisteno]="p.ponisteno" [attr.data-polje-odgovora]="p.kljuc">
              <div class="polje-glava">
                <strong>{{ p.oznaka }}</strong>
                <span class="tiho">{{ formatPoena(p.poeni) }} p.@if (p.konacno) { · konačan rezultat } · ključ: {{ kljuc(p) }}@if (p.prazno) { · prazno {{ p.prazno }} }</span>
                @if (p.ponisteno) { <strong class="znak">poništeno</strong> }
                <span class="razmak"></span>
                <button matButton type="button" [disabled]="radi()" (click)="ispraviKljuc(v, p)" data-ispravi-kljuc>Ispravi ključ</button>
                @if (!p.ponisteno) {
                  <button matButton type="button" class="opasno" [disabled]="radi()" (click)="ponisti(v, p)" data-ponisti-polje>Poništi polje</button>
                }
              </div>
              <ul class="grupe">
                @for (g of p.grupe; track g.kljuc) {
                  <li [class.tacno]="g.tacno" [attr.data-grupa-odgovora]="g.kljuc">
                    <span class="prikaz">{{ g.prikaz }}</span>
                    <span class="broj">{{ g.broj }}×</span>
                    <span class="ishod">{{ g.tacno ? (g.prihvacen ? 'prihvaćeno' : 'tačno') : 'netačno' }}</span>
                    @if (!g.tacno && !p.ponisteno) {
                      <button matButton type="button" [disabled]="radi()" (click)="prihvati(v, p, g)" data-prihvati>Prihvati</button>
                    }
                  </li>
                } @empty { <li class="tiho">Još nema odgovora.</li> }
              </ul>
            </div>
          }
        </section>
      } @empty {
        <p class="tiho">Još nema izvučenih zadataka.</p>
      }
    } @else {
      <p class="tiho">Učitavanje odgovora…</p>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    h2 { margin: 0; font-size: 16px; }
    .tiho { color: var(--ink-2); font-weight: 400; }
    .ispravke, .varijanta { padding: 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
    .ispravke ul { margin: 6px 0 0; padding: 0; list-style: none; }
    .ispravke li { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid var(--line); }
    .glava { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 12px; }
    .slike { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; margin-top: 6px; }
    .slike img { width: 100%; height: auto; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
    .polje { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line); }
    .polje.ponisteno .grupe { opacity: .6; }
    .polje-glava { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
    .razmak { flex: 1; }
    .znak { color: var(--danger); }
    .opasno { color: var(--danger); }
    .grupe { display: flex; flex-direction: column; gap: 2px; margin: 6px 0 0; padding: 0; list-style: none; }
    .grupe li { display: grid; grid-template-columns: minmax(0, 1fr) 4em 7em auto; align-items: center; gap: 8px; min-height: 36px;
      padding: 0 8px; border-radius: 6px; background: var(--danger-soft); }
    .grupe li.tacno { background: var(--ok-soft); }
    .prikaz { font-family: var(--font-mono); overflow-wrap: anywhere; }
    .broj { font-family: var(--font-mono); text-align: right; }
  `,
})
export class OnlineOdgovori {
  readonly testId = input.required<number>();

  private readonly api = inject(OnlineTestoviApi);
  private readonly dialog = inject(MatDialog);
  protected readonly o = signal<OdgovoriTesta | null>(null);
  protected readonly radi = signal(false);
  protected readonly formatPoena = formatPoena;
  protected readonly svg = svgUrl;
  protected readonly zvezdice = zvezdice;
  protected readonly vreme = vremeIzIso;
  protected readonly nazivIspravke = (i: IspravkaTesta) => NAZIV_ISPRAVKE[i.vrsta];

  constructor() {
    effect(() => {
      const id = this.testId();
      untracked(() => this.api.odgovori(id).subscribe(o => this.o.set(o)));
    });
  }

  protected kljuc(p: PoljeOdgovora): string {
    return tacnoPolja({ ...p, odstupanje: null, odstupanjeTip: null, zanemariVelicinu: null, zanemariRazmake: null, jedinica: null }, p.tacno) || '—';
  }

  protected opisPolja(o: OdgovoriTesta, i: IspravkaTesta): string {
    const v = o.varijante.find(x => x.varijantaId === i.varijantaId);
    const p = v?.polja.find(x => x.kljuc === i.polje);
    return v ? `${v.stavkaRb}. ${v.naziv}, ${p?.oznaka ?? i.polje}` : i.polje;
  }

  private posalji(o: Observable<OdgovoriTesta>): void {
    this.radi.set(true);
    o.subscribe({
      next: r => {
        this.o.set(r);
        this.radi.set(false);
      },
      error: () => this.radi.set(false),
    });
  }

  private ispravka(cmd: IspravkaCmd): void {
    this.posalji(this.api.ispravi(this.testId(), cmd));
  }

  protected prihvati(v: VarijantaOdgovora, p: PoljeOdgovora, g: GrupaOdgovora): void {
    this.ispravka({ varijantaId: v.varijantaId, polje: p.kljuc, vrsta: 'PRIHVATI', vrednost: g.kljuc });
  }

  protected ponisti(v: VarijantaOdgovora, p: PoljeOdgovora): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: `Poništiti polje „${p.oznaka}“?`,
      tekst: `Polje se ne boduje nikome ko je dobio ovu varijantu (${v.primeraka}); njegovi poeni prelaze na ostala polja zadatka.`,
      potvrdi: 'Poništi polje',
      destruktivno: true,
    }).pipe(filter(Boolean)).subscribe(() => this.ispravka({ varijantaId: v.varijantaId, polje: p.kljuc, vrsta: 'PONISTI', vrednost: null }));
  }

  protected ispraviKljuc(v: VarijantaOdgovora, p: PoljeOdgovora): void {
    const opcije = p.tip === 'JEDAN_TACAN' || p.tip === 'VISE_TACNIH';
    UnosDialog.otvori(this.dialog, {
      naslov: `Ispravi ključ: ${p.oznaka}`,
      tekst: opcije
        ? `Redni brojevi tačnih opcija (${(p.opcije ?? []).map((x, i) => `${i + 1} = ${x.tekst}`).join(', ')}).`
        : p.tip === 'BROJ' ? 'Tačna vrednost (broj).' : 'Prihvatljivi odgovori, razdvojeni zarezom.',
      labela: 'Novi ključ',
      potvrdi: 'Ispravi',
      proveri: t => (kljucIzTeksta(p, t) ? null : 'Neispravan ključ za ovo polje.'),
    }).pipe(filter((t): t is string => typeof t === 'string')).subscribe(t => {
      const k = kljucIzTeksta(p, t) as OdgovorPolja;
      this.ispravka({ varijantaId: v.varijantaId, polje: p.kljuc, vrsta: 'KLJUC', vrednost: JSON.stringify(k) });
    });
  }

  protected vrati(i: IspravkaTesta): void {
    this.posalji(this.api.vratiIspravku(this.testId(), i.id));
  }
}

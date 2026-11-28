import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle } from '@angular/material/dialog';
import { Observable } from 'rxjs';

import { tacnoPolja } from '../../uzivo/ui/polja-zadatka';
import { OnlineTestoviApi } from '../data-access/online-testovi.api';
import { PoljeZadatka, PrimerakNastavnika, ZadatakPrimerka } from '../data-access/online.models';
import { NAZIV_STANJA_PRIMERKA, formatPoena, prikazUnetog, rucniPoeniIzTeksta, svgUrl, vremeIzIso, zvezdice } from '../data-access/online.pravila';

interface PrimerakCfg { testId: number; primerakId: number }

/**
 * Primerak jednog studenta (tab Studenti, spec 13): svaki zadatak sa slikom i rešenjem, po polju šta je uneo, važeći ključ i
 * udeo (automatski ili posle ispravke), automatski i ručni poeni. „Ručni poeni“ (0..max, 2 decimale; prazno vraća automatske)
 * sa napomenom. Dnevnik događaja (ulaz, napuštanja, uređaji, predaja). Zatvaranje vraća `true` kad je nešto promenjeno.
 */
@Component({
  selector: 'app-primerak-dialog',
  imports: [MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (p(); as p) {
      <h2 mat-dialog-title>{{ p.prezime }} {{ p.ime }} · {{ p.indeks }}</h2>
      <mat-dialog-content>
        <p class="tiho">{{ stanje(p) }}@if (p.grupaTesta) { · grupa {{ p.grupaTesta }} }@if (p.predato) { · predato {{ vreme(p.predato) }}@if (p.nacinPredaje) { ({{ p.nacinPredaje }}) } }
          · <strong>{{ poeni(p.poeni) }} / {{ poeni(p.maxPoena) }}</strong></p>
        @for (z of p.zadaci; track z.zadatakId) {
          <section class="zadatak" [attr.data-zadatak-primerka]="z.zadatakId">
            <h3>{{ z.rb }}. {{ z.naziv }} <span class="tiho">{{ z.tip }} · {{ zvezdice(z.nivo) }}</span></h3>
            <div class="slike">
              <img [src]="svg(z.svgId)" [alt]="'Zadatak ' + z.rb" loading="lazy" />
              @if (z.resenjeSvgId) { <img [src]="svg(z.resenjeSvgId)" alt="Rešenje" loading="lazy" /> }
            </div>
            @if (z.polja.length) {
              <table class="polja">
                <thead><tr><th scope="col">Polje</th><th scope="col">Uneto</th><th scope="col">Ključ</th><th scope="col">Udeo</th></tr></thead>
                <tbody>
                  @for (f of z.polja; track f.kljuc) {
                    <tr>
                      <td>{{ f.oznaka }}</td>
                      <td>{{ uneto(z, f) || '—' }}</td>
                      <td>{{ kljuc(z, f) }}</td>
                      <td>{{ udeo(z, f.kljuc) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
            <form class="rucno" (submit)="$event.preventDefault(); sacuvaj(z)">
              <span>Automatski: {{ poeni(z.autoPoeni) }} / {{ poeni(z.maxPoena) }}</span>
              <label>Ručni poeni
                <input class="unos" inputmode="decimal" [value]="unos()[z.zadatakId] ?? (z.rucniPoeni === null ? '' : poeni(z.rucniPoeni))"
                       (input)="postavi(z.zadatakId, $any($event.target).value)" data-rucni-poeni />
              </label>
              <label>Napomena
                <input class="unos siroko" [value]="napomene()[z.zadatakId] ?? z.napomena ?? ''" (input)="postaviNapomenu(z.zadatakId, $any($event.target).value)" />
              </label>
              <button matButton="outlined" type="submit" [disabled]="radi()" data-sacuvaj-rucne>Sačuvaj</button>
              @if (greske()[z.zadatakId]; as g) { <span class="greska" role="alert">{{ g }}</span> }
            </form>
          </section>
        }
        @if (p.dogadjaji.length) {
          <h3>Događaji</h3>
          <ul class="dogadjaji">
            @for (d of p.dogadjaji; track $index) { <li>{{ vreme(d.vreme) }} · {{ d.vrsta }}@if (d.detalj) { · {{ d.detalj }} }</li> }
          </ul>
        }
      </mat-dialog-content>
    } @else {
      <mat-dialog-content><p class="tiho">Učitavanje primerka…</p></mat-dialog-content>
    }
    <mat-dialog-actions align="end"><button matButton [mat-dialog-close]="promenjeno">Zatvori</button></mat-dialog-actions>
  `,
  styles: `
    .tiho { color: var(--ink-2); font-weight: 400; }
    h3 { margin: 12px 0 6px; font-size: 15px; }
    .zadatak { padding: 8px 0; border-top: 1px solid var(--line); }
    .slike { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; }
    .slike img { width: 100%; height: auto; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
    .polja { width: 100%; margin-top: 8px; border-collapse: collapse; font-size: 13.5px; }
    .polja th, .polja td { padding: 4px 6px; border-bottom: 1px solid var(--line); text-align: left; }
    .rucno { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 8px; }
    .rucno label { display: inline-flex; align-items: center; gap: 6px; }
    .unos { width: 6em; min-height: 32px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface);
      color: var(--ink); font: inherit; }
    .unos.siroko { width: 16em; }
    .greska { color: var(--danger); }
    .dogadjaji { margin: 0; padding-left: 18px; font-size: 13px; }
  `,
})
export class PrimerakDialog {
  private readonly cfg = inject<PrimerakCfg>(MAT_DIALOG_DATA);
  private readonly api = inject(OnlineTestoviApi);
  protected readonly p = signal<PrimerakNastavnika | null>(null);
  protected readonly radi = signal(false);
  protected readonly unos = signal<Record<number, string>>({});
  protected readonly napomene = signal<Record<number, string>>({});
  protected readonly greske = signal<Record<number, string>>({});
  protected promenjeno = false;

  protected readonly poeni = formatPoena;
  protected readonly svg = svgUrl;
  protected readonly zvezdice = zvezdice;
  protected readonly vreme = vremeIzIso;
  protected readonly stanje = (p: PrimerakNastavnika) => NAZIV_STANJA_PRIMERKA[p.stanje];

  constructor() {
    this.api.primerak(this.cfg.testId, this.cfg.primerakId).subscribe(p => this.p.set(p));
  }

  protected uneto(z: ZadatakPrimerka, f: PoljeZadatka): string {
    return prikazUnetog(z.uneto?.[f.kljuc], f.opcije) + (f.jedinica && z.uneto?.[f.kljuc] ? ' ' + f.jedinica : '');
  }

  protected kljuc(z: ZadatakPrimerka, f: PoljeZadatka): string {
    return tacnoPolja(f, z.odgovori[f.kljuc]) || '—';
  }

  protected udeo(z: ZadatakPrimerka, kljuc: string): string {
    const o = z.ocena[kljuc];
    return o ? `${Math.round(o.udeo * 100)} %${o.izvor === 'ISPRAVKA' ? ' (ispravka)' : ''}` : '—';
  }

  protected postavi(id: number, v: string): void {
    this.unos.update(u => ({ ...u, [id]: v }));
    this.greske.update(g => ({ ...g, [id]: '' }));
  }

  protected postaviNapomenu(id: number, v: string): void {
    this.napomene.update(u => ({ ...u, [id]: v }));
  }

  protected sacuvaj(z: ZadatakPrimerka): void {
    const tekst = this.unos()[z.zadatakId] ?? (z.rucniPoeni === null ? '' : String(z.rucniPoeni));
    const poeni = rucniPoeniIzTeksta(tekst, z.maxPoena);
    if (poeni === undefined) {
      this.greske.update(g => ({ ...g, [z.zadatakId]: `Poeni su broj od 0 do ${formatPoena(z.maxPoena)} (najviše dve decimale).` }));
      return;
    }
    const napomena = (this.napomene()[z.zadatakId] ?? z.napomena ?? '').trim() || null;
    this.radi.set(true);
    this.api.rucniPoeni(this.cfg.testId, z.zadatakId, poeni, napomena).subscribe({
      next: p => {
        this.p.set(p);
        this.radi.set(false);
        this.promenjeno = true;
        this.unos.update(u => { const n = { ...u }; delete n[z.zadatakId]; return n; });
      },
      error: () => this.radi.set(false),
    });
  }

  static otvori(dialog: MatDialog, testId: number, primerakId: number): Observable<boolean | undefined> {
    return dialog.open<PrimerakDialog, PrimerakCfg, boolean>(PrimerakDialog, {
      data: { testId, primerakId }, width: '64rem', maxWidth: '96vw', maxHeight: '92vh', autoFocus: false,
    }).afterClosed();
  }
}

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import type { PrezentacijaDetails } from '../data-access/uzivo.models';
import type { SlajdZaPrikaz, Tema } from '../ui/slajd-za-prikaz';
import { CrtanjeApi } from './crtanje.api';
import { CrtezIzvodjenja, ElementCrteza } from './crtanje.models';
import { SlicicaCrtezaComponent } from './slicica-crteza.component';

/** "Slajd 5", "Slajd 5, bela pozadina", "Obrisan slajd" (spec 5.6). */
export function oznakaStrane(c: Pick<CrtezIzvodjenja, 'slajdBroj' | 'pozadina'>): string {
  const slajd = c.slajdBroj === null ? 'Obrisan slajd' : `Slajd ${c.slajdBroj}`;
  return c.pozadina === 'BELA' ? `${slajd}, bela pozadina` : slajd;
}

interface StranaPregleda { oznaka: string; slajd: SlajdZaPrikaz | null; elementi: readonly ElementCrteza[]; }
interface PodaciDijaloga extends StranaPregleda { tema: Tema; }

/** Veliki prikaz jedne strane iz pregleda izvođenja. */
@Component({
  selector: 'app-crtez-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, SlicicaCrtezaComponent],
  // ceo prikaz staje u sadržaj dijaloga (najviše 65vh), pa nema skrola koji bi tražio fokus sa tastature
  styles: `app-slicica-crteza { width: min(1100px, 82vw, calc((65vh - 40px) * 16 / 9)); border: 1px solid var(--line); }
    mat-dialog-content { overflow: hidden; }`,
  template: `
    <h2 mat-dialog-title>{{ d.oznaka }}</h2>
    <mat-dialog-content><app-slicica-crteza [slajd]="d.slajd" [tema]="d.tema" [elementi]="d.elementi" /></mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-flat-button type="button" mat-dialog-close cdkFocusInitial>Zatvori</button></mat-dialog-actions>
  `,
})
export class CrtezDialog {
  protected readonly d = inject<PodaciDijaloga>(MAT_DIALOG_DATA);
}

/**
 * Kartica „Crteži” u pregledu izvođenja (spec 5.6; i kad rezultati nisu čuvani): sličice ne-praznih strana redom slajdova
 * (slajd, pa bela strana tog slajda), klik otvara veliki prikaz. Slajd ispod crteža iz prezentacije (obrisan slajd i bela
 * pozadina: belo). Bez ne-praznih strana kartice nema (ni zahteva za prezentaciju).
 */
@Component({
  selector: 'app-crtezi-izvodjenja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SlicicaCrtezaComponent],
  styles: `
    .crt-pr-mreza { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    button { padding: 0; border: 2px solid var(--line); border-radius: 6px; background: none; cursor: pointer; color: inherit; font: inherit;
      text-align: left; display: block; }
    button:hover { border-color: var(--primary); }
    button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    span { display: block; padding: 4px 6px; font-size: 13px; color: var(--muted); }
  `,
  template: `
    @if (strane().length) {
      <section class="rezim-dan uz-dan uz-pr-karta" aria-labelledby="pr-crtezi" data-crtezi>
        <header class="uz-pr-karta-zaglavlje"><h2 id="pr-crtezi">Crteži</h2></header>
        <div class="uz-pr-sadrzaj crt-pr-mreza">
          @for (s of strane(); track $index) {
            <button type="button" [attr.aria-label]="'Otvori crtež: ' + s.oznaka" (click)="otvori(s)">
              <app-slicica-crteza [slajd]="s.slajd" [tema]="tema()" [elementi]="s.elementi" />
              <span>{{ s.oznaka }}</span>
            </button>
          }
        </div>
      </section>
    }
  `,
})
export class CrteziIzvodjenjaComponent {
  readonly izvodjenjeId = input.required<number>();
  readonly prezentacijaId = input.required<number>();
  private readonly api = inject(CrtanjeApi);
  private readonly prezentacije = inject(PrezentacijeApi);
  private readonly dialog = inject(MatDialog);
  private readonly crtezi = signal<readonly CrtezIzvodjenja[]>([]);
  private readonly prezentacija = signal<PrezentacijaDetails | null>(null);
  protected readonly tema = computed<Tema>(() => this.prezentacija()?.tema ?? 'NACRT');
  protected readonly strane = computed<StranaPregleda[]>(() => {
    const slajdovi = this.prezentacija()?.slajdovi ?? [];
    return this.crtezi().filter(c => c.elementi.length > 0).map(c => ({
      oznaka: oznakaStrane(c), elementi: c.elementi,
      slajd: c.pozadina === 'SLAJD' ? slajdovi.find(s => s.id === c.slajdId) ?? null : null,
    }));
  });

  constructor() {
    effect(() => {
      const id = this.izvodjenjeId();
      const prezentacijaId = this.prezentacijaId();
      untracked(() => this.api.crtezi(id).subscribe({
        next: lista => {
          this.crtezi.set(lista);
          if (lista.some(c => c.pozadina === 'SLAJD' && c.slajdId !== null && c.elementi.length > 0)) {
            // slajdovi ispod crteža; bez njih sličice ostaju bele
            this.prezentacije.detalji(prezentacijaId).subscribe({ next: p => this.prezentacija.set(p), error: () => undefined });
          }
        },
        // pregled radi i bez crteža (stari backend, mreža): kartice tada nema
        error: (e: unknown) => console.warn('Crteži izvođenja nisu učitani.', e),
      }));
    });
  }

  protected otvori(s: StranaPregleda): void {
    this.dialog.open<CrtezDialog, PodaciDijaloga>(CrtezDialog, { data: { ...s, tema: this.tema() }, maxWidth: '95vw' });
  }
}

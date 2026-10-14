// Traka iznad platna (F4b: poništi/ponovi, z-osa, brisanje). Meniji ubacivanja (F7 oblik i slika, F14 tabela, F16
// formula) idu ovde, sa `[matMenuTriggerRestoreFocus]="false"` i kroz `ubaci`, pa fokus posle ubacivanja prelazi na okvir
// platna (odluka 12), i kad je ubacivanje odbijeno (meni sam ne vraća fokus, inače bi pao na body). "Tabela" (F14) je
// CDK popover sa poljima (`ubaci-tabelu`), isti put kroz `ubaci`. "Tekst" (F12) ubacuje
// tekst i odmah ulazi u uređivanje (fokus u tekstu). Dugmad su `disabledInteractive`: onemogućeno dugme zadržava fokus
// (npr. Poništi posle poslednjeg koraka), umesto da ga pregledač baci na body.
// Poništi/Ponovi tokom sesije teksta (sloj ili ćelija) idu prvo u istoriju uređivača, pa u istoriju platna, kao
// Ctrl+Z iz panela; omogućeni su kad bilo koja od dve ima korak.
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import type { Crtica, Platno, Sloj, Tema, VrstaOblika } from '../data-access/platno.models';
import { novaTabela, noviKrug, noviOblik, noviTekst, uSredini } from '../data-access/platno-novo';
import { slobodnoMesto } from './komande';
import { FokusPlatna } from './fokus-platna';
import { PlatnoEditorStore } from './platno-editor.store';
import { PRIHVACENE_SLIKE, SlikeEditora } from './slike-editora';
import { UbaciTabeluComponent, type VelicinaTabele } from './ubaci-tabelu.component';

interface StavkaOblika { naziv: string; vrsta: VrstaOblika | 'KRUG'; crtica: Crtica; }
/** Meni "Oblik", redom (odluka plana F7): isprekidana linija i strelica su LINIJA/STRELICA sa crticom ISPREKIDANA. */
const OBLICI: readonly StavkaOblika[] = [
  { naziv: 'Pravougaonik', vrsta: 'PRAVOUGAONIK', crtica: 'PUNA' },
  { naziv: 'Zaobljeni pravougaonik', vrsta: 'ZAOBLJENI_PRAVOUGAONIK', crtica: 'PUNA' },
  { naziv: 'Elipsa', vrsta: 'ELIPSA', crtica: 'PUNA' },
  { naziv: 'Krug', vrsta: 'KRUG', crtica: 'PUNA' },
  { naziv: 'Trougao', vrsta: 'TROUGAO', crtica: 'PUNA' },
  { naziv: 'Linija', vrsta: 'LINIJA', crtica: 'PUNA' },
  { naziv: 'Strelica', vrsta: 'STRELICA', crtica: 'PUNA' },
  { naziv: 'Dvostruka strelica', vrsta: 'DVOSTRUKA_STRELICA', crtica: 'PUNA' },
  { naziv: 'Isprekidana linija', vrsta: 'LINIJA', crtica: 'ISPREKIDANA' },
  { naziv: 'Isprekidana strelica', vrsta: 'STRELICA', crtica: 'ISPREKIDANA' },
];

@Component({
  selector: 'app-traka-alata',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, UbaciTabeluComponent],
  template: `
    <div class="uz-ep-traka" role="group" aria-label="Alati platna">
      <button mat-icon-button type="button" aria-label="Poništi" title="Poništi (Ctrl+Z)" disabledInteractive
              [disabled]="!mozeNazad()" (click)="ponisti()"><mat-icon svgIcon="undo" /></button>
      <button mat-icon-button type="button" aria-label="Ponovi" title="Ponovi (Ctrl+Y)" disabledInteractive
              [disabled]="!mozeNapred()" (click)="ponovi()"><mat-icon svgIcon="redo" /></button>
      <span class="uz-ep-traka-razmak" aria-hidden="true"></span>
      <button mat-icon-button type="button" aria-label="Tekst" title="Tekst (dvoklik na tekst ga uređuje)"
              (click)="ubaciTekst()"><mat-icon svgIcon="text_fields" /></button>
      <button mat-icon-button type="button" aria-label="Oblik" title="Oblik"
              [matMenuTriggerFor]="meniOblika" [matMenuTriggerRestoreFocus]="false"><mat-icon svgIcon="shapes" /></button>
      <mat-menu #meniOblika="matMenu">
        @for (o of oblici; track o.naziv) {
          <button mat-menu-item type="button" (click)="ubaciOblik(o)">{{ o.naziv }}</button>
        }
      </mat-menu>
      <button mat-icon-button type="button" aria-label="Slika" title="Slika" disabledInteractive
              [disabled]="slike.salje()" (click)="otvoriBiranje(fajl)"><mat-icon svgIcon="image" /></button>
      <app-ubaci-tabelu (ubaci)="ubaciTabelu($event)" />
      <input #fajl type="file" hidden [accept]="prihvaceneSlike" (change)="izabranaSlika(fajl)">
      <span role="status" class="uz-ep-traka-stanje">{{ slike.salje() ? 'Slika se otprema…' : '' }}</span>
      <span class="uz-ep-traka-razmak" aria-hidden="true"></span>
      <button mat-icon-button type="button" aria-label="Napred" title="Napred (Ctrl+])" disabledInteractive
              [disabled]="!imaIzbor()" (click)="store.zOsaIzabranih('NAPRED')"><mat-icon svgIcon="flip_to_front" /></button>
      <button mat-icon-button type="button" aria-label="Nazad" title="Nazad (Ctrl+[)" disabledInteractive
              [disabled]="!imaIzbor()" (click)="store.zOsaIzabranih('NAZAD')"><mat-icon svgIcon="flip_to_back" /></button>
      <button mat-icon-button type="button" aria-label="Obriši" title="Obriši (Delete)" disabledInteractive
              [disabled]="!imaIzbor()" (click)="store.obrisiIzabrane()"><mat-icon svgIcon="delete" /></button>
    </div>
  `,
  styles: `
    .uz-ep-traka { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 2px 0 6px; }
    .uz-ep-traka-stanje { font-size: 13px; color: var(--ink-2); }
    .uz-ep-traka-razmak { width: 1px; height: 24px; margin-inline: 6px; background: var(--line); }
  `,
})
export class TrakaAlataComponent {
  /** Tema prezentacije: novi oblici uzimaju njene boje. */
  readonly tema = input.required<Tema>();

  protected readonly store = inject(PlatnoEditorStore);
  private readonly fokusPlatna = inject(FokusPlatna);
  protected readonly slike = inject(SlikeEditora);
  protected readonly oblici = OBLICI;
  protected readonly prihvaceneSlike = PRIHVACENE_SLIKE;

  /** Istorija uređivača teksta dok traje sesija (TEKST sloj ili ćelija), inače null. */
  private readonly tekst = computed(() => (this.store.uredjivanje() ? this.store.aktivniUredjivac()?.istorija() ?? null : null));
  protected readonly mozeNazad = computed(() => this.store.mozeNazad() || !!this.tekst()?.nazad);
  protected readonly mozeNapred = computed(() => this.store.mozeNapred() || !!this.tekst()?.napred);

  /** Kao Ctrl+Z iz panela: tokom sesije teksta prvo istorija uređivača, pa (kad je prazna) istorija platna. */
  protected ponisti(): void {
    if (!this.store.ponistiUTekstu()) this.store.ponisti();
  }

  protected ponovi(): void {
    if (!this.store.ponoviUTekstu()) this.store.ponovi();
  }

  protected imaIzbor(): boolean {
    return this.store.izbor().length > 0;
  }

  /**
   * Ubacivanje iz menija trake (F7 i dalje): nov sloj je izabran, a fokus prelazi na okvir platna (odluka 12). I kad je
   * odbijeno (granica, poruka): meni ima `RestoreFocus=false`, pa bi fokus inače ostao na body.
   */
  protected ubaci(napravi: (id: string, p: Platno) => Sloj): void {
    this.store.ubaci(napravi);
    this.fokusPlatna.fokus();
  }

  /** "Tekst": 400 x 60 u fontu i boji tela teme, na slobodnom mestu, i odmah u uređivanju (uređivač uzima fokus). */
  protected ubaciTekst(): void {
    const tema = this.tema();
    const id = this.store.ubaci((novi, p) => {
      const s = noviTekst(novi, tema, { ...uSredini(400, 60), sirina: 400, visina: 60 });
      return { ...s, ...slobodnoMesto(p, s.sirina, s.visina) };
    });
    if (id !== null) this.store.pocniUredjivanje(id);
  }

  /** "Tabela": nova tabela iz teme (`novaTabela`), na slobodnom mestu; fokus na okvir platna (i kad je odbijena). */
  protected ubaciTabelu(v: VelicinaTabele): void {
    const tema = this.tema();
    this.ubaci((id, p) => {
      const t = novaTabela(id, tema, v.redova, v.kolona);
      return { ...t, ...slobodnoMesto(p, t.sirina, t.visina) };
    });
  }

  /** Dugme je `disabledInteractive` (zadržava fokus), pa klik dok otpremanje traje ovde ne otvara birač fajlova. */
  protected otvoriBiranje(polje: HTMLInputElement): void {
    if (!this.slike.salje()) polje.click();
  }

  protected ubaciOblik(o: StavkaOblika): void {
    const tema = this.tema();
    this.ubaci((id, p) => {
      const sloj = o.vrsta === 'KRUG' ? noviKrug(id, tema) : noviOblik(id, tema, o.vrsta, o.crtica);
      return { ...sloj, ...slobodnoMesto(p, sloj.sirina, sloj.visina) };
    });
  }

  /** Prvi fajl iz polja (polje se prazni, pa isti fajl može ponovo); fokus na okvir platna tek posle ubacivanja. */
  protected izabranaSlika(polje: HTMLInputElement): void {
    const fajl = polje.files?.[0];
    polje.value = '';
    if (fajl) void this.ubaciSliku(fajl);
  }

  /** Slika iz trake: posle uspeha fokus na okvir platna. */
  private async ubaciSliku(fajl: File): Promise<void> {
    if (await this.slike.ubaci(fajl) !== null) this.fokusPlatna.fokus();
  }
}

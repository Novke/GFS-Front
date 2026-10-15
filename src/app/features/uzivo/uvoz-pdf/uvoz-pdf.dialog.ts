// Dijalog uvoza iz PDF-a (faza 5d, odluka 19). Učitava se samo lenjo (`pages/uvoz-pdf-otvarac.ts`); pdf.js je još jedan
// lenji chunk (`UCITAJ_PDFJS`), koji se učitava tek kad je fajl izabran. Ne uvozi ništa iz `uvoz-pptx/uvoz-pptx.dialog`
// ni `uvoz-pptx/uvoz` (ne vuče `fflate`).
import { hasModifierKey } from '@angular/cdk/keycodes';
import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, ErrorHandler, inject,
  Injector, signal, untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { NavigationStart, Router } from '@angular/router';
import { filter, Observable, Subject } from 'rxjs';

import { NotificationStore } from '../../../core/state/notification.store';
import { RegistarCuvanja, SesijaCuvanja } from '../../../core/state/registar-cuvanja';
import type { Tema } from '../data-access/platno.models';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import type { PrezentacijaDetails } from '../data-access/uzivo.models';
import { GreskaSlanja } from '../uvoz-pptx/slanje';
import { GreskaPdf, otvoriPdf, PORUKE_PDF, putanjePdf, type PdfJs } from './pdf-crtac';
import { NAPRAVI_PLATNO_PDF, UCITAJ_PDFJS } from './pdf-token';
import { uveziPdf, type CrtacPdf, type NapredakPdf } from './slanje-pdf';
import { MAX_PDF_BAJTOVA, porukaOpsega, type IzborStrana } from './strane';

/** Host atribut `data-oznaka` dijaloga: niz ostaje u lenjom chunk-u (e2e proverava da ga glavni bundle nema). */
export const OZNAKA_UVOZA_PDF = 'gfs-uvoz-pdf';
/** Nepoznat ishod slanja: pozivalac ponovo čita prezentaciju. Isti niz kao `OSVEZI_PREZENTACIJU` faze 2, bez uvoza njenog dijaloga. */
export const OSVEZI_POSLE_PDF = 'osvezi';
/** Cela prezentacija posle uvoza, `OSVEZI_POSLE_PDF`, ili `undefined` (otkazano, greška bez upisa). */
export type IshodUvozaPdf = PrezentacijaDetails | typeof OSVEZI_POSLE_PDF | undefined;

export interface UvozPdfPodaci {
  prezentacijaId: number;
  /** Slajdova u prezentaciji pre uvoza (granica 200). */
  brojSlajdova: number;
  /** Izabrani slajd u editoru: mesto "Posle slajda R"; `null` = na kraj. */
  izabraniId: number | null;
  izabraniRb: number | null;
  /** Tema prezentacije: njena pozadina je boja traka oko strane. */
  tema: Tema;
}

/**
 * Otvara dijalog uvoza PDF-a; emituje {@link IshodUvozaPdf}. Kao dijalog faze 2: `disableClose` (klik van dijaloga ne
 * gubi izbor), Escape i "nazad" u pregledaču idu kroz isti put kao dugmad stanja (tokom slanja ništa), `closeOnNavigation`
 * isključen, a početni fokus postavlja dijalog sam (`autoFocus: false`).
 */
export function otvoriUvozPdf(dialog: MatDialog, podaci: UvozPdfPodaci): Observable<IshodUvozaPdf> {
  return dialog.open<UvozPdfDialog, UvozPdfPodaci, Exclude<IshodUvozaPdf, undefined>>(UvozPdfDialog, {
    data: podaci, width: '560px', maxWidth: '95vw', disableClose: true, closeOnNavigation: false, autoFocus: false,
  }).afterClosed();
}

type Faza = 'izbor' | 'otvaranje' | 'pregled' | 'slanje' | 'greska';

const NIJE_PDF = 'Izaberi PDF fajl.';
const NIJE_UCITAN = 'Uvoz PDF-a nije učitan. Osveži stranicu i pokušaj ponovo.';
const NEOCEKIVANO = 'Uvoz nije uspeo zbog neočekivane greške.';
/** Najduže čekanje da pdf.js ugasi dokument (radnik koji ne odgovara ne sme da zaključa sledeći uvoz ni sesiju čuvanja). */
const GASENJE_MS = 5000;

/**
 * Gašenja dokumenata u ovoj kartici. pdf.js 6 deli radnika (`workerPort`) i baca "PDFWorker.create - the worker is being
 * destroyed" ako se otvori nov dokument pre kraja `destroy()` prethodnog, pa svako otvaranje čeka ovo.
 */
let gasenje: Promise<unknown> = Promise.resolve();

/** Gasi dokument (pdf.js prekida i crtanje koje još traje); najviše {@link GASENJE_MS}. */
function ugasi(crtac: CrtacPdf): Promise<void> {
  let tajmer: ReturnType<typeof setTimeout> | undefined;
  const kraj = Promise.race([crtac.zatvori(), new Promise<void>((r) => (tajmer = setTimeout(r, GASENJE_MS)))])
    .finally(() => clearTimeout(tajmer));
  gasenje = Promise.all([gasenje, kraj]);
  return kraj;
}

/**
 * Uvoz iz PDF-a: izbor fajla -> otvaranje u pregledaču (pdf.js) -> pregled (broj strana, opseg, mesto) -> slanje (strane
 * se crtaju i šalju zajedno, sesija u `RegistarCuvanja`) -> zatvaranje sa prezentacijom. Greška u bilo kom koraku ima
 * svoje stanje. PDF nikad ne ide na server i lozinka se nikad ne traži.
 */
@Component({
  selector: 'app-uvoz-pdf-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatRadioModule],
  host: { 'data-oznaka': OZNAKA_UVOZA_PDF, class: 'uz-uv' },
  template: `
    <h2 mat-dialog-title>Uvoz iz PDF-a</h2>
    <mat-dialog-content class="uz-uv-telo">
      @switch (faza()) {
        @case ('izbor') {
          <div class="uz-uv-izbor" data-faza="izbor">
            <mat-icon class="uz-uv-izbor-ikona" aria-hidden="true" svgIcon="picture_as_pdf" />
            <input #polje class="uz-uv-fajl" type="file" accept="application/pdf,.pdf" tabindex="-1" aria-hidden="true"
                   (change)="izabran(polje)">
            <button mat-flat-button type="button" data-fokus (click)="polje.click()">Izaberi PDF</button>
            <p class="uz-ed-napomena">PDF se čita samo u ovom pregledaču; na server idu samo slike strana.</p>
          </div>
        }
        @case ('otvaranje') {
          <div class="uz-uv-napredak" data-faza="otvaranje">
            <p class="uz-uv-fajl-ime">{{ imeFajla() }}</p>
            <mat-progress-bar mode="indeterminate" aria-label="Čitanje PDF-a" />
            <p class="uz-uv-status" role="status" tabindex="-1" data-fokus>Čitam PDF…</p>
          </div>
        }
        @case ('pregled') {
          <div class="uz-uv-pregled" data-faza="pregled">
            <p class="uz-uv-fajl-ime">{{ imeFajla() }}</p>
            <p class="uz-uv-zbir" tabindex="-1" data-fokus>Strana u PDF-u: {{ brojStrana() }}.</p>
            <div class="uz-uv-odeljak">
              <span class="uz-uv-naslov" id="uz-pdf-opseg">Strane</span>
              <mat-radio-group class="uz-ed-izbori" aria-labelledby="uz-pdf-opseg" [value]="sve() ? 'sve' : 'deo'"
                               (change)="sve.set($event.value === 'sve')">
                <mat-radio-button value="sve">Sve strane</mat-radio-button>
                <mat-radio-button value="deo">Strane od – do</mat-radio-button>
              </mat-radio-group>
              @if (!sve()) {
                <div class="uz-uv-opseg">
                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>Od</mat-label>
                    <input matInput type="number" aria-label="Od strane" min="1" [max]="brojStrana()" step="1"
                           [value]="od()" (input)="od.set(broj(poljeOd))" #poljeOd>
                  </mat-form-field>
                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>Do</mat-label>
                    <input matInput type="number" aria-label="Do strane" min="1" [max]="brojStrana()" step="1"
                           [value]="do()" (input)="do.set(broj(poljeDo))" #poljeDo>
                  </mat-form-field>
                </div>
              }
            </div>
            @if (data.izabraniId !== null && data.izabraniRb !== null) {
              <div class="uz-uv-odeljak">
                <span class="uz-uv-naslov" id="uz-pdf-mesto">Mesto</span>
                <mat-radio-group class="uz-ed-izbori" aria-labelledby="uz-pdf-mesto" [value]="mesto()" (change)="mesto.set($event.value)">
                  <mat-radio-button value="posle">Posle slajda {{ data.izabraniRb }}</mat-radio-button>
                  <mat-radio-button value="kraj">Na kraj prezentacije</mat-radio-button>
                </mat-radio-group>
              </div>
            } @else {
              <p class="uz-ed-napomena">Strane se dodaju na kraj prezentacije.</p>
            }
            @if (poruka(); as p) {
              <p class="uz-uv-prepreka" id="uz-pdf-prepreka" role="alert">{{ p }}</p>
            }
          </div>
        }
        @case ('slanje') {
          <div class="uz-uv-napredak" data-faza="slanje">
            @if (napredak(); as n) {
              @if (n.faza === 'strane') {
                <mat-progress-bar mode="determinate" [value]="n.uradjeno / n.ukupno * 100" aria-label="Uvoz strana" />
              } @else {
                <mat-progress-bar mode="indeterminate" aria-label="Pravljenje slajdova" />
              }
            } @else {
              <mat-progress-bar mode="indeterminate" aria-label="Uvoz strana" />
            }
            <p class="uz-uv-status" role="status" tabindex="-1" data-fokus>{{ tekstSlanja() }}</p>
            <p class="uz-ed-napomena">Ne zatvaraj karticu dok uvoz traje.</p>
          </div>
        }
        @case ('greska') {
          @if (greska(); as g) {
            <div class="uz-uv-greska" data-faza="greska">
              <p class="uz-uv-poruka" role="alert">
                <mat-icon aria-hidden="true" svgIcon="error" />
                <span>{{ g.poruka }}</span>
              </p>
            </div>
          }
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @switch (faza()) {
        @case ('pregled') {
          <button mat-button type="button" (click)="otkazi()">Otkaži</button>
          <button mat-flat-button type="button" [disabled]="!!poruka()"
                  [attr.aria-describedby]="poruka() ? 'uz-pdf-prepreka' : null" (click)="uvezi()">Uvezi</button>
        }
        @case ('slanje') {
          <!-- disabledInteractive: fokus ostaje na dugmetu kad uvoz slajdova krene (handler proverava isto) -->
          <button mat-button type="button" [disabled]="napredak()?.faza === 'slajdovi'" disabledInteractive
                  (click)="otkaziSlanje()">Otkaži</button>
        }
        @case ('greska') {
          <!-- poruka je role="alert" (najavljuje se sama); fokus ide na prvu akciju -->
          @if (greska()?.ponovo === 'pregled') {
            <button mat-button type="button" data-fokus (click)="pokusajPonovo()">Pokušaj ponovo</button>
          } @else if (greska()?.ponovo === 'izbor') {
            <button mat-button type="button" data-fokus (click)="faza.set('izbor')">Izaberi drugi fajl</button>
          }
          <button mat-flat-button type="button" data-fokus (click)="zatvori()">Zatvori</button>
        }
        @default {
          <button mat-button type="button" (click)="otkazi()">Otkaži</button>
        }
      }
    </mat-dialog-actions>
  `,
})
export class UvozPdfDialog {
  protected readonly data = inject<UvozPdfPodaci>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<UvozPdfDialog, Exclude<IshodUvozaPdf, undefined>>>(MatDialogRef);
  private readonly api = inject(PrezentacijeApi);
  private readonly registar = inject(RegistarCuvanja);
  private readonly obavestenja = inject(NotificationStore);
  private readonly greske = inject(ErrorHandler);
  private readonly koren = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly ucitajPdfJs = inject(UCITAJ_PDFJS);
  private readonly napraviPlatno = inject(NAPRAVI_PLATNO_PDF);

  protected readonly faza = signal<Faza>('izbor');
  protected readonly imeFajla = signal('');
  protected readonly brojStrana = signal(0);
  protected readonly sve = signal(true);
  protected readonly od = signal(1);
  protected readonly do = signal(1);
  protected readonly mesto = signal<'posle' | 'kraj'>(this.data.izabraniId !== null ? 'posle' : 'kraj');
  protected readonly napredak = signal<NapredakPdf | null>(null);
  protected readonly greska = signal<{ poruka: string; ponovo: 'pregled' | 'izbor' | null } | null>(null);

  /** Izabran fajl (ponovni pokušaj ga čita iznova: pdf.js prazni predate bajtove). */
  private fajl: File | null = null;
  /** Otvoren PDF u pregledu; slanje ga preuzima i gasi u `finally`. */
  private crtac: CrtacPdf | null = null;
  /** Broj otvaranja: zatvoren dijalog ili "Otkaži" za vreme čitanja poništava otvaranje u toku. */
  private otvaranje = 0;
  private prekid: AbortController | null = null;
  /** Slanje je završeno sa nepoznatim ishodom: zatvaranje traži osvežavanje (`OSVEZI_POSLE_PDF`). */
  private nepoznatIshod = false;

  private readonly izbor = computed<IzborStrana>(() => ({
    od: this.sve() ? 1 : this.od(), do: this.sve() ? this.brojStrana() : this.do(),
    posle: this.mesto() === 'posle' ? this.data.izabraniId : null,
  }));
  /** Zašto "Uvezi" nije moguće (`role="alert"` ispod izbora), ili `null`. */
  protected readonly poruka = computed(() => {
    const { od, do: doStr } = this.izbor();
    return porukaOpsega(od, doStr, this.brojStrana(), this.data.brojSlajdova);
  });
  protected readonly tekstSlanja = computed(() => {
    const n = this.napredak();
    if (n?.faza === 'slajdovi') return 'Pravim slajdove…';
    return n ? `Strana ${Math.min(n.uradjeno + 1, n.ukupno)} od ${n.ukupno}` : 'Pripremam strane…';
  });

  constructor() {
    // Escape i navigacija (dijalog je disableClose i ne zatvara se navigacijom): isti put kao dugmad, nikad usred slanja.
    this.ref.keydownEvents().pipe(filter(e => e.key === 'Escape' && !hasModifierKey(e)), takeUntilDestroyed())
      .subscribe(e => {
        e.preventDefault();
        this.izlaz();
      });
    // samo "nazad/napred" u pregledaču: programska ili guard-om otkazana navigacija ne otkazuje uvoz
    inject(Router).events.pipe(
      filter((e): e is NavigationStart => e instanceof NavigationStart && e.navigationTrigger === 'popstate'),
      takeUntilDestroyed(),
    ).subscribe(() => this.izlaz());
    inject(DestroyRef).onDestroy(() => {
      this.otvaranje++;
      this.prekid?.abort();
      this.zatvoriCrtac();
    });
    // fokus na glavni element novog stanja (dugme koje je imalo fokus nestaje), i na početni izbor
    effect(() => {
      this.faza();
      untracked(() => afterNextRender(() => this.fokusiraj(), { injector: this.injector }));
    });
  }

  protected broj(polje: HTMLInputElement): number {
    return polje.value.trim() === '' ? Number.NaN : Number(polje.value);
  }

  protected izabran(polje: HTMLInputElement): void {
    const f = polje.files?.[0];
    polje.value = '';
    if (f) void this.otvori(f, false);
  }

  /** Čita fajl i otvara ga kroz pdf.js; `zadrzi` (ponovni pokušaj) ostavlja izabran opseg i mesto. */
  private async otvori(f: File, zadrzi: boolean): Promise<void> {
    this.zatvoriCrtac();
    this.fajl = f;
    this.imeFajla.set(f.name);
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) return this.neuspeh(NIJE_PDF, 'izbor');
    if (f.size > MAX_PDF_BAJTOVA) return this.neuspeh(PORUKE_PDF.prevelik, 'izbor');
    const pokusaj = ++this.otvaranje;
    this.faza.set('otvaranje');
    let crtac: CrtacPdf;
    try {
      let pdfjs: PdfJs;
      try {
        pdfjs = await this.ucitajPdfJs();
      } catch (e) {
        this.greske.handleError(e);
        throw new GreskaPdf(NIJE_UCITAN);
      }
      const bajtovi = new Uint8Array(await f.arrayBuffer());
      await gasenje;
      if (pokusaj !== this.otvaranje) return;
      crtac = await otvoriPdf(pdfjs, bajtovi, putanjePdf(), this.napraviPlatno);
    } catch (e) {
      if (pokusaj !== this.otvaranje) return;
      if (!(e instanceof GreskaPdf)) this.greske.handleError(e);
      return this.neuspeh(e instanceof GreskaPdf ? e.message : PORUKE_PDF.neocekivano, 'izbor');
    }
    if (pokusaj !== this.otvaranje) {
      void ugasi(crtac);
      return;
    }
    this.crtac = crtac;
    this.brojStrana.set(crtac.brojStrana);
    if (!zadrzi) {
      this.sve.set(true);
      this.od.set(1);
      this.do.set(crtac.brojStrana);
    }
    this.faza.set('pregled');
  }

  protected uvezi(): void {
    const crtac = this.crtac;
    if (!crtac || this.faza() !== 'pregled' || this.poruka()) return;
    this.crtac = null;
    void this.posalji(crtac, this.izbor());
  }

  private async posalji(crtac: CrtacPdf, izbor: IzborStrana): Promise<void> {
    const prekid = new AbortController();
    this.prekid = prekid;
    this.napredak.set(null);
    this.faza.set('slanje');
    const mirovanje = new Subject<void>();
    const sesija: SesijaCuvanja & { uToku: number } = {
      kljuc: `uvoz-pdf-${this.data.prezentacijaId}`, uToku: 1, mirovanje, nesacuvano: () => sesija.uToku,
    };
    this.registar.prijavi(sesija);
    try {
      const p = await uveziPdf(this.data.prezentacijaId, crtac, izbor,
        { api: this.api, tema: this.data.tema, imeFajla: this.imeFajla() }, n => this.napredak.set(n), prekid.signal);
      this.obavestenja.uspeh(`Uvezeno slajdova: ${izbor.do - izbor.od + 1}.`);
      this.ref.close(p);
    } catch (e) {
      if (e instanceof GreskaSlanja && e.nepoznatIshod) {
        // slajdovi su možda upisani: bez ponovnog pokušaja; zatvaranje traži osvežavanje editora
        this.nepoznatIshod = true;
        this.neuspeh(e.message, null);
      } else {
        const zaKorisnika = e instanceof GreskaSlanja || e instanceof GreskaPdf;
        if (!zaKorisnika) this.greske.handleError(e);
        this.neuspeh(zaKorisnika ? e.message : NEOCEKIVANO, 'pregled');
      }
    } finally {
      if (this.prekid === prekid) this.prekid = null;
      // "Otkaži" odbija odmah; gašenje prekida i crtanje koje još traje (render u pdf.js)
      await ugasi(crtac);
      sesija.uToku = 0;
      this.registar.odjavi(sesija);
      mirovanje.next();
      mirovanje.complete();
    }
  }

  /** "Otkaži" tokom slanja: odmah `OTKAZANO_PDF`; posle `POST slajdovi/uvoz` ništa (ishod bi bio nepoznat). */
  protected otkaziSlanje(): void {
    if (this.faza() !== 'slanje' || this.napredak()?.faza === 'slajdovi') return;
    this.prekid?.abort();
  }

  /** Ponovni pokušaj posle greške slanja: isti fajl se čita iznova, opseg i mesto ostaju. */
  protected pokusajPonovo(): void {
    if (this.fajl) void this.otvori(this.fajl, true);
  }

  /** "Otkaži" pre slanja (i za vreme čitanja): dijalog se zatvara bez uvoza. */
  protected otkazi(): void {
    this.otvaranje++;
    this.zatvoriCrtac();
    this.ref.close(undefined);
  }

  protected zatvori(): void {
    this.ref.close(this.nepoznatIshod ? OSVEZI_POSLE_PDF : undefined);
  }

  /** Escape ili navigacija: kao "Otkaži"/"Zatvori" trenutnog stanja; tokom slanja ništa. */
  private izlaz(): void {
    const f = this.faza();
    if (f === 'slanje') return;
    if (f === 'greska') this.zatvori();
    else this.otkazi();
  }

  private zatvoriCrtac(): void {
    if (this.crtac) void ugasi(this.crtac);
    this.crtac = null;
  }

  private neuspeh(poruka: string, ponovo: 'pregled' | 'izbor' | null): void {
    this.greska.set({ poruka, ponovo });
    this.faza.set('greska');
  }

  private fokusiraj(): void {
    this.koren.nativeElement.querySelector<HTMLElement>('[data-fokus]')?.focus();
  }
}

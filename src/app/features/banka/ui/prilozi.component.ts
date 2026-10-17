import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender, afterRenderEffect, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, Injector, input,
  output, signal, viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { BankaApi } from '../data-access/banka.api';
import { MedijInfo, PrilogCmd, PrilogInfo } from '../data-access/banka.models';

/** Granice priloga (`VarijantaService`, `MedijService`). */
export const MAX_PRILOGA = 10;
export const MAX_VELICINA_PRILOGA = 10 * 1024 * 1024;
const MAX_IME = 60;
const IME = /^[a-z0-9_-]{1,60}$/;
/** Ime glavnog fajla rendera (`dokument.tex`): prilog se ne sme zvati tako. */
const REZERVISANO = 'dokument';
const TIPOVI = ['image/png', 'image/jpeg', 'application/pdf'];
const EKSTENZIJA = /\.(png|jpe?g|pdf)$/i;

/** Prva greška imena priloga (kao server) ili `null`; `ostala` su imena ostalih priloga varijante. */
export function proveriImePriloga(ime: string, ostala: readonly string[]): string | null {
  if (!IME.test(ime)) {
    return "Ime: 1-60 malih slova, cifara, '_' ili '-'.";
  }
  if (ime === REZERVISANO) {
    return "Ime 'dokument' je rezervisano.";
  }
  return ostala.includes(ime) ? `Ime '${ime}' se već koristi.` : null;
}

/** Greška imena svakog priloga redom (`null` = ispravno), naspram imena svih ostalih. */
export function greskePriloga(prilozi: readonly PrilogCmd[]): (string | null)[] {
  return prilozi.map((p, i) => proveriImePriloga(p.ime, prilozi.filter((_, j) => j !== i).map(x => x.ime)));
}

/**
 * Ime priloga iz naziva fajla: bez ekstenzije, mala slova bez dijakritike (đ -> dj), sve van `[a-z0-9_-]` u crticu, do 60
 * znakova; prazno je `slika`. Zauzeto ime i `dokument` dobijaju `-2`, `-3`, ...
 */
export function imeIzFajla(naziv: string, zauzeta: Iterable<string>): string {
  const z = new Set(zauzeta);
  const osnova = naziv.replace(/\.[^.]*$/, '').replace(/[đĐ]/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_IME).replace(/-+$/, '') || 'slika';
  if (osnova !== REZERVISANO && !z.has(osnova)) {
    return osnova;
  }
  for (let n = 2; ; n++) {
    const ime = `${osnova.slice(0, MAX_IME - `-${n}`.length)}-${n}`;
    if (!z.has(ime)) {
      return ime;
    }
  }
}

/** "512 B", "2 kB", "3,4 MB". */
export function velicinaFajla(b: number): string {
  if (b < 1024) {
    return `${b} B`;
  }
  if (b < 1024 * 1024) {
    return `${Math.round(b / 1024)} kB`;
  }
  return `${(b / 1024 / 1024).toFixed(1).replace(/\.0$/, '').replace('.', ',')} MB`;
}

function proveriFajl(f: File): string | null {
  if (!TIPOVI.includes(f.type) && !(f.type === '' && EKSTENZIJA.test(f.name))) {
    return 'Prilog mora biti PNG, JPEG ili PDF.';
  }
  return f.size > MAX_VELICINA_PRILOGA ? 'Prilog može imati najviše 10 MB.' : null;
}

/**
 * Prilozi varijante (slike i PDF za LaTeX): lista sa imenom kojim ga LaTeX zove (`\includegraphics{ime}`; proverava se kao
 * na serveru: regex, `dokument`, ponavljanje), nazivom i veličinom fajla, "Ubaci u tekst" (emituje `ubaci(ime)`, stranica
 * umeće `\includegraphics{ime}` na kursor aktivnog editora) i "Ukloni". "Dodaj prilog" otprema PNG, JPEG ili PDF do 10 MB
 * (`POST banka/prilozi`, tiho; greška ostaje ispod dugmeta), pa dodaje red sa imenom iz naziva fajla. Kontrolisana
 * komponenta: emituje novu listu (`priloziPromena`); `postojeci` (sačuvani prilozi) daju naziv i veličinu za već sačuvane.
 */
@Component({
  selector: 'app-prilozi',
  imports: [MatButton, MatError, MatFormField, MatIcon, MatIconButton, MatInput, MatLabel, MatProgressSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './prilozi.component.css',
  template: `
    <p class="bk-pr-uputstvo">Slika ili PDF za LaTeX; u tekstu <code>\\includegraphics{{ '{' }}ime{{ '}' }}</code>, sa širinom npr.
      <code>\\includegraphics[width=0.6\\linewidth]{{ '{' }}ime{{ '}' }}</code>.</p>
    @if (prilozi().length > 0) {
      <ul class="bk-pr-lista" aria-label="Prilozi varijante">
        @for (p of prilozi(); track $index; let i = $index) {
          @let m = medij(p.medijId);
          <li class="bk-pr-red" [attr.data-prilog]="p.medijId">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="bk-pr-ime">
              <mat-label>Ime u LaTeX-u</mat-label>
              <input matInput [value]="p.ime" [attr.maxlength]="maxIme" autocomplete="off" spellcheck="false" [disabled]="onemoguceno()"
                [errorStateMatcher]="matcher(i)" (input)="promeniIme(i, $event)" data-ime />
              <mat-error>{{ greske()[i] }}</mat-error>
            </mat-form-field>
            <span class="bk-pr-meta">
              <mat-icon [svgIcon]="m?.mime === 'application/pdf' ? 'picture_as_pdf' : 'image'" aria-hidden="true" />
              {{ m ? m.naziv + ' · ' + velicina(m.velicina) : 'Fajl priloga' }}
            </span>
            <span class="bk-pr-dugmad">
              <button matButton type="button" disabledInteractive [disabled]="!!greske()[i] || onemoguceno()" (click)="ubaciIme(i)" data-ubaci>
                Ubaci u tekst
              </button>
              <button matIconButton type="button" [disabled]="onemoguceno()" [attr.aria-label]="'Ukloni prilog ' + p.ime" (click)="ukloni(i)" data-ukloni>
                <mat-icon svgIcon="delete" aria-hidden="true" />
              </button>
            </span>
          </li>
        }
      </ul>
    }
    <div class="bk-pr-dno">
      <input #fajl type="file" class="sr-only" accept=".png,.jpg,.jpeg,.pdf" tabindex="-1" aria-hidden="true" (change)="izabran($event)" />
      <button matButton="outlined" type="button" disabledInteractive [disabled]="!mozeDodati()" (click)="mozeDodati() && fajl.click()" data-dodaj-prilog>
        <mat-icon svgIcon="upload_file" aria-hidden="true" />Dodaj prilog
      </button>
      @if (otprema(); as naziv) {
        <span class="bk-pr-otprema" role="status" data-otprema>
          <mat-progress-spinner mode="indeterminate" diameter="16" aria-hidden="true" />Otprema se „{{ naziv }}“…
        </span>
      } @else {
        <span class="bk-pr-broj">PNG, JPEG ili PDF do 10 MB; {{ prilozi().length }} od najviše {{ maxPriloga }}</span>
      }
    </div>
    @if (greskaOtpreme(); as g) {
      <p class="bk-pr-greska" role="alert" data-greska-priloga>{{ g }}</p>
    }
  `,
})
export class PriloziComponent {
  private readonly api = inject(BankaApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  readonly prilozi = input.required<readonly PrilogCmd[]>();
  /** Sačuvani prilozi varijante (naziv i veličina fajla). */
  readonly postojeci = input<readonly PrilogInfo[]>([]);
  readonly onemoguceno = input(false);
  readonly priloziPromena = output<PrilogCmd[]>();
  readonly ubaci = output<string>();

  protected readonly maxIme = MAX_IME;
  protected readonly maxPriloga = MAX_PRILOGA;
  protected readonly velicina = velicinaFajla;
  /** Naziv fajla koji se otprema (jedan po jedan). */
  protected readonly otprema = signal<string | null>(null);
  protected readonly greskaOtpreme = signal<string | null>(null);
  /** Mediji otpremljeni u ovom editoru, po id-ju (za naziv i veličinu dok nisu sačuvani). */
  private readonly otpremljeni = signal<Readonly<Record<string, MedijInfo>>>({});
  protected readonly greske = computed(() => greskePriloga(this.prilozi()));
  protected readonly mozeDodati = computed(() => !this.onemoguceno() && this.otprema() === null && this.prilozi().length < MAX_PRILOGA);
  private readonly matcheri: ErrorStateMatcher[] = [];
  private readonly imena = viewChildren(MatInput);

  constructor() {
    // `MatInput` bez `ngControl` ne računa grešku sam: posle svake promene imena, iz `greske`
    afterRenderEffect(() => {
      this.greske();
      for (const i of this.imena()) {
        i.updateErrorState();
      }
    });
  }

  protected medij(id: string): MedijInfo | null {
    return this.otpremljeni()[id] ?? this.postojeci().find(p => p.medij.id === id)?.medij ?? null;
  }

  protected matcher(i: number): ErrorStateMatcher {
    return (this.matcheri[i] ??= { isErrorState: () => !!this.greske()[i] });
  }

  protected promeniIme(i: number, e: Event): void {
    const ime = (e.target as HTMLInputElement).value;
    this.priloziPromena.emit(this.prilozi().map((p, j) => (j === i ? { ...p, ime } : p)));
  }

  protected ubaciIme(i: number): void {
    const p = this.prilozi()[i];
    if (p && !this.greske()[i] && !this.onemoguceno()) {
      this.ubaci.emit(p.ime);
    }
  }

  protected ukloni(i: number): void {
    this.priloziPromena.emit(this.prilozi().filter((_, j) => j !== i));
  }

  protected izabran(e: Event): void {
    const input = e.target as HTMLInputElement;
    const fajl = input.files?.[0];
    input.value = '';
    if (!fajl || !this.mozeDodati()) {
      return;
    }
    const greska = proveriFajl(fajl);
    this.greskaOtpreme.set(greska);
    if (greska) {
      return;
    }
    this.otprema.set(fajl.name);
    this.api
      .prilog(fajl, { tiho: true })
      .pipe(finalize(() => this.otprema.set(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: m => {
          this.otpremljeni.update(o => ({ ...o, [m.id]: m }));
          const lista = this.prilozi();
          this.priloziPromena.emit([...lista, { ime: imeIzFajla(fajl.name, lista.map(p => p.ime)), medijId: m.id }]);
          this.fokusirajIme(lista.length);
        },
        error: (err: unknown) => this.greskaOtpreme.set(err instanceof HttpErrorResponse ? toApiError(err).reason : PORUKA_SISTEM),
      });
  }

  private fokusirajIme(i: number): void {
    afterNextRender(() => this.host.nativeElement.querySelectorAll<HTMLElement>('input[data-ime]')[i]?.focus(), { injector: this.injector });
  }
}

import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
} from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';

import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { JavniUpisInfo, PodnesiPrijavuCmd, UpisApi } from '../upis.api';
import {
  Granice,
  greskaPolja,
  imeBezViskaRazmaka,
  lokalniDatum,
  normalizujIndeks,
  Polje,
  PORUKE,
  TOKEN,
} from '../upis.pravila';

type Stanje = 'ucitavanje' | 'nepostoji' | 'zatvorena' | 'forma' | 'uspeh' | 'greska';

const NEMA_POVRATNE_PORUKE = 'Proveri unete podatke i pokušaj ponovo.';

/**
 * Javna stranica `upis/:token` (student na telefonu, bez prijave, bez ljuske). Sme da zove samo `api/public/upis/*`:
 * svaki drugi `/api/*` vraća 401 i studentu otvara basic-auth dijalog. Zato uvozi samo `upis.api`, `upis.pravila` i
 * bezbedne pomoćne klase; ESLint (`eslint-rules/javna-ruta-uvozi.js`) obara svaki drugi uvoz iz `src/app`.
 *
 * Greške servera su u formi, ne u snackbaru: 400/409 sa `reason` (traka iznad dugmeta), 410 "Prijava je zatvorena",
 * 404 "link nije ispravan", mreža i 5xx "Pokušaj ponovo" (ponovo šalje iste podatke). Token stiže iz rute
 * (`withComponentInputBinding`); kad se promeni, forma kreće ispočetka.
 */
@Component({
  selector: 'app-javni-upis',
  imports: [FormErrorBanner, MatButton, MatError, MatFormField, MatHint, MatInput, MatLabel, MatProgressSpinner, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './javni-upis.html',
  styleUrl: './javni-upis.scss',
})
export class JavniUpis {
  private readonly api = inject(UpisApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Iz putanje `upis/:token`. */
  readonly token = input('');

  protected readonly granice: Granice = { maxGodina: new Date().getFullYear() + 1, danas: lokalniDatum(new Date()) };

  protected readonly forma = new FormGroup({
    ime: this.kontrola<string>('ime', '', true),
    prezime: this.kontrola<string>('prezime', '', true),
    indeks: this.kontrola<string>('indeks', '', true),
    godina: this.kontrola<number | null>('godina', null, true),
    email: this.kontrola<string>('email', '', true),
    brojTelefona: this.kontrola<string>('brojTelefona', '', true),
    datumRodjenja: this.kontrola<string>('datumRodjenja', '', false),
    opstina: this.kontrola<string>('opstina', '', false),
  });

  protected readonly stanje = signal<Stanje>('ucitavanje');
  protected readonly info = signal<JavniUpisInfo | null>(null);
  protected readonly salje = signal(false);
  /** Poruka servera (`reason`) za traku iznad dugmeta. */
  protected readonly greskaServera = signal<string | null>(null);
  /** Poslati podaci, za ekran uspeha. */
  protected readonly poslato = signal<PodnesiPrijavuCmd | null>(null);

  // Prijava čije slanje je palo na mreži ili 5xx: "Pokušaj ponovo" je šalje ponovo, sa istim podacima.
  private zaPonovno: PodnesiPrijavuCmd | null = null;
  private zahtev?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
    effect(() => {
      const token = this.token();
      untracked(() => this.pokreni(token));
    });
  }

  /** Poruka ispod polja (vidi se tek kad je polje dodirnuto ili posle pokušaja slanja: to radi `mat-form-field`). */
  protected poruka(polje: Polje): string | null {
    const errors = this.forma.controls[polje].errors;
    return errors ? ((errors['poruka'] as string | undefined) ?? PORUKE[polje]) : null;
  }

  protected posalji(): void {
    if (this.salje()) {
      return;
    }
    this.greskaServera.set(null);
    if (this.forma.invalid) {
      this.forma.markAllAsTouched();
      // Posle iscrtavanja poruka: fokus na prvo neispravno polje (redosled u DOM-u = redosled u formi).
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('input.ng-invalid')?.focus(), {
        injector: this.injector,
      });
      return;
    }
    this.salji(this.napraviKomandu());
  }

  protected pokusajPonovo(): void {
    const cmd = this.zaPonovno;
    if (cmd) {
      this.zaPonovno = null;
      this.stanje.set('forma');
      this.salji(cmd);
    } else {
      this.ucitaj(this.token());
    }
  }

  private kontrola<T extends string | number | null>(polje: Polje, pocetna: T, obavezno: boolean): FormControl<T> {
    const proveri = (c: AbstractControl): ValidationErrors | null => {
      const poruka = greskaPolja(polje, c.value, this.granice);
      return poruka ? { poruka } : null;
    };
    return new FormControl<T>(pocetna, {
      nonNullable: true,
      validators: obavezno ? [Validators.required, proveri] : [proveri],
    });
  }

  private pokreni(token: string): void {
    this.info.set(null);
    this.forma.reset();
    this.salje.set(false);
    this.greskaServera.set(null);
    this.poslato.set(null);
    this.zaPonovno = null;
    this.ucitaj(token);
  }

  private ucitaj(token: string): void {
    this.zahtev?.unsubscribe();
    this.stanje.set('ucitavanje');
    if (!TOKEN.test(token)) {
      // Sve van url-safe alfabeta je nepostojeći link: ne ide u putanju zahteva.
      this.stanje.set('nepostoji');
      return;
    }
    this.zahtev = this.api.info(token).subscribe({
      next: info => {
        this.info.set(info);
        if (!info.otvorena) {
          this.stanje.set('zatvorena');
          return;
        }
        const godina = this.forma.controls.godina;
        if (godina.value === null) {
          godina.setValue(info.godinaUpisa);
        }
        this.stanje.set('forma');
      },
      error: (err: HttpErrorResponse) => this.stanje.set(err.status === 404 ? 'nepostoji' : 'greska'),
    });
  }

  private salji(cmd: PodnesiPrijavuCmd): void {
    this.salje.set(true);
    this.greskaServera.set(null);
    this.zahtev?.unsubscribe();
    this.zahtev = this.api.podnesi(this.token(), cmd).subscribe({
      next: () => {
        this.salje.set(false);
        this.poslato.set(cmd);
        this.prikazi('uspeh');
      },
      error: (err: HttpErrorResponse) => {
        this.salje.set(false);
        if (err.status === 400 || err.status === 409) {
          const reason = (err.error as { reason?: unknown } | null)?.reason;
          this.greskaServera.set(typeof reason === 'string' && reason ? reason : NEMA_POVRATNE_PORUKE);
        } else if (err.status === 410) {
          this.prikazi('zatvorena');
        } else if (err.status === 404) {
          this.prikazi('nepostoji');
        } else {
          this.zaPonovno = cmd;
          this.prikazi('greska');
        }
      },
    });
  }

  // Forma je dugačka, a ostala stanja kratka: vrati na vrh da se poruka vidi.
  private prikazi(stanje: Stanje): void {
    this.stanje.set(stanje);
    this.host.nativeElement.ownerDocument.defaultView?.scrollTo(0, 0);
  }

  private napraviKomandu(): PodnesiPrijavuCmd {
    const f = this.forma.getRawValue();
    return {
      ime: imeBezViskaRazmaka(f.ime),
      prezime: imeBezViskaRazmaka(f.prezime),
      indeks: normalizujIndeks(f.indeks),
      godina: f.godina,
      email: f.email.trim(),
      brojTelefona: f.brojTelefona.trim(),
      datumRodjenja: f.datumRodjenja || null,
      opstina: f.opstina.trim() || null,
    };
  }
}

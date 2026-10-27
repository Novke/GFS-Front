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
import { MatError, MatFormField, MatHint, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';

import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { IndeksPolja, indeksKontrole, vrednostIndeksa } from '../../../shared/forms/indeks-polja';
import { ispravnaGodina, prikazIndeksa } from '../../../shared/util/indeks';
import {
  DRUGA_ZEMLJA,
  greskaPozivnog,
  greskaTelefona,
  PODRAZUMEVANA_ZEMLJA,
  prikazTelefona,
  razdvojiMedjunarodni,
  uE164,
  zemlja,
  ZEMLJE,
} from '../telefon';
import { JavniUpisInfo, PodnesiPrijavuCmd, UpisApi } from '../upis.api';
import {
  Granice,
  greskaPolja,
  imeBezViskaRazmaka,
  lokalniDatum,
  Polje,
  PORUKE,
  TOKEN,
  waLinkZaPrikaz,
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
  imports: [
    FormErrorBanner,
    IndeksPolja,
    MatButton,
    MatError,
    MatFormField,
    MatHint,
    MatInput,
    MatLabel,
    MatPrefix,
    MatProgressSpinner,
    ReactiveFormsModule,
  ],
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

  protected readonly granice: Granice = { danas: lokalniDatum(new Date()) };
  protected readonly zemlje = ZEMLJE;
  protected readonly drugaZemlja = DRUGA_ZEMLJA;

  /** Telefon: zemlja (pozivni broj), ručni pozivni broj za "Druga zemlja" i broj; šalje se E.164. */
  protected readonly telefon = new FormGroup({
    zemlja: new FormControl(PODRAZUMEVANA_ZEMLJA, { nonNullable: true }),
    pozivni: new FormControl('', {
      nonNullable: true,
      validators: [(c: AbstractControl<string>) => this.telefonGreska(c, 'pozivni')],
    }),
    broj: new FormControl('', {
      nonNullable: true,
      validators: [(c: AbstractControl<string>) => this.telefonGreska(c, 'broj')],
    }),
  });

  protected readonly forma = new FormGroup({
    ime: this.kontrola('ime', true),
    prezime: this.kontrola('prezime', true),
    indeks: indeksKontrole(null),
    email: this.kontrola('email', true),
    telefon: this.telefon,
    datumRodjenja: this.kontrola('datumRodjenja', false),
    opstina: this.kontrola('opstina', false),
  });

  /** Izabrana zemlja telefona i E.164 broj za prikaz ispod polja ("Biće sačuvan kao ..."). */
  protected readonly telefonVrednost = signal(this.telefon.getRawValue());

  protected readonly stanje = signal<Stanje>('ucitavanje');
  protected readonly info = signal<JavniUpisInfo | null>(null);
  protected readonly salje = signal(false);
  /** Poruka servera (`reason`) za traku iznad dugmeta. */
  protected readonly greskaServera = signal<string | null>(null);
  /** Poslati podaci, za ekran uspeha. */
  protected readonly poslato = signal<PodnesiPrijavuCmd | null>(null);
  /** WhatsApp grupa generacije iz odgovora na prijavu (samo kanonski link), za dugme na ekranu uspeha. */
  protected readonly waLink = signal<string | null>(null);

  // Prijava čije slanje je palo na mreži ili 5xx: "Pokušaj ponovo" je šalje ponovo, sa istim podacima.
  private zaPonovno: PodnesiPrijavuCmd | null = null;
  private zahtev?: Subscription;

  constructor() {
    const izmene = this.telefon.valueChanges.subscribe(() => this.telefonVrednost.set(this.telefon.getRawValue()));
    // Promena zemlje ili pozivnog broja menja ispravnost broja (i obrnuto): provera bez novog događaja vrednosti.
    const zavisnost = this.telefon.controls.zemlja.valueChanges.subscribe(() => this.proveriTelefon());
    const zavisnost2 = this.telefon.controls.pozivni.valueChanges.subscribe(() =>
      this.telefon.controls.broj.updateValueAndValidity({ emitEvent: false }),
    );
    const zavisnost3 = this.telefon.controls.broj.valueChanges.subscribe(() =>
      this.telefon.controls.pozivni.updateValueAndValidity({ emitEvent: false }),
    );
    inject(DestroyRef).onDestroy(() => {
      this.zahtev?.unsubscribe();
      izmene.unsubscribe();
      zavisnost.unsubscribe();
      zavisnost2.unsubscribe();
      zavisnost3.unsubscribe();
    });
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

  protected porukaTelefona(polje: 'broj' | 'pozivni'): string | null {
    return (this.telefon.controls[polje].errors?.['poruka'] as string | undefined) ?? null;
  }

  /** E.164 iz trenutnog unosa (za "Biće sačuvan kao"), ili `null`. */
  protected e164(): string | null {
    const t = this.telefonVrednost();
    const v = uE164(t.zemlja, t.pozivni, t.broj);
    return v ? prikazTelefona(v) : null;
  }

  protected oznakaZemlje(kod: string): string {
    const z = zemlja(kod);
    return z.pozivni ? `${z.zastava} +${z.pozivni} ${z.naziv}` : `${z.zastava} ${z.naziv}`;
  }

  /**
   * Nalepljen ili ukucan pun međunarodni broj (`+387 65 123 456`, `00387...`) sa liste zemalja: zemlja se bira sama, a u
   * polju ostaje broj bez pozivnog. Na `blur` i posle `paste` (ne dok se kuca, da polje ne skače pod prstima).
   */
  protected prepoznajZemlju(): void {
    const c = this.telefon.controls;
    const r = razdvojiMedjunarodni(c.broj.value);
    if (r) {
      c.zemlja.setValue(r.kod);
      c.broj.setValue(r.broj);
    }
  }

  protected nalepljenTelefon(): void {
    // Vrednost polja je nova tek posle događaja `paste`.
    setTimeout(() => this.prepoznajZemlju());
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

  private kontrola(polje: Polje, obavezno: boolean): FormControl<string> {
    const proveri = (c: AbstractControl<string>): ValidationErrors | null => {
      const poruka = greskaPolja(polje, c.value, this.granice);
      return poruka ? { poruka } : null;
    };
    return new FormControl('', {
      nonNullable: true,
      validators: obavezno ? [Validators.required, proveri] : [proveri],
    });
  }

  private telefonGreska(c: AbstractControl<string>, polje: 'broj' | 'pozivni'): ValidationErrors | null {
    const t = c.parent?.value as { zemlja?: string; pozivni?: string; broj?: string } | undefined;
    const zemljaKod = t?.zemlja ?? PODRAZUMEVANA_ZEMLJA;
    const pozivni = polje === 'pozivni' ? c.value : (t?.pozivni ?? '');
    const broj = polje === 'broj' ? c.value : (t?.broj ?? '');
    const poruka =
      polje === 'broj' ? greskaTelefona(zemljaKod, pozivni, broj) : greskaPozivnog(zemljaKod, pozivni, broj);
    return poruka ? { poruka } : null;
  }

  private proveriTelefon(): void {
    this.telefon.controls.broj.updateValueAndValidity({ emitEvent: false });
    this.telefon.controls.pozivni.updateValueAndValidity({ emitEvent: false });
  }

  private pokreni(token: string): void {
    this.info.set(null);
    this.forma.reset();
    this.telefonVrednost.set(this.telefon.getRawValue());
    this.salje.set(false);
    this.greskaServera.set(null);
    this.poslato.set(null);
    this.waLink.set(null);
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
        // Predlog: godina upisa grupe sesije; student je može promeniti (upisan ranije, ponovo upisuje godinu).
        const godina = this.forma.controls.indeks.controls.godina;
        if (!godina.value && ispravnaGodina(info.godinaUpisa)) {
          godina.setValue(String(info.godinaUpisa));
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
      next: odgovor => {
        this.salje.set(false);
        this.waLink.set(waLinkZaPrikaz(odgovor?.waLink));
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

  /** Indeks za ekran uspeha: `GD12/2026`. */
  protected indeksZaPrikaz(p: PodnesiPrijavuCmd): string {
    return prikazIndeksa(p.indeks, p.godina);
  }

  protected telefonZaPrikaz(broj: string): string {
    return prikazTelefona(broj);
  }

  private napraviKomandu(): PodnesiPrijavuCmd {
    const f = this.forma.getRawValue();
    // forma je ispravna (proverio `posalji`), pa obe vrednosti postoje
    const indeks = vrednostIndeksa(this.forma.controls.indeks) ?? { indeks: '', godina: 0 };
    return {
      ime: imeBezViskaRazmaka(f.ime),
      prezime: imeBezViskaRazmaka(f.prezime),
      indeks: indeks.indeks,
      godina: indeks.godina,
      email: f.email.trim(),
      brojTelefona: uE164(f.telefon.zemlja, f.telefon.pozivni, f.telefon.broj) ?? f.telefon.broj.trim(),
      datumRodjenja: f.datumRodjenja || null,
      opstina: f.opstina.trim() || null,
    };
  }
}

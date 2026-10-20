import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { NalogApi } from '../data-access/nalog.api';
import {
  PORUKA_KOD_POSLAT, PORUKA_POMOC, PORUKA_POVEZIVANJE_ISTEKLO, PORUKA_VEC_POVEZAN, StudentJa,
} from '../data-access/nalog.models';
import { javnoNazad, porukaGreske, putanjaCilja, razlogServera } from '../data-access/nalog.pravila';
import { IndeksKorak } from '../ui/indeks-korak.component';
import { KodKorak } from '../ui/kod-korak.component';
import { NalogOkvir } from '../ui/nalog-okvir.component';

/** Korak uparivanja (bez `?greska` i `?uloga=nastavnik`). */
type KorakMoodla = 'ucitavanje' | 'greska' | 'indeks' | 'kod' | 'potvrda' | 'povezan' | 'neuspeh';
type Prikaz = KorakMoodla | 'lti-greska' | 'nastavnik';

const NASLOV: Record<Prikaz, string> = {
  ucitavanje: 'Moodle',
  greska: 'Moodle',
  indeks: 'Poveži Moodle nalog sa GFS-om',
  kod: 'Unesi kod',
  potvrda: 'Poveži Moodle nalog sa GFS-om',
  povezan: 'Moodle nalog je povezan',
  neuspeh: 'Povezivanje nije uspelo',
  'lti-greska': 'Prijava iz Moodle-a nije uspela',
  nastavnik: 'Registracija alata',
};

/**
 * Poruke za `?greska=<kod>` (kodovi preusmerenja backenda posle neuspelog ulaska iz Moodle-a, spec prijave 8.3). Nepoznat kod
 * dobija {@link PORUKA_LTI_OPSTA}; sam kod iz URL-a se nikad ne prikazuje.
 */
export const PORUKE_LTI_GRESAKA: Readonly<Record<string, string>> = {
  'nepoznata-registracija': 'Ovaj Moodle predmet nije registrovan u GFS-u ili mu je registracija isključena. Javi se nastavniku.',
  'istekla-sesija': 'Ulazak iz Moodle-a je istekao ili je već iskorišćen. Otvori GFS ponovo iz Moodle-a.',
  // pregledač ne vraća kolačić `SameSite=None` (stroga zaštita privatnosti): provera se ne slabi, student ide na prijavu kodom
  'bez-kolacica':
    'Pregledač nije vratio kolačić potreban za ulazak iz Moodle-a (to rade neki pregledači sa strogom zaštitom privatnosti). ' +
    'Otvori GFS ovde i prijavi se kodom sa mejla.',
  'neispravan-token':
    'GFS nije mogao da proveri prijavu koju je poslao Moodle. Otvori GFS ponovo iz Moodle-a; ako se ponovi, javi se nastavniku.',
  'nepodrzana-poruka': 'GFS ne podržava ovu vrstu veze iz Moodle-a. Javi se nastavniku.',
};
export const PORUKA_LTI_OPSTA = 'Ulazak iz Moodle-a nije uspeo. Otvori GFS ponovo iz Moodle-a.';

/** `povezi` 401: kolačića studenta nema (istekao ili opozvan između prijave i povezivanja). */
const PORUKA_SESIJA_ISTEKLA = 'Prijava na ovom uređaju je istekla. Prijavi se ponovo kodom sa mejla.';

/**
 * Javna stranica `/nalog/moodle` (u `PublicLayout`-u, bez sesije nastavnika; spec prijave 8.3). Backend posle ulaska iz Moodle-a
 * preusmerava ovde u tri slučaja:
 * - **`?greska=<kod>`**: poruka po kodu ({@link PORUKE_LTI_GRESAKA}) i link "Otvori GFS" (`/nalog`); bez ijednog zahteva.
 * - **`?uloga=nastavnik`**: "Alat je ispravno registrovan." (Moodle ne otvara nastavničku sesiju); bez zahteva.
 * - **bez parametara**: student čiji Moodle nalog još nije povezan. Isti tok indeks -> kod kao `/nalog` (koraci `IndeksKorak`
 *   i `KodKorak`), pa odmah `POST api/public/lti/povezi` (kolačić `gfs_lti_par` iz ulaska) -> "Moodle nalog je povezan".
 *   Već prijavljen student vidi svoje ime i bira "Poveži" (nikad automatski). 409 i 410 su doslovno tekst servera; 401 vraća
 *   na indeks; mreža i 5xx ostavljaju prijavljenog studenta na "Poveži" sa greškom.
 *
 * Zove samo `api/public/nalog/*` i `api/public/lti/povezi` (`NalogApi`). `nazad` (samo javna ruta, `javnoNazad`) posle
 * povezivanja daje "Nastavi" (bez skoka: potvrda veze ostaje vidljiva).
 */
@Component({
  selector: 'app-moodle-page',
  imports: [FormErrorBanner, IndeksKorak, KodKorak, MatButton, MatProgressSpinner, NalogOkvir, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-nalog-okvir>
      <h2 tabindex="-1">{{ naslov() }}</h2>
      @switch (prikaz()) {
        @case ('lti-greska') {
          <p class="poruka opasnost" role="alert">{{ porukaLti() }}</p>
          <a matButton="filled" class="dugme" routerLink="/nalog">Otvori GFS</a>
        }
        @case ('nastavnik') {
          <p class="poruka uspeh" role="status">Alat je ispravno registrovan.</p>
          <p class="uvod">
            Moodle je otvorio GFS sa ulogom nastavnika, pa ovde nema prijave. Studenti ovde jednom povezuju svoj Moodle nalog
            sa GFS-om, a posle toga ulaze jednim klikom. Registracije alata su u GFS-u: Podešavanja → Moodle.
          </p>
        }
        @case ('ucitavanje') {
          <p class="stanje" role="status">
            <mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Učitavanje...
          </p>
        }
        @case ('greska') {
          <p class="poruka opasnost" role="alert">{{ greskaUcitavanja() }}</p>
          <button type="button" mat-flat-button class="dugme" (click)="ucitaj()">Pokušaj ponovo</button>
        }
        @case ('indeks') {
          <p class="uvod">
            Prvi ulazak iz Moodle-a: prijavi se jednom kodom sa mejla i Moodle nalog ostaje povezan sa GFS-om. Posle toga iz
            Moodle-a ulaziš jednim klikom.
          </p>
          <app-nalog-indeks-korak
            [indeks]="indeks()"
            [salje]="salje()"
            [greska]="greskaKoraka()"
            (posaljiKod)="posaljiKod($event)"
          />
        }
        @case ('kod') {
          <app-nalog-kod-korak
            [indeks]="indeks()"
            [maska]="maska()"
            [poruka]="porukaKoda()"
            [slanjeBroj]="slanjeBroj()"
            [salje]="salje()"
            [greska]="greskaKoraka()"
            [pomoc]="pomoc()"
            [pomocSalje]="pomocSalje()"
            (prijavi)="prijavi($event)"
            (posaljiPonovo)="posaljiKod(indeks())"
            (neStize)="neStize()"
            (promeniIndeks)="idiNa('indeks')"
          />
        }
        @case ('potvrda') {
          <app-form-error-banner [poruka]="greskaKoraka()" />
          @if (ja(); as s) {
            <p class="uvod">Na ovom uređaju si prijavljen kao {{ s.ime }} {{ s.prezime }} ({{ s.indeks }}).</p>
          }
          <p class="uvod">Posle povezivanja iz Moodle-a ulaziš jednim klikom, bez koda.</p>
          <button type="button" mat-flat-button class="dugme" [disabled]="salje()" (click)="povezi()">
            @if (salje()) {
              <mat-progress-spinner mode="indeterminate" diameter="18" aria-hidden="true" />
            }
            Poveži
          </button>
          <div class="akcije">
            <button type="button" matButton [disabled]="salje()" (click)="idiNa('indeks')">Drugi indeks</button>
          </div>
        }
        @case ('povezan') {
          <p class="poruka uspeh" role="status">Sledeći put iz Moodle-a ulaziš jednim klikom, bez koda.</p>
          @if (nastaviNa()) {
            <button type="button" mat-flat-button class="dugme" (click)="nastavi()">Nastavi</button>
          }
          <div class="akcije">
            <a matButton="outlined" routerLink="/nalog">Otvori nalog</a>
          </div>
        }
        @case ('neuspeh') {
          <p class="poruka opasnost" role="alert">{{ greskaKoraka() }}</p>
          <a matButton="filled" class="dugme" routerLink="/nalog">Otvori GFS</a>
        }
      }
    </app-nalog-okvir>
  `,
  styles: `
    h2 { margin: 0 0 14px; font-size: 18px; }
    h2:focus { outline: none; }

    .uvod { margin: 0 0 16px; color: var(--ink-2); }
    .stanje { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0; padding: 24px 0;
      color: var(--muted); }
    .dugme { width: 100%; min-height: 48px; font-size: 16px; }
    .dugme mat-progress-spinner { display: inline-block; margin-right: 8px; vertical-align: middle; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .akcije > * { min-height: 44px; }
    .poruka { margin: 0 0 16px; padding: 12px 16px; border: 1px solid transparent; border-radius: var(--radius-sm); }
    .poruka.opasnost { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
    .poruka.uspeh { background: var(--ok-soft); border-color: var(--ok); color: var(--ok); }
  `,
})
export class MoodlePage {
  /** Query `greska` (kod iz preusmerenja backenda). */
  readonly greska = input<string | null | undefined>(null);
  /** Query `uloga`: samo `nastavnik` menja prikaz. */
  readonly uloga = input<string | null | undefined>(null);
  /** Query `nazad` (javna ruta); proverava ga `javnoNazad`. */
  readonly nazad = input<string | null | undefined>(null);

  private readonly api = inject(NalogApi);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Šta stranica radi: greška ulaska ima prednost, pa nastavnik, pa uparivanje. */
  private readonly rezim = computed<'lti-greska' | 'nastavnik' | 'tok'>(() =>
    this.greska() ? 'lti-greska' : this.uloga() === 'nastavnik' ? 'nastavnik' : 'tok',
  );
  protected readonly korak = signal<KorakMoodla>('ucitavanje');
  protected readonly prikaz = computed<Prikaz>(() => (this.rezim() === 'tok' ? this.korak() : this.rezim() as Prikaz));
  protected readonly naslov = computed(() => NASLOV[this.prikaz()]);
  /** Samo sopstveni ključevi mape (`constructor`, `__proto__` iz URL-a nisu kodovi). */
  protected readonly porukaLti = computed(() => {
    const kod = this.greska() ?? '';
    return Object.hasOwn(PORUKE_LTI_GRESAKA, kod) ? PORUKE_LTI_GRESAKA[kod] : PORUKA_LTI_OPSTA;
  });

  protected readonly indeks = signal('');
  protected readonly maska = signal('');
  protected readonly porukaKoda = signal(PORUKA_KOD_POSLAT);
  protected readonly slanjeBroj = signal(0);
  protected readonly salje = signal(false);
  /** Greška servera za baner trenutnog koraka (i tekst ekrana "Povezivanje nije uspelo"). */
  protected readonly greskaKoraka = signal<string | null>(null);
  protected readonly greskaUcitavanja = signal('');
  protected readonly pomoc = signal<string | null>(null);
  protected readonly pomocSalje = signal(false);
  protected readonly ja = signal<StudentJa | null>(null);
  /** Javni `nazad` koji ne vodi nazad na ovu stranicu. */
  protected readonly nastaviNa = computed(() => {
    const cilj = javnoNazad(this.nazad());
    return cilj !== null && putanjaCilja(cilj) !== 'nalog/moodle' ? cilj : null;
  });

  private zahtev?: Subscription;
  private ucitano = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
    // tok uparivanja učitava stanje tek kad su query ulazi postavljeni (greška i nastavnik ne zovu ništa)
    effect(() => {
      if (this.rezim() === 'tok' && !this.ucitano) {
        this.ucitano = true;
        untracked(() => this.ucitaj(false));
      }
    });
  }

  /** `GET stanje`, pa (prijavljen) `GET ja`: indeks ili "Poveži". */
  protected ucitaj(fokus = true): void {
    this.zahtev?.unsubscribe();
    this.korak.set('ucitavanje');
    this.zahtev = this.api.stanje().subscribe({
      next: s => (s?.prijavljen ? this.ucitajJa(fokus) : this.idiNa('indeks', fokus)),
      error: (e: unknown) => this.greskaPriUcitavanju(e, fokus),
    });
  }

  protected posaljiKod(indeks: string): void {
    if (this.salje()) {
      return;
    }
    this.pocni();
    this.zahtev = this.api.posaljiKod(indeks).subscribe({
      next: odg => {
        this.salje.set(false);
        this.indeks.set(indeks);
        this.maska.set(odg?.maska ?? '');
        this.porukaKoda.set(odg?.poruka || PORUKA_KOD_POSLAT);
        this.slanjeBroj.update(n => n + 1);
        this.pomoc.set(null);
        if (this.korak() !== 'kod') {
          this.idiNa('kod');
        }
      },
      error: (e: unknown) => this.neuspeh(e),
    });
  }

  /** Prijava kodom, pa odmah povezivanje (dugme koraka ostaje zauzeto do kraja oba zahteva). */
  protected prijavi(kod: string): void {
    if (this.salje()) {
      return;
    }
    this.pocni();
    this.zahtev = this.api.prijavi(this.indeks(), kod).subscribe({
      next: () => this.povezi(true),
      error: (e: unknown) => this.neuspeh(e),
    });
  }

  protected neStize(): void {
    if (this.pomocSalje()) {
      return;
    }
    this.pomocSalje.set(true);
    this.greskaKoraka.set(null);
    this.pomoc.set(null);
    this.api.pomoc(this.indeks()).subscribe({
      next: odg => {
        this.pomocSalje.set(false);
        this.pomoc.set(odg?.poruka || PORUKA_POMOC);
      },
      error: (e: unknown) => {
        this.pomocSalje.set(false);
        this.greskaKoraka.set(porukaGreske(e));
      },
    });
  }

  /** `POST api/public/lti/povezi`; `posleKoda`: zahtev ide odmah posle prijave kodom (`salje` je već uključen). */
  protected povezi(posleKoda = false): void {
    if (this.salje() && !posleKoda) {
      return;
    }
    this.pocni();
    this.zahtev = this.api.poveziMoodle().subscribe({
      next: () => {
        this.salje.set(false);
        this.idiNa('povezan');
      },
      error: (e: unknown) => this.neuspehPovezivanja(e),
    });
  }

  protected nastavi(): void {
    const cilj = this.nastaviNa();
    if (cilj) {
      void this.router.navigateByUrl(cilj);
    }
  }

  /** Prelaz na korak; posle radnje korisnika fokus ide na naslov koraka (čitač ekrana čuje gde je). */
  protected idiNa(korak: KorakMoodla, fokus = true): void {
    this.greskaKoraka.set(null);
    this.korak.set(korak);
    if (fokus) {
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('h2')?.focus(), { injector: this.injector });
    }
  }

  private neuspehPovezivanja(e: unknown): void {
    this.salje.set(false);
    const status = e instanceof HttpErrorResponse ? e.status : 0;
    if (status === 409 || status === 410) {
      // tekst servera doslovno ("već povezan sa drugim studentom", "Povezivanje je isteklo. ..."); posle toga nema ponovnog pokušaja
      this.idiNa('neuspeh');
      this.greskaKoraka.set(razlogServera(e) ?? (status === 410 ? PORUKA_POVEZIVANJE_ISTEKLO : PORUKA_VEC_POVEZAN));
    } else if (status === 401) {
      this.ja.set(null);
      this.idiNa('indeks');
      this.greskaKoraka.set(PORUKA_SESIJA_ISTEKLA);
    } else {
      // mreža, 5xx, 429: student je prijavljen, "Poveži" može ponovo
      this.ucitajJa(true, porukaGreske(e));
    }
  }

  /** `GET ja`, pa "Poveži" (sa greškom za baner, ako je ima); 401 = indeks. */
  private ucitajJa(fokus: boolean, greska: string | null = null): void {
    this.zahtev?.unsubscribe();
    this.zahtev = this.api.ja().subscribe({
      next: ja => {
        this.ja.set(ja);
        this.indeks.set(ja.indeks);
        this.idiNa('potvrda', fokus);
        this.greskaKoraka.set(greska);
      },
      error: (e: unknown) => {
        if (e instanceof HttpErrorResponse && e.status === 401) {
          this.ja.set(null);
          this.idiNa('indeks', fokus);
        } else if (greska !== null) {
          // povezivanje je palo bez mreže, a ni `ja` ne stiže: "Poveži" bez imena, sa prvom greškom
          this.idiNa('potvrda', fokus);
          this.greskaKoraka.set(greska);
        } else {
          this.greskaPriUcitavanju(e, fokus);
        }
      },
    });
  }

  private pocni(): void {
    this.zahtev?.unsubscribe();
    this.salje.set(true);
    this.greskaKoraka.set(null); // ista poruka dvaput zaredom: baner mora prvo da nestane (FormErrorBanner)
  }

  private neuspeh(e: unknown): void {
    this.salje.set(false);
    this.greskaKoraka.set(porukaGreske(e));
  }

  private greskaPriUcitavanju(e: unknown, fokus: boolean): void {
    this.greskaUcitavanja.set(porukaGreske(e));
    this.idiNa('greska', fokus);
  }
}

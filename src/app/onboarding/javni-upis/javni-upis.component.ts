import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NgForm, NgModel } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { JavniUpisInfo, PodnesiPrijavuCmd } from 'src/app/models/model';
import { OnboardingService } from '../onboarding.service';

type Stanje = 'ucitavanje' | 'nepostoji' | 'zatvorena' | 'forma' | 'uspeh' | 'greska';
type Polje = 'ime' | 'prezime' | 'indeks' | 'godina' | 'email' | 'brojTelefona' | 'datumRodjenja' | 'opstina';

interface UpisForma {
  ime: string;
  prezime: string;
  indeks: string;
  godina: number | null;
  email: string;
  brojTelefona: string;
  datumRodjenja: string;
  opstina: string;
}

const POLJA: Polje[] = ['ime', 'prezime', 'indeks', 'godina', 'email', 'brojTelefona', 'datumRodjenja', 'opstina'];

// Pravila kao na serveru (PrijavaPP), da student grešku vidi ispod polja, a ne tek posle slanja.
const TOKEN = /^[A-Za-z0-9_-]{1,64}$/;
const INDEKS = /^[A-Z0-9/.-]{2,20}$/;
const TELEFON = /^[0-9 +\-/]{6,20}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

const PORUKE: Record<Polje, string> = {
  ime: 'Unesi ime.',
  prezime: 'Unesi prezime.',
  indeks: 'Unesi indeks latinicom (2-20 znakova, npr. GD12).',
  godina: 'Unesi godinu upisa.',
  email: 'Unesi ispravan email.',
  brojTelefona: 'Unesi broj telefona (6-20 cifara, može +, -, /, razmak).',
  datumRodjenja: 'Unesi ispravan datum rođenja.',
  opstina: 'Opština može imati najviše 100 znakova.'
};

/** Kao IndeksUtil.normalizuj na serveru: bez razmaka (i neprekidivih), velikim slovima ("gd 12" -> "GD12"). */
function normalizujIndeks(v: string): string {
  return v.replace(/\s+/g, '').toUpperCase();
}

function imeBezViskaRazmaka(v: string): string {
  return v.trim().replace(/\s+/g, ' ');
}

function lokalniDatum(d: Date): string {
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}

/**
 * Javna stranica upis/:token (bez prijave, bez toolbara). Sme da zove samo api/public/upis/*:
 * svaki drugi /api/* poziv vraća 401 i studentu na telefonu otvara basic-auth dijalog.
 */
@Component({
    selector: 'app-javni-upis',
    templateUrl: './javni-upis.component.html',
    styleUrls: ['./javni-upis.component.css'],
    standalone: false
})
export class JavniUpisComponent implements OnInit, OnDestroy {

  readonly maxGodina = new Date().getFullYear() + 1;
  readonly danas = lokalniDatum(new Date());

  stanje: Stanje = 'ucitavanje';
  info: JavniUpisInfo | null = null;
  forma: UpisForma = this.praznaForma();
  salje = false;
  greskaServera: string | null = null;
  poslato: PodnesiPrijavuCmd | null = null;

  private token = '';
  // Prijava čije slanje je palo na mreži ili 5xx: "Pokušaj ponovo" je šalje ponovo, sa istim podacima.
  private zaPonovno: PodnesiPrijavuCmd | null = null;
  private paramSub?: Subscription;
  private zahtevSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private onboardingService: OnboardingService) { }

  ngOnInit(): void {
    this.paramSub = this.route.paramMap.subscribe(params => {
      this.token = params.get('token') ?? '';
      this.info = null;
      this.forma = this.praznaForma();
      this.salje = false;
      this.greskaServera = null;
      this.poslato = null;
      this.zaPonovno = null;
      this.ucitaj();
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
    this.zahtevSub?.unsubscribe();
  }

  /** Poruka ako polje ne prolazi pravila servera, inače null. */
  greska(polje: Polje): string | null {
    const f = this.forma;
    switch (polje) {
      case 'ime':
      case 'prezime': {
        const s = imeBezViskaRazmaka(f[polje]);
        return s.length > 0 && s.length <= 60 ? null : PORUKE[polje];
      }
      case 'indeks':
        if (!f.indeks.trim()) {
          return 'Unesi indeks (2-20 znakova).';
        }
        return INDEKS.test(normalizujIndeks(f.indeks)) ? null : PORUKE.indeks;
      case 'godina':
        if (f.godina === null || f.godina === undefined) {
          return PORUKE.godina;
        }
        return Number.isInteger(f.godina) && f.godina >= 2000 && f.godina <= this.maxGodina
          ? null : `Unesi godinu upisa (2000-${this.maxGodina}).`;
      case 'email': {
        const s = f.email.trim();
        return s.length <= 120 && EMAIL.test(s) ? null : PORUKE.email;
      }
      case 'brojTelefona':
        return TELEFON.test(f.brojTelefona.trim()) ? null : PORUKE.brojTelefona;
      case 'datumRodjenja': {
        const d = f.datumRodjenja;
        return !d || (DATUM.test(d) && d >= '1920-01-01' && d <= this.danas) ? null : PORUKE.datumRodjenja;
      }
      case 'opstina':
        return f.opstina.trim().length <= 100 ? null : PORUKE.opstina;
    }
  }

  /** Poruka ispod polja: tek kad je polje dodirnuto ili posle pokušaja slanja. */
  poruka(f: NgForm, ctrl: NgModel, polje: Polje): string | null {
    if (!ctrl.touched && !f.submitted) {
      return null;
    }
    return this.greska(polje) ?? (ctrl.invalid ? PORUKE[polje] : null);
  }

  posalji(f: NgForm, formaEl: HTMLFormElement): void {
    if (this.salje) {
      return;
    }
    this.greskaServera = null;
    if (f.invalid || POLJA.some(p => this.greska(p) !== null)) {
      f.form.markAllAsTouched();
      // Posle iscrtavanja poruka: fokus na prvo neispravno polje (redosled u DOM-u = redosled u formi).
      setTimeout(() => formaEl.querySelector<HTMLElement>('.is-invalid')?.focus());
      return;
    }
    this.salji(this.napraviKomandu());
  }

  pokusajPonovo(): void {
    const cmd = this.zaPonovno;
    if (cmd) {
      this.zaPonovno = null;
      this.stanje = 'forma';
      this.salji(cmd);
    } else {
      this.ucitaj();
    }
  }

  private ucitaj(): void {
    this.zahtevSub?.unsubscribe();
    this.stanje = 'ucitavanje';
    // Token iz URL-a ide u putanju zahteva: sve van url-safe alfabeta (npr. "a%2F..%2F..") je nepostojeći link.
    if (!TOKEN.test(this.token)) {
      this.stanje = 'nepostoji';
      return;
    }
    this.zahtevSub = this.onboardingService.getJavniUpis(this.token).subscribe({
      next: (info) => {
        this.info = info;
        if (!info.otvorena) {
          this.stanje = 'zatvorena';
          return;
        }
        if (this.forma.godina === null) {
          this.forma.godina = info.godinaUpisa;
        }
        this.stanje = 'forma';
      },
      error: (err: HttpErrorResponse) => this.stanje = err.status === 404 ? 'nepostoji' : 'greska'
    });
  }

  private salji(cmd: PodnesiPrijavuCmd): void {
    this.salje = true;
    this.greskaServera = null;
    this.zahtevSub?.unsubscribe();
    this.zahtevSub = this.onboardingService.podnesiPrijavu(this.token, cmd).subscribe({
      next: () => {
        this.salje = false;
        this.poslato = cmd;
        this.prikazi('uspeh');
      },
      error: (err: HttpErrorResponse) => {
        this.salje = false;
        if (err.status === 400 || err.status === 409) {
          const reason = err.error?.reason;
          this.greskaServera = typeof reason === 'string' && reason ? reason : 'Proveri unete podatke i pokušaj ponovo.';
        } else if (err.status === 410) {
          this.prikazi('zatvorena');
        } else if (err.status === 404) {
          this.prikazi('nepostoji');
        } else {
          this.zaPonovno = cmd;
          this.prikazi('greska');
        }
      }
    });
  }

  // Forma je dugačka, a ostala stanja kratka: vrati na vrh da se poruka vidi.
  private prikazi(stanje: Stanje): void {
    this.stanje = stanje;
    window.scrollTo(0, 0);
  }

  private napraviKomandu(): PodnesiPrijavuCmd {
    const f = this.forma;
    return {
      ime: imeBezViskaRazmaka(f.ime),
      prezime: imeBezViskaRazmaka(f.prezime),
      indeks: normalizujIndeks(f.indeks),
      godina: f.godina,
      email: f.email.trim(),
      brojTelefona: f.brojTelefona.trim(),
      datumRodjenja: f.datumRodjenja || null,
      opstina: f.opstina.trim() || null
    };
  }

  private praznaForma(): UpisForma {
    return { ime: '', prezime: '', indeks: '', godina: null, email: '', brojTelefona: '', datumRodjenja: '', opstina: '' };
  }
}

import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, Subscription, interval } from 'rxjs';
import { AppRoutes } from 'src/app/app.routes';
import { OnboardingSesijaDetails, PrijavaInfo, StatusPrijave, UpdatePrijavaCmd } from 'src/app/models/model';
import { ErrorHandlerUtil } from 'src/app/shared/utils/error-handler.util';
import { OnboardingService } from '../onboarding.service';

type Filter = 'SVE' | StatusPrijave;

// Radna kopija prijave koja se menja u inline poljima (datum i opština kao string radi ngModel-a).
interface NacrtIzmene {
  ime: string;
  prezime: string;
  indeks: string;
  godina: number | null;
  email: string;
  brojTelefona: string;
  datumRodjenja: string;
  opstina: string;
}

const AUTO_OSVEZAVANJE_MS = 15000;

@Component({
    selector: 'app-onboarding-prijave',
    templateUrl: './onboarding-prijave.component.html',
    styleUrls: ['./onboarding-prijave.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class OnboardingPrijaveComponent implements OnInit, OnDestroy {

  readonly routes = AppRoutes;

  readonly filteri: { vrednost: Filter; naziv: string }[] = [
    { vrednost: 'SVE', naziv: 'Sve' },
    { vrednost: 'NA_CEKANJU', naziv: 'Na čekanju' },
    { vrednost: 'PRIHVACENA', naziv: 'Prihvaćene' },
    { vrednost: 'ODBIJENA', naziv: 'Odbijene' }
  ];

  sesijaId = 0;
  detalji: OnboardingSesijaDetails | null = null;
  poruka: string | null = null;
  neuspehUcitavanja = false;

  filter: Filter = 'SVE';
  prikazane: PrijavaInfo[] = [];
  brojevi = { ukupno: 0, naCekanju: 0, prihvacene: 0, odbijene: 0 };

  ucitava = false;
  zauzet = false;
  izmenaId: number | null = null;
  nacrt: NacrtIzmene = this.prazanNacrt();

  private paramSub?: Subscription;
  private tajmerSub?: Subscription;
  // Menja se kad se promeni sesija u ruti: odgovori starih zahteva se odbacuju.
  private generacija = 0;
  // Raste sa svakom izmenom (prihvati/odbij/...): zakasneli odgovor običnog osvežavanja ne sme da pregazi noviji.
  private verzija = 0;

  constructor(
    private route: ActivatedRoute,
    private onboardingService: OnboardingService) { }

  ngOnInit(): void {
    this.paramSub = this.route.paramMap.subscribe(params => {
      this.generacija++;
      this.sesijaId = Number(params.get('id'));
      this.detalji = null;
      this.poruka = null;
      this.neuspehUcitavanja = false;
      this.filter = 'SVE';
      this.ucitava = false;
      this.zauzet = false;
      this.izmenaId = null;
      this.preracunaj();
      this.osvezi();
    });
    // Automatsko osvežavanje preskače se dok je neki red u izmeni (vidi osvezi).
    this.tajmerSub = interval(AUTO_OSVEZAVANJE_MS).subscribe(() => {
      if (this.izmenaId === null) {
        this.osvezi(true);
      }
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
    this.tajmerSub?.unsubscribe();
  }

  // --- učitavanje ---

  // tiho = automatsko osvežavanje: greške idu samo u konzolu (da alert ne iskače na svakih 15 s).
  osvezi(tiho = false): void {
    if (this.zauzet || this.ucitava) {
      return;
    }
    const g = this.generacija;
    const v = this.verzija;
    this.ucitava = true;
    this.onboardingService.getSesija(this.sesijaId).subscribe({
      next: (detalji) => {
        if (g !== this.generacija) {
          return;
        }
        this.ucitava = false;
        if (v === this.verzija) {
          this.neuspehUcitavanja = false;
          this.primeni(detalji);
        }
      },
      error: (err) => {
        if (g !== this.generacija) {
          return;
        }
        this.ucitava = false;
        if (!this.detalji) {
          this.neuspehUcitavanja = true;
        }
        if (tiho) {
          console.error('Osvežavanje prijava nije uspelo', err);
        } else {
          ErrorHandlerUtil.handleHttpError(err);
        }
      }
    });
  }

  private primeni(detalji: OnboardingSesijaDetails): void {
    this.detalji = detalji;
    // Prijava koju je neko drugi u međuvremenu obradio više se ne može menjati.
    if (this.izmenaId !== null
      && !detalji.prijave.some(p => p.id === this.izmenaId && p.status === 'NA_CEKANJU')) {
      this.izmenaId = null;
    }
    this.preracunaj();
  }

  private preracunaj(): void {
    const prijave = this.detalji?.prijave ?? [];
    this.brojevi = {
      ukupno: prijave.length,
      naCekanju: prijave.filter(p => p.status === 'NA_CEKANJU').length,
      prihvacene: prijave.filter(p => p.status === 'PRIHVACENA').length,
      odbijene: prijave.filter(p => p.status === 'ODBIJENA').length
    };
    this.prikazane = this.filter === 'SVE' ? prijave : prijave.filter(p => p.status === this.filter);
  }

  postaviFilter(filter: Filter): void {
    this.filter = filter;
    this.preracunaj();
  }

  trackById(_: number, p: PrijavaInfo): number {
    return p.id;
  }

  // Zajednički tok za sve izmene na serveru: jedan zahtev u isto vreme, a posle greške (npr. 409 "već obrađena")
  // se lista tiho osveži da prikaže stvarno stanje.
  private izvrsi<T>(zahtev: Observable<T>, uspeh: (odgovor: T) => void): void {
    const g = this.generacija;
    this.zauzet = true;
    this.verzija++;
    zahtev.subscribe({
      next: (odgovor) => {
        if (g !== this.generacija) {
          return;
        }
        this.zauzet = false;
        uspeh(odgovor);
      },
      error: (err) => {
        if (g !== this.generacija) {
          return;
        }
        this.zauzet = false;
        ErrorHandlerUtil.handleHttpError(err);
        this.osvezi(true);
      }
    });
  }

  private primeniOdgovor(detalji: OnboardingSesijaDetails): void {
    this.poruka = detalji.poruka;
    this.primeni(detalji);
  }

  // --- prihvatanje i odbijanje ---

  prihvati(p: PrijavaInfo): void {
    if (this.zauzet) {
      return;
    }
    this.izvrsi(this.onboardingService.prihvati(this.sesijaId, p.id), d => this.primeniOdgovor(d));
  }

  odbij(p: PrijavaInfo): void {
    if (this.zauzet) {
      return;
    }
    const razlog = prompt('Razlog odbijanja (opciono):');
    if (razlog === null) {
      return;
    }
    this.izvrsi(
      this.onboardingService.odbij(this.sesijaId, p.id, { napomena: razlog.trim() || null }),
      d => this.primeniOdgovor(d));
  }

  prihvatiSve(): void {
    const n = this.brojevi.naCekanju;
    if (this.zauzet || this.izmenaId !== null || n === 0) {
      return;
    }
    if (!confirm(`Prihvatiti sve prijave na čekanju (${n})?`)) {
      return;
    }
    this.izvrsi(this.onboardingService.prihvatiSve(this.sesijaId), d => this.primeniOdgovor(d));
  }

  // --- izmena prijave ---

  private prazanNacrt(): NacrtIzmene {
    return { ime: '', prezime: '', indeks: '', godina: null, email: '', brojTelefona: '', datumRodjenja: '', opstina: '' };
  }

  zapocniIzmenu(p: PrijavaInfo): void {
    if (this.zauzet || this.izmenaId !== null) {
      return;
    }
    this.nacrt = {
      ime: p.ime,
      prezime: p.prezime,
      indeks: p.indeks,
      godina: p.godina,
      email: p.email,
      brojTelefona: p.brojTelefona,
      datumRodjenja: p.datumRodjenja ?? '',
      opstina: p.opstina ?? ''
    };
    this.izmenaId = p.id;
  }

  otkaziIzmenu(): void {
    this.izmenaId = null;
  }

  nacrtVazeci(): boolean {
    const n = this.nacrt;
    return !!n.ime.trim() && !!n.prezime.trim() && !!n.indeks.trim() && !!n.email.trim() && !!n.brojTelefona.trim()
      && typeof n.godina === 'number' && Number.isFinite(n.godina);
  }

  sacuvajIzmenu(p: PrijavaInfo): void {
    if (this.zauzet || this.izmenaId !== p.id || !this.nacrtVazeci()) {
      return;
    }
    const n = this.nacrt;
    const cmd: UpdatePrijavaCmd = {
      ime: n.ime.trim(),
      prezime: n.prezime.trim(),
      indeks: n.indeks.trim(),
      godina: n.godina,
      email: n.email.trim(),
      brojTelefona: n.brojTelefona.trim(),
      datumRodjenja: n.datumRodjenja || null,
      opstina: n.opstina.trim() || null
    };
    this.izvrsi(this.onboardingService.updatePrijava(this.sesijaId, p.id, cmd), azurirana => {
      this.izmenaId = null;
      if (this.detalji) {
        this.primeni({
          ...this.detalji,
          prijave: this.detalji.prijave.map(x => x.id === azurirana.id ? azurirana : x)
        });
      }
    });
  }

  // Enter u polju čuva, Escape otkazuje (samo za polja, da Enter na dugmetu ne bi pokrenuo i čuvanje).
  tasterUIzmeni(dogadjaj: Event, p: PrijavaInfo, sacuvaj: boolean): void {
    if ((dogadjaj.target as HTMLElement).tagName !== 'INPUT') {
      return;
    }
    if (sacuvaj) {
      this.sacuvajIzmenu(p);
    } else {
      this.otkaziIzmenu();
    }
  }

  // --- prikaz ---

  statusNaziv(status: StatusPrijave): string {
    switch (status) {
      case 'NA_CEKANJU': return 'Na čekanju';
      case 'PRIHVACENA': return 'Prihvaćena';
      default: return 'Odbijena';
    }
  }

  statusKlasa(status: StatusPrijave): string {
    switch (status) {
      case 'NA_CEKANJU': return 'text-bg-warning';
      case 'PRIHVACENA': return 'text-bg-success';
      default: return 'text-bg-danger';
    }
  }
}

import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toCanvas } from 'qrcode';
import { Subscription } from 'rxjs';
import { AppRoutes } from 'src/app/app.routes';
import { OnboardingSesijaInfo } from 'src/app/models/model';
import { ErrorHandlerUtil } from 'src/app/shared/utils/error-handler.util';
import { OnboardingService } from '../onboarding.service';
import { upisLink } from '../upis-link';

@Component({
  selector: 'app-onboarding-qr',
  templateUrl: './onboarding-qr.component.html',
  styleUrls: ['./onboarding-qr.component.css']
})
export class OnboardingQrComponent implements OnInit, OnDestroy {

  readonly routes = AppRoutes;

  // Canvas je uvek u DOM-u (bez *ngIf), pa je dostupan odmah, a crta se kad stigne sesija.
  @ViewChild('qr', { static: true }) qr!: ElementRef<HTMLCanvasElement>;
  @ViewChild('linkTekst') linkTekst?: ElementRef<HTMLElement>;

  sesijaId = 0;
  sesija: OnboardingSesijaInfo | null = null;
  link = '';
  greska: string | null = null;
  kopirano: 'ne' | 'da' | 'selektovano' = 'ne';

  private paramSub?: Subscription;
  private kopiranoTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private route: ActivatedRoute,
    private onboardingService: OnboardingService) { }

  ngOnInit(): void {
    this.paramSub = this.route.paramMap.subscribe(params => {
      this.sesijaId = Number(params.get('id'));
      this.sesija = null;
      this.link = '';
      this.greska = null;
      this.kopirano = 'ne';
      this.ucitaj();
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
    clearTimeout(this.kopiranoTimer);
  }

  private ucitaj(): void {
    const id = this.sesijaId;
    this.onboardingService.getSesija(id).subscribe({
      next: (detalji) => {
        if (id !== this.sesijaId) {
          return;
        }
        this.sesija = detalji.sesija;
        this.link = upisLink(detalji.sesija.token);
        this.nacrtaj();
      },
      error: (err) => {
        if (id !== this.sesijaId) {
          return;
        }
        this.greska = 'Sesija nije mogla da se učita.';
        ErrorHandlerUtil.handleHttpError(err);
      }
    });
  }

  private nacrtaj(): void {
    const sirina = Math.max(320, Math.min(window.innerWidth - 48, 640));
    toCanvas(this.qr.nativeElement, this.link, { width: sirina, margin: 2, errorCorrectionLevel: 'M' })
      .catch(() => this.greska = 'QR kod nije mogao da se nacrta.');
  }

  kopiraj(): void {
    if (!this.link) {
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(this.link).then(
        () => this.postaviKopirano('da'),
        () => this.selektuj());
    } else {
      // Nema clipboard API-ja (npr. nezaštićen http preko tailneta): selektuj tekst, korisnik pritiska Ctrl+C.
      this.selektuj();
    }
  }

  private selektuj(): void {
    const el = this.linkTekst?.nativeElement;
    const selekcija = window.getSelection();
    if (!el || !selekcija) {
      return;
    }
    const opseg = document.createRange();
    opseg.selectNodeContents(el);
    selekcija.removeAllRanges();
    selekcija.addRange(opseg);
    this.postaviKopirano('selektovano');
  }

  private postaviKopirano(stanje: 'da' | 'selektovano'): void {
    this.kopirano = stanje;
    clearTimeout(this.kopiranoTimer);
    this.kopiranoTimer = setTimeout(() => this.kopirano = 'ne', 2000);
  }
}

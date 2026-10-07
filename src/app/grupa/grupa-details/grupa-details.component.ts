import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { NgForm, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AppRoutes } from 'src/app/app.routes';
import { CreateOnboardingCmd, CreateStudentCmd, GrupaDetails, OnboardingSesijaInfo } from 'src/app/models/model';
import { OnboardingService } from 'src/app/onboarding/onboarding.service';
import { ErrorHandlerUtil } from 'src/app/shared/utils/error-handler.util';
import { GrupaService } from '../grupa.service';
import { NgClass, DatePipe } from '@angular/common';

interface NovStudent {
  ime: string;
  prezime: string;
  indeks: string;
  godina: number;
  brojTelefona: string;
  email: string;
}

@Component({
    selector: 'app-grupa-details',
    templateUrl: './grupa-details.component.html',
    styleUrls: ['./grupa-details.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [RouterLink, FormsModule, NgClass, DatePipe]
})
export class GrupaDetailsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private grupaService = inject(GrupaService);
  private onboardingService = inject(OnboardingService);


  readonly routes = AppRoutes;

  grupaId = 0;
  grupa: GrupaDetails | null = null;
  sesije: OnboardingSesijaInfo[] = [];
  sesijeUcitane = false;

  student: NovStudent = this.prazanStudent(new Date().getFullYear());
  cuvaStudenta = false;

  rokUDanima = 7;
  maxPrijava = 200;
  napomena = '';
  pokrece = false;
  menjaSesijuId: number | null = null;

  private paramSub?: Subscription;

  ngOnInit(): void {
    this.paramSub = this.route.paramMap.subscribe(params => {
      this.grupaId = Number(params.get('id'));
      this.grupa = null;
      this.sesije = [];
      this.sesijeUcitane = false;
      this.ucitajGrupu(true);
      this.ucitajSesije();
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
  }

  // --- grupa i studenti ---

  private prazanStudent(godina: number): NovStudent {
    return { ime: '', prezime: '', indeks: '', godina, brojTelefona: '', email: '' };
  }

  ucitajGrupu(prviPut = false): void {
    const id = this.grupaId;
    this.grupaService.getGrupa(id).subscribe({
      next: (grupa) => {
        if (id !== this.grupaId) {
          return;
        }
        this.grupa = grupa;
        if (prviPut) {
          this.student = this.prazanStudent(grupa.godinaUpisa);
        }
      },
      error: (err) => ErrorHandlerUtil.handleHttpError(err)
    });
  }

  otvoriStudenta(id: number): void {
    this.router.navigate([AppRoutes.studentDetails(id)]);
  }

  dodajStudenta(forma: NgForm): void {
    if (this.cuvaStudenta || forma.invalid || !this.grupa) {
      return;
    }
    const s = this.student;
    const cmd: CreateStudentCmd = {
      grupaId: this.grupaId,
      ime: s.ime.trim(),
      prezime: s.prezime.trim(),
      godina: s.godina,
      indeks: s.indeks.trim(),
      brojTelefona: s.brojTelefona.trim() || null,
      email: s.email.trim() || null,
      datumRodjenja: null,
      opstina: null
    };
    if (!cmd.ime || !cmd.prezime || !cmd.indeks) {
      return;
    }
    this.cuvaStudenta = true;
    this.grupaService.createStudent(cmd).subscribe({
      next: () => {
        this.cuvaStudenta = false;
        this.student = this.prazanStudent(this.grupa?.godinaUpisa ?? s.godina);
        forma.resetForm({ ...this.student });
        this.ucitajGrupu();
      },
      error: (err) => {
        this.cuvaStudenta = false;
        ErrorHandlerUtil.handleHttpError(err);
      }
    });
  }

  // --- onboarding ---

  ucitajSesije(): void {
    const id = this.grupaId;
    this.onboardingService.listSesije(id).subscribe({
      next: (sesije) => {
        if (id !== this.grupaId) {
          return;
        }
        // Najnovija prva.
        this.sesije = [...sesije].sort((a, b) =>
          (new Date(b.kreirano).getTime() - new Date(a.kreirano).getTime()) || (b.id - a.id));
        this.sesijeUcitane = true;
      },
      error: (err) => ErrorHandlerUtil.handleHttpError(err)
    });
  }

  pokreniOnboarding(forma: NgForm): void {
    if (this.pokrece || forma.invalid) {
      return;
    }
    const cmd: CreateOnboardingCmd = {
      isticeZaDana: this.rokUDanima,
      maxPrijava: this.maxPrijava,
      napomena: this.napomena.trim() || null
    };
    this.pokrece = true;
    this.onboardingService.createSesija(this.grupaId, cmd).subscribe({
      next: (nova) => {
        this.pokrece = false;
        this.router.navigate([AppRoutes.onboardingQr(nova.id)]);
      },
      error: (err) => {
        this.pokrece = false;
        ErrorHandlerUtil.handleHttpError(err);
      }
    });
  }

  istekla(s: OnboardingSesijaInfo): boolean {
    return new Date(s.istice).getTime() < Date.now();
  }

  status(s: OnboardingSesijaInfo): string {
    if (s.otvorena) {
      return 'Otvorena';
    }
    if (!s.aktivna) {
      return 'Zatvorena';
    }
    return this.istekla(s) ? 'Istekla' : 'Popunjena';
  }

  statusKlasa(s: OnboardingSesijaInfo): string {
    switch (this.status(s)) {
      case 'Otvorena': return 'text-bg-success';
      case 'Zatvorena': return 'text-bg-secondary';
      case 'Istekla': return 'text-bg-warning';
      default: return 'text-bg-info';
    }
  }

  // "Zatvori" ima smisla samo dok je sesija aktivna i rok nije prošao (otvorena ili popunjena);
  // zatvorena i istekla sesija se ponovo otvara ("Otvori"; istekla dobija nov rok na serveru).
  moguceZatvoriti(s: OnboardingSesijaInfo): boolean {
    return s.aktivna && !this.istekla(s);
  }

  promeniAktivnost(s: OnboardingSesijaInfo, aktivna: boolean): void {
    if (this.menjaSesijuId !== null) {
      return;
    }
    this.menjaSesijuId = s.id;
    this.onboardingService.setAktivna(s.id, { aktivna }).subscribe({
      next: () => {
        this.menjaSesijuId = null;
        this.ucitajSesije();
      },
      error: (err) => {
        this.menjaSesijuId = null;
        ErrorHandlerUtil.handleHttpError(err);
      }
    });
  }

  otvoriQr(id: number): void {
    this.router.navigate([AppRoutes.onboardingQr(id)]);
  }

  otvoriPrijave(id: number): void {
    this.router.navigate([AppRoutes.onboardingPrijave(id)]);
  }
}

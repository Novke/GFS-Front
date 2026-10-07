import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppRoutes } from 'src/app/features/privremeno/app-putanje';
import { CreateTestCmd, GrupaInfo, PredmetInfo, TipTestaInfo } from 'src/app/models/model';
import { PredavanjeService } from 'src/app/predavanje/predavanje.service';
import { ErrorHandlerUtil } from 'src/app/shared/utils/error-handler.util';
import { TestService } from '../test.service';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';

@Component({
    selector: 'app-nov-test',
    templateUrl: './nov-test.component.html',
    styleUrls: ['./nov-test.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, NgClass]
})
export class NovTestComponent implements OnInit {
  private predavanjeService = inject(PredavanjeService);
  private router = inject(Router);
  private testService = inject(TestService);


  grupe: GrupaInfo[] = [];
  predmeti: PredmetInfo[] = [];
  tipoviTesta: TipTestaInfo[] = [];
  izabranaGrupa: number = 0;
  izabranPredmet: number = 0;
  izabranTipTesta: number = 0;
  novTipTestaNaziv: string | null = null;
  kreirajNoviTip: Boolean = false;
  datum: Date | null = null;
  brojGrupa: number = 1;
  maxPoena: number = 0;

  ngOnInit(): void {
    this.loadGroupsAndSubjects();
  }

  // Fetch groups and subjects from the service
  loadGroupsAndSubjects(): void {
    // Fetch groups
    this.predavanjeService.getGrupe().subscribe(
      (groups) => {
        this.grupe = groups;
      },
      (error) => {
        console.error('Error fetching groups', error);
      }
    );

    // Fetch subjects
    this.predavanjeService.getPredmeti().subscribe(
      (subjects) => {
        this.predmeti = subjects;
      },
      (error) => {
        console.error('Error fetching subjects', error);
      }
    );
  }

  fetchTipove() {
    if (this.izabranPredmet) {
      this.testService.findTipoveTestovaPredmeta(this.izabranPredmet).subscribe(
        result => {
          this.tipoviTesta = result
        },
        error => {
          console.log("Neuspesno nabavljanje tipova testova!", error)
        }
      )
    }
  }

  novTip() {
    this.kreirajNoviTip = true;
    this.izabranTipTesta = 0;
  }

  postojeciTip() {
    this.kreirajNoviTip = false;
    this.novTipTestaNaziv = null;
  }

  setBrojGrupa(broj: number) {
    this.brojGrupa = broj
  }

  createTest(): void {
    if (this.izabranaGrupa && this.izabranPredmet && this.datum) {

      const cmd: CreateTestCmd = {
        grupaId: this.izabranaGrupa,
        predmetId: this.izabranPredmet,
        tipTestaId: this.izabranTipTesta,
        novTipTesta: this.novTipTestaNaziv,
        brojGrupa: this.brojGrupa,
        datum: this.datum,
        maxPoena: this.maxPoena
      }

      this.testService.createTest(cmd).subscribe(
        test => {
          this.router.navigateByUrl(AppRoutes.testEvidentiranje(test.id))
        },
        error => ErrorHandlerUtil.handleHttpError(error)
      )


    }
  }


}

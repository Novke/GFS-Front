import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { AktivnostInfo, PredavanjeDetails, StudentInfo, tipAktivnosti } from 'src/app/models/model';
import { PredavanjeService } from '../predavanje.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AppRoutes } from 'src/app/features/privremeno/app-putanje';
import { FormsModule } from '@angular/forms';
import { MatCard, MatCardContent, MatCardTitle, MatCardSubtitle } from '@angular/material/card';

@Component({
    selector: 'app-pregled-predavanja',
    templateUrl: './pregled-predavanja.component.html',
    styleUrls: ['./pregled-predavanja.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, MatCard, MatCardContent, MatCardTitle, MatCardSubtitle]
})
export class PregledPredavanjaComponent implements OnInit {
  private predavanjeService = inject(PredavanjeService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);


  id: number | null = null;
  predavanje: PredavanjeDetails | undefined;

  ngOnInit(): void {
    this.route.paramMap.subscribe(
      params => {
        const id = params.get('id')
        this.id = id !== null ? Number(id) : null

        if (this.id) this.ucitajPredavanje()
      }
    )
  }

  private ucitajPredavanje() {
    this.predavanjeService.getPredavanjeDetails(Number(this.id)).subscribe(
      result => this.popuniPolja(result)
    )
  }

  private popuniPolja(result: PredavanjeDetails) {
    this.predavanje = result
  }

  navigateLive() {
    if (this.id) this.router.navigateByUrl(AppRoutes.predavanjeLive(Number(this.id)))
  }

  posecenost2string() {
    const prisutnih = this.predavanje?.posecenost ? this.predavanje.posecenost : 0
    const aktivnih = this.izbrojAktivne()
    const zvezdice = this.izbrojZvezdice()

    return `Prisutnih: ${prisutnih}, aktivnih: ${aktivnih}, zvezdice: ${zvezdice}`
  }

  izbrojAktivne(): number {
    return this.predavanje ?
      this.predavanje?.aktivnosti.filter(
        a => a.tip === tipAktivnosti.ZADATAK || a.tip === tipAktivnosti.SA_ZVEZDICOM
      ).length :
      0
  }
  izbrojZvezdice(): number {
    return this.predavanje ?
      this.predavanje?.aktivnosti.filter(
        a => a.tip === tipAktivnosti.SA_ZVEZDICOM
      ).length :
      0
  }

  student2string(student: StudentInfo){
    return student.ime + " " + student.prezime + " " + student.indeks
  }

  napomene2string(aktivnost: AktivnostInfo){
    return aktivnost.napomene ? aktivnost.napomene : "."
  }

  navigateStudentPredmet(studentId: number) {
    if (this.predavanje) {
      this.router.navigateByUrl(AppRoutes.studentPredmet(studentId, this.predavanje.predmet.id))
    }
  }
}

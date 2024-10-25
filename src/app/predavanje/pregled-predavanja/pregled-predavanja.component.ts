import { Component, OnInit } from '@angular/core';
import { AktivnostInfo, PredavanjeDetails, StudentInfo, tipAktivnosti } from 'src/app/models/model';
import { PredavanjeService } from '../predavanje.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AppRoutes } from 'src/app/app.routes';

@Component({
  selector: 'app-pregled-predavanja',
  templateUrl: './pregled-predavanja.component.html',
  styleUrls: ['./pregled-predavanja.component.css']
})
export class PregledPredavanjaComponent implements OnInit {

  id: number | null = null;
  predavanje: PredavanjeDetails | undefined;

  constructor(
    private predavanjeService: PredavanjeService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

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
    if (this.id) this.router.navigate([AppRoutes.predavanjeLive(Number(this.id))])
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

}

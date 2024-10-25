import { Component, OnInit } from '@angular/core';
import { PredavanjeService } from '../predavanje.service';
import { ActivatedRoute, Router } from '@angular/router';
import { GrupaInfo, PredavanjeInfo, PredmetInfo } from 'src/app/models/model';
import { AppRoutes } from 'src/app/app.routes';

@Component({
  selector: 'app-predavanje-list',
  templateUrl: './predavanje-list.component.html',
  styleUrls: ['./predavanje-list.component.css']
})
export class PredavanjeListComponent implements OnInit {

  grupaId: number | null = null;
  predmetId: number | null = null;
  predavanja: PredavanjeInfo[] = [];

  grupa: GrupaInfo | null = null;
  predmet: PredmetInfo | null = null;

  constructor(
    private predavanjaService: PredavanjeService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit(): void {

    this.route.paramMap.subscribe(
      params => {
        const gId = params.get('grupaId')
        const pId = params.get('predmetId')
        this.grupaId = gId !== null ? Number(gId) : null
        this.predmetId = pId !== null ? Number(pId) : null
        this.ucitajGrupu()
        this.ucitajPredmet()
        this.ucitajPredavanja()
      }
    )
  }

  private ucitajPredmet() {
    if (this.predmetId) {
      this.predavanjaService.getPredmet(this.predmetId).subscribe(
        result => this.predmet = result
      )
    }
  }

  private ucitajGrupu() {
    if (this.grupaId) {
      this.predavanjaService.getGrupaDetails(this.grupaId).subscribe(
        result => this.grupa = result
      )
    }
  }

  private ucitajPredavanja() {
    if (this.grupaId && this.predmetId) {
      this.predavanjaService.vratiPredavanjaGrupaPredmet(Number(this.grupaId), Number(this.predmetId)).subscribe(
        result => this.predavanja = result
      )
    }
  }

  go2predavanje(predavanje: PredavanjeInfo) {
    if (predavanje.zavrseno) {
      this.router.navigate([AppRoutes.predavanjePregled(predavanje.id)])
    } else {
      this.router.navigate([AppRoutes.predavanjeLive(predavanje.id)])
    }
  }
}

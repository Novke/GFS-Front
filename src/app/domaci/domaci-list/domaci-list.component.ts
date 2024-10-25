import { Component, OnInit } from '@angular/core';
import { DomaciInfo, GrupaInfo, PredmetInfo } from 'src/app/models/model';
import { DomaciService } from '../domaci.service';
import { ActivatedRoute, Router } from '@angular/router';
import { PredavanjeService } from 'src/app/predavanje/predavanje.service';
import { AppRoutes } from 'src/app/app.routes';

@Component({
  selector: 'app-domaci-list',
  templateUrl: './domaci-list.component.html',
  styleUrls: ['./domaci-list.component.css']
})
export class DomaciListComponent implements OnInit{

  grupaId: number | null = null;
  predmetId: number | null = null;
  domaci: DomaciInfo[] = [];

  grupa: GrupaInfo | null = null;
  predmet: PredmetInfo | null = null;
  
  constructor(
    private domaciService: DomaciService,
    private predavanjaService: PredavanjeService,
    private route: ActivatedRoute,
    private router: Router
  ){

  }
  ngOnInit(): void {

    this.route.paramMap.subscribe(
      params => {
        const gId = params.get('grupaId')
        const pId = params.get('predmetId')
        this.grupaId = gId !== null ? Number(gId) : null
        this.predmetId = pId !== null ? Number(pId) : null
        this.ucitajGrupu()
        this.ucitajPredmet()
        this.ucitajDomace()
      }
    )
  }

  private ucitajPredmet(){
    if (this.predmetId){
      this.predavanjaService.getPredmet(this.predmetId).subscribe(
        result => this.predmet = result
      )
    }
  }

  private ucitajGrupu(){
    if (this.grupaId){
      this.predavanjaService.getGrupaDetails(this.grupaId).subscribe(
        result => this.grupa = result
      )
    }
  }

  private ucitajDomace(){
    if (this.grupaId && this.predmetId) {
      this.domaciService.vratiDomaceIzGrupe(Number(this.grupaId), Number(this.predmetId)).subscribe(
        result => {
          this.domaci = result
        }
      )
    }
  }

  go2domaci(domaci: DomaciInfo){
    if (domaci.pregledan){
      this.router.navigate([AppRoutes.domaciPregled(domaci.id)])
    } else {
      this.router.navigate([AppRoutes.domaciEvidentiranje(domaci.id)])
    }
  }

}

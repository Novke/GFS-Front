import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { DomaciInfo, GrupaInfo, PredmetInfo } from 'src/app/models/model';
import { DomaciService } from '../domaci.service';
import { ActivatedRoute, Router } from '@angular/router';
import { PredavanjeService } from 'src/app/predavanje/predavanje.service';
import { AppRoutes } from 'src/app/features/privremeno/app-putanje';
import { MatListSubheaderCssMatStyler, MatList, MatDivider, MatListItem, MatListItemTitle, MatListItemLine } from '@angular/material/list';
import { NgClass, DatePipe } from '@angular/common';

@Component({
    selector: 'app-domaci-list',
    templateUrl: './domaci-list.component.html',
    styleUrls: ['./domaci-list.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatListSubheaderCssMatStyler, MatList, MatDivider, MatListItem, NgClass, MatListItemTitle, MatListItemLine, DatePipe]
})
export class DomaciListComponent implements OnInit{
  private domaciService = inject(DomaciService);
  private predavanjaService = inject(PredavanjeService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);


  grupaId: number | null = null;
  predmetId: number | null = null;
  domaci: DomaciInfo[] = [];

  grupa: GrupaInfo | null = null;
  predmet: PredmetInfo | null = null;
  ngOnInit(): void {

    // PRIVREMENO (nove rute): grupa i predmet su query parametri (?grupa=&predmet=), vidi features/privremeno.
    this.route.queryParamMap.subscribe(
      params => {
        const gId = params.get('grupa')
        const pId = params.get('predmet')
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
      this.domaciService.vratiDomaceGrupaPredmet(Number(this.grupaId), Number(this.predmetId)).subscribe(
        result => {
          this.domaci = result
        }
      )
    }
  }

  go2domaci(domaci: DomaciInfo){
    if (domaci.pregledan){
      this.router.navigateByUrl(AppRoutes.domaciPregled(domaci.id))
    } else {
      this.router.navigateByUrl(AppRoutes.domaciEvidentiranje(domaci.id))
    }
  }

}

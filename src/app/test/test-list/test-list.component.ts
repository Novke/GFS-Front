import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GrupaInfo, PredmetInfo, TestInfo } from 'src/app/models/model';
import { PredavanjeService } from 'src/app/predavanje/predavanje.service';
import { TestService } from '../test.service';
import { AppRoutes } from 'src/app/app.routes';
import { MatListSubheaderCssMatStyler, MatList, MatDivider, MatListItem, MatListItemTitle, MatListItemLine } from '@angular/material/list';
import { NgClass, DatePipe } from '@angular/common';

@Component({
    selector: 'app-test-list',
    templateUrl: './test-list.component.html',
    styleUrls: ['./test-list.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatListSubheaderCssMatStyler, MatList, MatDivider, MatListItem, NgClass, MatListItemTitle, MatListItemLine, DatePipe]
})
export class TestListComponent implements OnInit{
  private predavanjaService = inject(PredavanjeService);
  private testService = inject(TestService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);


  grupaId: number | null = null;
  predmetId: number | null = null;
  testovi: TestInfo[] = [];

  grupa: GrupaInfo | null = null;
  predmet: PredmetInfo | null = null;

  ngOnInit(): void{

    this.route.paramMap.subscribe(
      params => {
        const gId = params.get('grupaId')
        const pId = params.get('predmetId')
        this.grupaId = gId !== null ? Number(gId) : null
        this.predmetId = pId !== null ? Number(pId) : null
        this.ucitajGrupu()
        this.ucitajPredmet()
        this.ucitajTestove()
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

  private ucitajTestove(){
    if (this.grupaId && this.predmetId){
      this.testService.vratiTestoveGrupaPredmet(Number(this.grupaId), Number(this.predmetId)).subscribe(
        result => {
          this.testovi = result
          console.log("Testovi:", result)
        }
      )
    }
  }

  go2test(test: TestInfo){
    if (test.pregledan){
      this.router.navigate([AppRoutes.testPregled(test.id)])
    } else {
      this.router.navigate([AppRoutes.testEvidentiranje(test.id)])
    }
  }

}

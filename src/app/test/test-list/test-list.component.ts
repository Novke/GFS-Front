import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GrupaInfo, PredmetInfo, TestInfo } from 'src/app/models/model';
import { PredavanjeService } from 'src/app/predavanje/predavanje.service';
import { TestService } from '../test.service';
import { AppRoutes } from 'src/app/app.routes';

@Component({
  selector: 'app-test-list',
  templateUrl: './test-list.component.html',
  styleUrls: ['./test-list.component.css']
})
export class TestListComponent implements OnInit{

  grupaId: number | null = null;
  predmetId: number | null = null;
  testovi: TestInfo[] = [];

  grupa: GrupaInfo | null = null;
  predmet: PredmetInfo | null = null;

  constructor(
    private predavanjaService: PredavanjeService,
    private testService: TestService,
    private route: ActivatedRoute,
    private router: Router
  ){}

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

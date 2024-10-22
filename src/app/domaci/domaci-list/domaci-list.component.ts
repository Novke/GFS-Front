import { Component, OnInit } from '@angular/core';
import { DomaciInfo } from 'src/app/models/model';
import { DomaciService } from '../domaci.service';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-domaci-list',
  templateUrl: './domaci-list.component.html',
  styleUrls: ['./domaci-list.component.css']
})
export class DomaciListComponent implements OnInit{

  grupaId: number | null = null;
  predmetId: number | null = null;
  domaci: DomaciInfo[] = []
  
  constructor(
    private domaciService: DomaciService,
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
        this.ucitajDomace()
      }
    )
  }

  private ucitajDomace(){
    if (this.grupaId) {
      this.domaciService.vratiDomaceIzGrupe(Number(this.grupaId), Number(this.predmetId)).subscribe(
        result => {
          this.domaci = result
          console.log(this.domaci)
        }
      )
    }
  }

}

import { Component, OnInit } from '@angular/core';
import { DodajDomaciCmd, GrupaInfo, PredavanjeInfo, PredmetInfo } from 'src/app/models/model';
import { DomaciService } from '../domaci.service';
import { PredavanjeService } from 'src/app/predavanje/predavanje.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-nov-domaci',
  templateUrl: './nov-domaci.component.html',
  styleUrls: ['./nov-domaci.component.css']
})
export class NovDomaciComponent implements OnInit{

  grupe : GrupaInfo[] = []
  predmeti: PredmetInfo[] = []
  predavanja: PredavanjeInfo[] = []
  izabranaGrupa : number = 0
  izabranPredmet : number = 0
  izabranoPredavanje : number | undefined

  constructor(
    private domaciService: DomaciService,
    private predavanjaService: PredavanjeService,
    private router: Router){
  }

  ngOnInit(): void {
    this.predavanjaService.getGrupe().subscribe(
      result => this.grupe = result
    )
    this.predavanjaService.getPredmeti().subscribe(
      result => this.predmeti = result
    )
  }

  dodajDomaci(){
    const cmd : DodajDomaciCmd = {
      grupaId: this.izabranaGrupa,
      predmetId: this.izabranPredmet,
      predavanjeId: this.izabranoPredavanje
    }

    this.domaciService.dodajDomaci(cmd).subscribe(
      result => this.router.navigate([`/domaci/${result.id}/evidentiranje`])
    )
  }

  autoPretrazivanjePredavanja(){
    if (!this.izabranaGrupa || !this.izabranPredmet) return

    this.predavanjaService.searchPredavanja(this.izabranPredmet, this.izabranaGrupa).subscribe(
      result => this.predavanja = result
    )

  }

}

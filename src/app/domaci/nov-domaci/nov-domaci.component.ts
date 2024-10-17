import { Component } from '@angular/core';
import { GrupaInfo, PredavanjeInfo, PredmetInfo } from 'src/app/models/domaci.model';
import { DomaciService } from '../domaci.service';

@Component({
  selector: 'app-nov-domaci',
  templateUrl: './nov-domaci.component.html',
  styleUrls: ['./nov-domaci.component.css']
})
export class NovDomaciComponent {

  grupe : GrupaInfo[] = []
  predmeti: PredmetInfo[] = []
  predavanja: PredavanjeInfo[] = []
  izabranaGrupa : number = 0
  izabranPredmet : number = 0
  izabranoPredavanje : number = 0

  constructor(private domaciService: DomaciService){
  }

  dodajDomaci(){
  }

}
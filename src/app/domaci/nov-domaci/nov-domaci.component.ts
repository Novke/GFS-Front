import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { DodajDomaciCmd, GrupaInfo, PredavanjeInfo, PredmetInfo } from 'src/app/models/model';
import { DomaciService } from '../domaci.service';
import { PredavanjeService } from 'src/app/predavanje/predavanje.service';
import { Router } from '@angular/router';
import { AppRoutes } from 'src/app/app.routes';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';

@Component({
    selector: 'app-nov-domaci',
    templateUrl: './nov-domaci.component.html',
    styleUrls: ['./nov-domaci.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, DatePipe]
})
export class NovDomaciComponent implements OnInit{
  private domaciService = inject(DomaciService);
  private predavanjaService = inject(PredavanjeService);
  private router = inject(Router);


  grupe : GrupaInfo[] = []
  predmeti: PredmetInfo[] = []
  predavanja: PredavanjeInfo[] = []
  izabranaGrupa : number = 0
  izabranPredmet : number = 0
  izabranoPredavanje : number | undefined

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
      result => this.router.navigate([AppRoutes.domaciEvidentiranje(result.id)])
    )
  }

  autoPretrazivanjePredavanja(){
    if (!this.izabranaGrupa || !this.izabranPredmet) return

    this.predavanjaService.searchPredavanja(this.izabranPredmet, this.izabranaGrupa).subscribe(
      result => this.predavanja = result
    )

  }

}

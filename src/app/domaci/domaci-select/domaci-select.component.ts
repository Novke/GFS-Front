import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { GrupaInfo, PredmetInfo } from 'src/app/models/model';
import { PredavanjeService } from 'src/app/predavanje/predavanje.service';

@Component({
  selector: 'app-domaci-select',
  templateUrl: './domaci-select.component.html',
  styleUrls: ['./domaci-select.component.css']
})
export class DomaciSelectComponent {
  grupe: GrupaInfo[] = [];
  predmeti: PredmetInfo[] = [];
  izabranaGrupa : number = 0;
  izabranPredmet : number= 0;


  constructor(private predavanjeService: PredavanjeService, private router: Router) {}

  ngOnInit(): void {
    this.loadGroupsAndSubjects();
  }

  loadGroupsAndSubjects(): void {
    this.predavanjeService.getGrupe().subscribe(
      (groups) => {
        this.grupe = groups;
      },
      (error) => {
        console.error('Error fetching groups', error);
      }
    );

    this.predavanjeService.getPredmeti().subscribe(
      (subjects) => {
        this.predmeti = subjects;
      },
      (error) => {
        console.error('Error fetching subjects', error);
      }
    );
  }

  go(): void {
    if (this.izabranaGrupa && this.izabranPredmet) {
      this.router.navigate(['domaci', 'grupa', this.izabranaGrupa, 'predmet', this.izabranPredmet])
    } 
  }

}

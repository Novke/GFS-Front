import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AppRoutes } from 'src/app/app.routes';
import { PredavanjeService } from '../predavanje.service';

@Component({
  selector: 'app-predavanje-select',
  templateUrl: './predavanje-select.component.html',
  styleUrls: ['./predavanje-select.component.css']
})
export class PredavanjeSelectComponent {
  izabranaGrupa: number = 0;
  izabranPredmet: number = 0;

  constructor(predavanjeService: PredavanjeService, private router: Router) {
  }

  
  onSubmit(): void {
    if (this.izabranaGrupa && this.izabranPredmet) {
      this.router.navigate([AppRoutes.predavanjeGrupaPredmet(this.izabranaGrupa, this.izabranPredmet)]);
    }
  }

  onNew(): void {
    this.router.navigate([AppRoutes.predavanjeStart]);
  }

}

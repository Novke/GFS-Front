import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AppRoutes } from 'src/app/app.routes';
import { PredavanjeService } from 'src/app/predavanje/predavanje.service';

@Component({
  selector: 'app-domaci-select',
  templateUrl: './domaci-select.component.html',
  styleUrls: ['./domaci-select.component.css']
})
export class DomaciSelectComponent {
  izabranaGrupa: number = 0;
  izabranPredmet: number = 0;

  constructor(private predavanjeService: PredavanjeService, private router: Router) {}

  onSubmit(): void {
    if (this.izabranaGrupa && this.izabranPredmet) {
      this.router.navigate([AppRoutes.domaciGrupaPredmet(this.izabranaGrupa, this.izabranPredmet)]);
    }
  }

  onNew(): void {
    this.router.navigate([AppRoutes.domaciNew]);
  }
}

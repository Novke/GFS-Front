import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SelectBaseComponent } from 'src/app/components/select-base.component';
import { AppRoutes } from 'src/app/app.routes';
import { PredavanjeService } from 'src/app/predavanje/predavanje.service';

@Component({
  selector: 'app-domaci-select',
  templateUrl: './domaci-select.component.html',
  styleUrls: ['./domaci-select.component.css']
})
export class DomaciSelectComponent extends SelectBaseComponent {
  constructor(predavanjeService: PredavanjeService, private router: Router) {
    super(predavanjeService);
  }

  override onSubmit(): void {
    if (this.izabranaGrupa && this.izabranPredmet) {
      this.router.navigate([AppRoutes.domaciGrupaPredmet(this.izabranaGrupa, this.izabranPredmet)]);
    }
  }

  override onNew(): void {
    this.router.navigate([AppRoutes.domaciNew]);
  }
}

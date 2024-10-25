import { Component } from '@angular/core';
import { SelectBaseComponent } from 'src/app/components/select-base.component';
import { PredavanjeService } from '../predavanje.service';
import { Router } from '@angular/router';
import { AppRoutes } from 'src/app/app.routes';

@Component({
  selector: 'app-predavanje-select',
  templateUrl: './predavanje-select.component.html',
  styleUrls: ['./predavanje-select.component.css']
})
export class PredavanjeSelectComponent extends SelectBaseComponent{

  constructor(predavanjeService: PredavanjeService, private router: Router) {
    super(predavanjeService);
  }

  
  override onSubmit(): void {
    if (this.izabranaGrupa && this.izabranPredmet) {
      this.router.navigate([AppRoutes.predavanjeGrupaPredmet(this.izabranaGrupa, this.izabranPredmet)]);
    }
  }

  override onNew(): void {
    this.router.navigate([AppRoutes.predavanjeStart]);
  }

}

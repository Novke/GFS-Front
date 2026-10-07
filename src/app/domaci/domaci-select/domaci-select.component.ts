import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppRoutes } from 'src/app/app.routes';
import { PredavanjeService } from 'src/app/predavanje/predavanje.service';
import { SelectBaseComponent } from '../../components/select-base.component';

@Component({
    selector: 'app-domaci-select',
    templateUrl: './domaci-select.component.html',
    styleUrls: ['./domaci-select.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SelectBaseComponent]
})
export class DomaciSelectComponent {
  private predavanjeService = inject(PredavanjeService);
  private router = inject(Router);

  izabranaGrupa: number = 0;
  izabranPredmet: number = 0;

  onSubmit(): void {
    if (this.izabranaGrupa && this.izabranPredmet) {
      this.router.navigate([AppRoutes.domaciGrupaPredmet(this.izabranaGrupa, this.izabranPredmet)]);
    }
  }

  onNew(): void {
    this.router.navigate([AppRoutes.domaciNew]);
  }
}

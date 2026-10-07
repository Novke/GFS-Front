import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppRoutes } from 'src/app/features/privremeno/app-putanje';
import { PredavanjeService } from '../predavanje.service';
import { SelectBaseComponent } from '../../components/select-base.component';

@Component({
    selector: 'app-predavanje-select',
    templateUrl: './predavanje-select.component.html',
    styleUrls: ['./predavanje-select.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SelectBaseComponent]
})
export class PredavanjeSelectComponent {
  private router = inject(Router);

  izabranaGrupa: number = 0;
  izabranPredmet: number = 0;

  
  onSubmit(): void {
    if (this.izabranaGrupa && this.izabranPredmet) {
      this.router.navigateByUrl(AppRoutes.predavanjeGrupaPredmet(this.izabranaGrupa, this.izabranPredmet));
    }
  }

  onNew(): void {
    this.router.navigateByUrl(AppRoutes.predavanjeStart);
  }

}

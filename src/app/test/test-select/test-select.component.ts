import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppRoutes } from '../../app.routes';
import { SelectBaseComponent } from '../../components/select-base.component';

@Component({
    selector: 'app-test-select',
    templateUrl: './test-select.component.html',
    styleUrls: ['./test-select.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SelectBaseComponent]
})
export class TestSelectComponent {
  private router = inject(Router);

  izabranaGrupa: number = 0;
  izabranPredmet: number = 0;

  onSubmit(){
    if (this.izabranaGrupa && this.izabranPredmet) {
      this.router.navigate([AppRoutes.testGrupaPredmet(this.izabranaGrupa, this.izabranPredmet)])
    }
  }

  onNew(){
    this.router.navigate([AppRoutes.testNew])
  }

}

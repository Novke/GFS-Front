import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AppRoutes } from '../app.routes';

@Component({
  selector: 'app-test-select',
  templateUrl: './test-select.component.html',
  styleUrls: ['./test-select.component.css']
})
export class TestSelectComponent {
  izabranaGrupa: number = 0;
  izabranPredmet: number = 0;

  constructor(private router: Router){}

  onSubmit(){
    if (this.izabranaGrupa && this.izabranPredmet) {
    }
  }

  onNew(){
    this.router.navigate([AppRoutes.testNew])
  }

}

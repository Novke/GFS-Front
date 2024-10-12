import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StartPredavanjeComponent } from './start-predavanje/start-predavanje.component';
import { LivePredavanjeComponent } from './live-predavanje/live-predavanje.component';



@NgModule({
  declarations: [
    StartPredavanjeComponent,
    LivePredavanjeComponent
  ],
  imports: [
    CommonModule
  ]
})
export class PredavanjeModule { }

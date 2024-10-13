import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StartPredavanjeComponent } from './start-predavanje/start-predavanje.component';
import { LivePredavanjeComponent } from './live-predavanje/live-predavanje.component';
import { FormsModule } from '@angular/forms';



@NgModule({
  declarations: [
    // StartPredavanjeComponent, //prebaceno u AppModule nije radio StartPredavanje
    // LivePredavanjeComponent
  ],
  imports: [
    CommonModule,
    FormsModule
  ]
})
export class PredavanjeModule { }

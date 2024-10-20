import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StartPredavanjeComponent } from './predavanje/start-predavanje/start-predavanje.component';
import { LivePredavanjeComponent } from './predavanje/live-predavanje/live-predavanje.component';
import { EvidentiranjeComponent } from './domaci/evidentiranje/evidentiranje.component';
import { NovDomaciComponent } from './domaci/nov-domaci/nov-domaci.component';

const routes: Routes = [
  {path:"predavanje/start", component: StartPredavanjeComponent},
  {path:"predavanje/live/:id", component: LivePredavanjeComponent},
  {path:"domaci/:id/evidentiranje", component: EvidentiranjeComponent},
  {path:"domaci", component: NovDomaciComponent}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }

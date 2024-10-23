import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StartPredavanjeComponent } from './predavanje/start-predavanje/start-predavanje.component';
import { LivePredavanjeComponent } from './predavanje/live-predavanje/live-predavanje.component';
import { EvidentiranjeComponent } from './domaci/evidentiranje/evidentiranje.component';
import { NovDomaciComponent } from './domaci/nov-domaci/nov-domaci.component';
import { PregledDomacegComponent } from './domaci/pregled-domaceg/pregled-domaceg.component';
import { DomaciListComponent } from './domaci/domaci-list/domaci-list.component';
import { DomaciSelectComponent } from './domaci/domaci-select/domaci-select.component';

const routes: Routes = [
  {path:"predavanje/start", component: StartPredavanjeComponent},
  {path:"predavanje/live/:id", component: LivePredavanjeComponent},
  {path:"domaci/:id/evidentiranje", component: EvidentiranjeComponent},
  {path:"domaci/:id/pregled", component: PregledDomacegComponent},
  {path:"domaci/grupa/:grupaId/predmet/:predmetId", component: DomaciListComponent},
  {path:"domaci", component: DomaciSelectComponent},
  {path:"domaci/new", component: NovDomaciComponent}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }

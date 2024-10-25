import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StartPredavanjeComponent } from './predavanje/start-predavanje/start-predavanje.component';
import { LivePredavanjeComponent } from './predavanje/live-predavanje/live-predavanje.component';
import { EvidentiranjeComponent } from './domaci/evidentiranje/evidentiranje.component';
import { NovDomaciComponent } from './domaci/nov-domaci/nov-domaci.component';
import { PregledDomacegComponent } from './domaci/pregled-domaceg/pregled-domaceg.component';
import { DomaciListComponent } from './domaci/domaci-list/domaci-list.component';
import { DomaciSelectComponent } from './domaci/domaci-select/domaci-select.component';
import { AppRoutes } from './app.routes';
import { PredavanjeSelectComponent } from './predavanje/predavanje-select/predavanje-select.component';
import { PredavanjeListComponent } from './predavanje/predavanje-list/predavanje-list.component';
import { PregledPredavanjaComponent } from './predavanje/pregled-predavanja/pregled-predavanja.component';


const routes: Routes = [
  { path: AppRoutes.predavanjeSelect, component: PredavanjeSelectComponent},
  { path: AppRoutes.predavanjeStart, component: StartPredavanjeComponent },
  { path: AppRoutes.predavanjeGrupaPredmet(':grupaId', ':predmetId'), component: PredavanjeListComponent},
  { path: AppRoutes.predavanjeLive(':id'), component: LivePredavanjeComponent },
  { path: AppRoutes.predavanjePregled(':id'), component: PregledPredavanjaComponent},
  { path: AppRoutes.domaciSelect, component: DomaciSelectComponent },
  { path: AppRoutes.domaciNew, component: NovDomaciComponent },
  { path: AppRoutes.domaciGrupaPredmet(':grupaId', ':predmetId'), component: DomaciListComponent },
  { path: AppRoutes.domaciEvidentiranje(':id'), component: EvidentiranjeComponent },
  { path: AppRoutes.domaciPregled(':id'), component: PregledDomacegComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }

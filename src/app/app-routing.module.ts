import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StartPredavanjeComponent } from './predavanje/start-predavanje/start-predavanje.component';
import { LivePredavanjeComponent } from './predavanje/live-predavanje/live-predavanje.component';

const routes: Routes = [
  {path:"predavanje/start", component: StartPredavanjeComponent},
  {path:"predavanje/live", component: LivePredavanjeComponent}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }

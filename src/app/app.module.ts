import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { StartPredavanjeComponent } from './predavanje/start-predavanje/start-predavanje.component';
import { LivePredavanjeComponent } from './predavanje/live-predavanje/live-predavanje.component';
import { EvidentiranjeComponent } from './domaci/evidentiranje/evidentiranje.component';
import { NovDomaciComponent } from './domaci/nov-domaci/nov-domaci.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatToolbarModule } from '@angular/material/toolbar'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { PregledDomacegComponent } from './domaci/pregled-domaceg/pregled-domaceg.component';
import { FlexModule } from '@angular/flex-layout'
import { DomaciListComponent } from './domaci/domaci-list/domaci-list.component';
import { MatListModule } from '@angular/material/list';
import { DomaciSelectComponent } from './domaci/domaci-select/domaci-select.component';

@NgModule({
  declarations: [
    AppComponent,
    StartPredavanjeComponent,
    LivePredavanjeComponent,
    EvidentiranjeComponent,
    NovDomaciComponent,
    PregledDomacegComponent,
    DomaciListComponent,
    DomaciSelectComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    BrowserAnimationsModule,
    MatToolbarModule,
    MatButtonModule,
    MatCardModule,
    FlexModule,
    MatListModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }

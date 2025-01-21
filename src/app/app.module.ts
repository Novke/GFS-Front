import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { HttpClientModule } from '@angular/common/http';
import { FlexModule } from '@angular/flex-layout';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SelectBaseComponent } from './components/select-base.component';
import { DomaciListComponent } from './domaci/domaci-list/domaci-list.component';
import { DomaciSelectComponent } from './domaci/domaci-select/domaci-select.component';
import { EvidentiranjeComponent } from './domaci/evidentiranje/evidentiranje.component';
import { NovDomaciComponent } from './domaci/nov-domaci/nov-domaci.component';
import { PregledDomacegComponent } from './domaci/pregled-domaceg/pregled-domaceg.component';
import { HomeComponent } from './home/home.component';
import { LivePredavanjeComponent } from './predavanje/live-predavanje/live-predavanje.component';
import { PredavanjeListComponent } from './predavanje/predavanje-list/predavanje-list.component';
import { PredavanjeSelectComponent } from './predavanje/predavanje-select/predavanje-select.component';
import { PregledPredavanjaComponent } from './predavanje/pregled-predavanja/pregled-predavanja.component';
import { StartPredavanjeComponent } from './predavanje/start-predavanje/start-predavanje.component';
import { NovTestComponent } from './test/nov-test/nov-test.component';
import { TestEvidentiranjeComponent } from './test/test-evidentiranje/test-evidentiranje.component';
import { TestListComponent } from './test/test-list/test-list.component';
import { TestPregledComponent } from './test/test-pregled/test-pregled.component';
import { TestSelectComponent } from './test/test-select/test-select.component';
import { StudentDetailsComponent } from './student/student-details/student-details.component';

@NgModule({
  declarations: [
    AppComponent,
    StartPredavanjeComponent,
    LivePredavanjeComponent,
    EvidentiranjeComponent,
    NovDomaciComponent,
    PregledDomacegComponent,
    DomaciListComponent,
    DomaciSelectComponent,
    SelectBaseComponent,
    PredavanjeListComponent,
    PredavanjeSelectComponent,
    PregledPredavanjaComponent,
    HomeComponent,
    NovTestComponent,
    TestSelectComponent,
    TestListComponent,
    TestEvidentiranjeComponent,
    TestPregledComponent,
    StudentDetailsComponent
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
    MatListModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }

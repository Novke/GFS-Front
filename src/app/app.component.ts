import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router } from '@angular/router';
import { catchError, filter, of } from 'rxjs';
import { AppRoutes } from './app.routes';

// Javne rute (bez basic-auth-a na nginx-u): bez toolbara i bez ijednog poziva zaključanog /api/*.
const JAVNA_RUTA = /^\/upis(\/|$)/;

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    standalone: false
})
export class AppComponent implements OnInit {
  title = 'GFS';
  routes = AppRoutes;
  isStaging = false;
  // Pre prve navigacije: putanja bez <base href> (radi i pod /gfs/).
  javnaStranica = JAVNA_RUTA.test('/' + window.location.pathname.substring(new URL(document.baseURI).pathname.length));

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit(): void {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.javnaStranica = JAVNA_RUTA.test(e.urlAfterRedirects));
    this.http.get<{ env: string }>('assets/env.json')
      .pipe(catchError(() => of(null)))
      .subscribe(cfg => this.isStaging = cfg?.env === 'staging');
  }
}

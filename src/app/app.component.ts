import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { catchError, filter, of } from 'rxjs';
import { AppRoutes } from './app.routes';
import { MatToolbar, MatToolbarRow } from '@angular/material/toolbar';
import { MatButton } from '@angular/material/button';

// Javne rute (bez basic-auth-a na nginx-u): bez toolbara i bez ijednog poziva zaključanog /api/*.
const JAVNA_RUTA = /^\/upis(\/|$)/;

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatToolbar, MatToolbarRow, MatButton, RouterLink, RouterOutlet]
})
export class AppComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);

  title = 'GFS';
  routes = AppRoutes;
  isStaging = false;
  // Pre prve navigacije: putanja bez <base href> (radi i pod /gfs/).
  javnaStranica = JAVNA_RUTA.test('/' + window.location.pathname.substring(new URL(document.baseURI).pathname.length));

  ngOnInit(): void {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.javnaStranica = JAVNA_RUTA.test(e.urlAfterRedirects));
    this.http.get<{ env: string }>('assets/env.json')
      .pipe(catchError(() => of(null)))
      .subscribe(cfg => this.isStaging = cfg?.env === 'staging');
  }
}

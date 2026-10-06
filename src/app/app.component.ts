import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { AppRoutes } from './app.routes';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'GFS';
  routes = AppRoutes;
  isStaging = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.http.get<{ env: string }>('assets/env.json')
      .pipe(catchError(() => of(null)))
      .subscribe(cfg => this.isStaging = cfg?.env === 'staging');
  }
}

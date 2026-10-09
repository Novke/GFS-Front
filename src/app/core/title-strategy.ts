import { inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Naslov stranice: `<naslov rute> · GFS`; ruta bez naslova daje samo `GFS`. */
@Injectable({ providedIn: 'root' })
export class GfsTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const naslov = this.buildTitle(snapshot);
    this.title.setTitle(naslov ? `${naslov} · GFS` : 'GFS');
  }
}

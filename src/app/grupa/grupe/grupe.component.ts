import { Component, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { AppRoutes } from 'src/app/app.routes';
import { CreateGrupaCmd, GrupaInfo } from 'src/app/models/model';
import { ErrorHandlerUtil } from 'src/app/shared/utils/error-handler.util';
import { GrupaService } from '../grupa.service';

@Component({
    selector: 'app-grupe',
    templateUrl: './grupe.component.html',
    styleUrls: ['./grupe.component.css'],
    standalone: false
})
export class GrupeComponent implements OnInit {

  grupe: GrupaInfo[] = [];
  ucitano = false;

  naziv = '';
  godinaUpisa = new Date().getFullYear();
  cuva = false;

  constructor(
    private grupaService: GrupaService,
    private router: Router) { }

  ngOnInit(): void {
    this.ucitajGrupe();
  }

  ucitajGrupe(): void {
    this.grupaService.getGrupe().subscribe({
      next: (grupe) => {
        this.grupe = grupe;
        this.ucitano = true;
      },
      error: (err) => ErrorHandlerUtil.handleHttpError(err)
    });
  }

  otvori(id: number): void {
    this.router.navigate([AppRoutes.grupaDetails(id)]);
  }

  kreiraj(forma: NgForm): void {
    const naziv = this.naziv.trim();
    if (this.cuva || forma.invalid || !naziv) {
      return;
    }
    const cmd: CreateGrupaCmd = { naziv, godinaUpisa: this.godinaUpisa };
    this.cuva = true;
    this.grupaService.createGrupa(cmd).subscribe({
      next: () => {
        this.cuva = false;
        forma.resetForm({ naziv: '', godinaUpisa: new Date().getFullYear() });
        this.ucitajGrupe();
      },
      error: (err) => {
        this.cuva = false;
        ErrorHandlerUtil.handleHttpError(err);
      }
    });
  }
}

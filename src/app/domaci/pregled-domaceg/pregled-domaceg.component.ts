import { Component, OnInit } from '@angular/core';
import { DomaciDetails, DomaciStudentiInfo } from 'src/app/models/model';
import { DomaciService } from '../domaci.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AppRoutes } from 'src/app/app.routes';

@Component({
  selector: 'app-pregled-domaceg',
  templateUrl: './pregled-domaceg.component.html',
  styleUrls: ['./pregled-domaceg.component.css']
})
export class PregledDomacegComponent implements OnInit {

  id: number | null = null;
  domaci: DomaciDetails | undefined;

  constructor(
    private domaciService: DomaciService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe(
      params => {
        const id = params.get('id')
        this.id = id !== null ? Number(id) : null

        if (this.id) this.ucitajDomaci()
      }
    )
  }

  private ucitajDomaci() {
    this.domaciService.viewDomaci(Number(this.id)).subscribe(
      result => {
        this.popuniPolja(result);
      }
    )
  }

  private popuniPolja(result: DomaciDetails) {
    this.domaci = result
  }

  student2string(student: DomaciStudentiInfo){
    return student.ime + " " + student.prezime + " " + student.indeks
  }

  bodovi2string(student: DomaciStudentiInfo) {
    if (student.oslobodjen) return "OSLOBODJEN"
    if (student.bodovi === 1) return "1 poen"
    if (student.bodovi) return student.bodovi.toString() + " poena"
    return "/"
  }

  napomene2string(student: DomaciStudentiInfo){
    return student.uradjenDomaciNapomene ? student.uradjenDomaciNapomene : "-";
  }

  navigateEvidentiranje(){
    if (this.id) this.router.navigate([AppRoutes.domaciEvidentiranje(Number(this.id))])
  }
}

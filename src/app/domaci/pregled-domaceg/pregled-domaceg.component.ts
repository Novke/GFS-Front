import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { DomaciDetails, DomaciStudentiInfo } from 'src/app/models/model';
import { DomaciService } from '../domaci.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AppRoutes } from 'src/app/features/privremeno/app-putanje';
import { FormsModule } from '@angular/forms';
import { MatCard, MatCardContent, MatCardTitle, MatCardSubtitle } from '@angular/material/card';

@Component({
    selector: 'app-pregled-domaceg',
    templateUrl: './pregled-domaceg.component.html',
    styleUrls: ['./pregled-domaceg.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, MatCard, MatCardContent, MatCardTitle, MatCardSubtitle]
})
export class PregledDomacegComponent implements OnInit {
  private domaciService = inject(DomaciService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);


  id: number | null = null;
  domaci: DomaciDetails | undefined;

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
    if (this.id) this.router.navigateByUrl(AppRoutes.domaciEvidentiranje(Number(this.id)))
  }

  navigateStudentPredmet(studentId: number) {
    if (this.domaci) {
      this.router.navigateByUrl(AppRoutes.studentPredmet(studentId, this.domaci.predmet.id))
    }
  }
}

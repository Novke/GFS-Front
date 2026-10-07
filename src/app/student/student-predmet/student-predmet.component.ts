import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { StudentNaPredmetuDetails } from '../../models/model';
import { StudentService } from '../student.service';
import { NgClass, DatePipe } from '@angular/common';

@Component({
    selector: 'app-student-predmet',
    templateUrl: './student-predmet.component.html',
    styleUrls: ['./student-predmet.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgClass, DatePipe]
})
export class StudentPredmetComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private studentService = inject(StudentService);


  studentId: number = 0;
  predmetId: number = 0;
  details: StudentNaPredmetuDetails | null = null;
  loading: boolean = false;

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.studentId = +params['id']; // PRIVREMENO: nova ruta studenti/:id/predmeti/:pid
      this.predmetId = +params['pid'];
      this.loadData();
    });
  }

  loadData(): void {
    this.loading = true;
    this.studentService.getStudentNaPredmetu(this.studentId, this.predmetId).subscribe({
      next: (data) => {
        this.details = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Greška pri učitavanju', err);
        this.loading = false;
      }
    });
  }

  navigateToTest(testId: number): void {
    this.router.navigate(['/testovi', testId]); // PRIVREMENO: nove rute
  }

  navigateToPredavanje(predavanjeId: number): void {
    this.router.navigate(['/predavanja', predavanjeId]); // PRIVREMENO: nove rute
  }

  navigateToDomaci(domaciId: number): void {
    this.router.navigate(['/domaci', domaciId]);
  }

  getTipAktivnostiLabel(tip: string): string {
    switch (tip) {
      case 'PRISUSTVO': return 'Prisustvo';
      case 'ZADATAK': return 'Zadatak';
      case 'SA_ZVEZDICOM': return 'Zvezdica';
      default: return tip;
    }
  }

  getTipAktivnostiBadgeClass(tip: string): string {
    switch (tip) {
      case 'PRISUSTVO': return 'bg-secondary';
      case 'ZADATAK': return 'bg-primary';
      case 'SA_ZVEZDICOM': return 'bg-warning text-dark';
      default: return 'bg-secondary';
    }
  }
}

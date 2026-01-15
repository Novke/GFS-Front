import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { StudentNaPredmetuDetails } from '../../models/model';
import { StudentService } from '../student.service';

@Component({
  selector: 'app-student-predmet',
  templateUrl: './student-predmet.component.html',
  styleUrls: ['./student-predmet.component.css']
})
export class StudentPredmetComponent implements OnInit {

  studentId: number = 0;
  predmetId: number = 0;
  details: StudentNaPredmetuDetails | null = null;
  loading: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private studentService: StudentService
  ) { }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.studentId = +params['studentId'];
      this.predmetId = +params['predmetId'];
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
    this.router.navigate(['/test', testId]);
  }

  navigateToPredavanje(predavanjeId: number): void {
    this.router.navigate(['/predavanje', predavanjeId]);
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

import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { StudentPregledDetails } from 'src/app/models/model';
import { StudentService } from '../student.service';
import { AppRoutes } from 'src/app/app.routes';
import { DatePipe } from '@angular/common';

@Component({
    selector: 'app-student-details',
    templateUrl: './student-details.component.html',
    styleUrls: ['./student-details.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [DatePipe]
})
export class StudentDetailsComponent implements OnInit{
  private studentService = inject(StudentService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);


  id: number | null = null
  student: StudentPregledDetails | null
  defaultNapomena = "- - -"

  constructor(){
    this.student = null
  }
  ngOnInit(): void {
    this.route.paramMap.subscribe(
      params => {
        const id = params.get('id')
        this.id = id !== null ? Number(id) : null

        if (this.id) this.ucitajStudenta()
      }
    )
  }

  private ucitajStudenta(){
    this.studentService.getDetails(Number(this.id)).subscribe(
      result => {
        this.popuniPolja(result)
      }
    )
  }

  private popuniPolja(details: StudentPregledDetails){
      this.student = details
  }

  nagivatePredavanje(predavanjeId: number){
    this.router.navigate([AppRoutes.predavanjePregled(predavanjeId)])
  }

  navigateDomaci(domaciId: number){
    this.router.navigate([AppRoutes.domaciPregled(domaciId)])
  }

  navigateTest(testId: number){
    this.router.navigate([AppRoutes.testPregled(testId)])
  }

  navigateBack(){

  }

}

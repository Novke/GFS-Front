import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { StudentPregledDetails } from 'src/app/models/model';
import { StudentService } from '../student.service';

@Component({
  selector: 'app-student-details',
  templateUrl: './student-details.component.html',
  styleUrls: ['./student-details.component.css']
})
export class StudentDetailsComponent implements OnInit{

  id: number | null = null
  student: StudentPregledDetails | null
  defaultNapomena = "- - -"

  constructor(
    private studentService: StudentService,
        private route: ActivatedRoute,
        private router: Router
  ){
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

  navigateBack(){

  }

}

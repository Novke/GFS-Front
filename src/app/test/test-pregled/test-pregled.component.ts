import { Component, OnInit, ViewChild, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort, MatSortHeader } from '@angular/material/sort';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { AppRoutes } from 'src/app/app.routes';
import { StudentInfo, TestDetails, TestPolaganjeInfo } from 'src/app/models/model';
import { TestService } from '../test.service';
import { DatePipe } from '@angular/common';

@Component({
    selector: 'app-test-pregled',
    templateUrl: './test-pregled.component.html',
    styleUrls: ['./test-pregled.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatTable, MatSort, MatColumnDef, MatHeaderCellDef, MatHeaderCell, MatSortHeader, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, MatPaginator, DatePipe]
})
export class TestPregledComponent implements OnInit{
  private testService = inject(TestService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  id: number | null = null
  test: TestDetails | undefined

  kolone: string[] = ['name', 'index', 'group', 'points'];
  dataSource = new MatTableDataSource<TestPolaganjeInfo>();

  ngOnInit(){
    this.route.paramMap.subscribe(
      params => {
        const id = params.get('id')
        this.id = id !== null ? Number(id) : null

        if (this.id) this.ucitajTest()
      }
    )
  }

  private ucitajTest(){
    this.testService.viewTest(Number(this.id)).subscribe(
      result => {
        this.popuniPolja(result)
      }
    )
  }

  private popuniPolja(result: TestDetails){
    this.test = result
    this.dataSource.data = result.polaganja
    this.dataSource.paginator = this.paginator
    this.dataSource.sort = this.sort
  }

  grupe2string(): string {
    var out = "";
    this.test?.grupe.sort().forEach( g => {
      out+=g + " "
    })
    return out;
  }

  student2string(student: StudentInfo){
    return student.ime + " " + student.prezime + " " + student.indeks
  }

  grupa2string(polaganje: TestPolaganjeInfo){

  }

  navigateEvidentiranje(){
    if (this.id) this.router.navigate([AppRoutes.testEvidentiranje(Number(this.id))])
  }

  navigateStudentPredmet(studentId: number) {
    if (this.test) {
      this.router.navigate([AppRoutes.studentPredmet(studentId, this.test.predmet.id)])
    }
  }
}

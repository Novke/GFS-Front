import { Component, OnInit, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { AppRoutes } from 'src/app/app.routes';
import { StudentInfo, TestDetails, TestPolaganjeInfo } from 'src/app/models/model';
import { TestService } from '../test.service';

@Component({
  selector: 'app-test-pregled',
  templateUrl: './test-pregled.component.html',
  styleUrls: ['./test-pregled.component.css']
})
export class TestPregledComponent implements OnInit{
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  id: number | null = null
  test: TestDetails | undefined

  kolone: string[] = ['name', 'index', 'group', 'points'];
  dataSource = new MatTableDataSource<TestPolaganjeInfo>();

  constructor(
    private testService: TestService,
    private route: ActivatedRoute,
    private router: Router
  ){}

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

}

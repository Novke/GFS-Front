import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TestDetails } from 'src/app/models/model';
import { TestService } from '../test.service';
import { AppRoutes } from 'src/app/app.routes';

@Component({
  selector: 'app-test-pregled',
  templateUrl: './test-pregled.component.html',
  styleUrls: ['./test-pregled.component.css']
})
export class TestPregledComponent implements OnInit{

  id: number | null = null
  test: TestDetails | undefined

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
  }

  grupe2string(): string {
    var out = "";
    this.test?.grupe.sort().forEach( g => {
      out+=g + " "
    })
    return out;
  }

  navigateEvidentiranje(){
    if (this.id) this.router.navigate([AppRoutes.testEvidentiranje(Number(this.id))])
  }

}

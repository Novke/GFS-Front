import { Component, OnInit } from '@angular/core';
import { TestDetails } from '../models/model';
import { TestService } from '../test/test.service';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-test-evidentiranje',
  templateUrl: './test-evidentiranje.component.html',
  styleUrls: ['./test-evidentiranje.component.css']
})
export class TestEvidentiranjeComponent implements OnInit{

  id: number | null = null
  test: TestDetails | undefined
  novMaxPoena: number | null = null
  novDatum: Date | null = null

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
    this.novDatum = result.datum
    this.novMaxPoena = result.maxPoena
  }

  navigatePregled(){

  }

  azuriraj(){

  }

  jesuLiPoljaNepromenjena(){
    return false
  }

}

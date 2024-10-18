import { Component, OnInit } from '@angular/core';
import { DomaciDetails } from 'src/app/models/model';
import { DomaciService } from '../domaci.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-evidentiranje',
  templateUrl: './evidentiranje.component.html',
  styleUrls: ['./evidentiranje.component.css']
})
export class EvidentiranjeComponent implements OnInit{

  id: number | null = null;
  domaci: DomaciDetails | undefined

  constructor(
    private domaciService: DomaciService,
    private route: ActivatedRoute
  ){

  }


  ngOnInit(): void {

    this.route.paramMap.subscribe(
      params => {
        const id = params.get('id')
        this.id = id !== null ? Number(id) : null

        if (this.id) this.ucitajDomaci()
      }
    )
  }

  private ucitajDomaci(){
    this.domaciService.viewDomaci(Number(this.id)).subscribe(
      result => {
        this.domaci = result
        console.log("Podaci:", result)
      }
    )
  }
}

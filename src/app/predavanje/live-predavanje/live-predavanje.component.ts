import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PredavanjeService } from '../predavanje.service';
import { PredavanjeDetails } from '../models/predavanje.model';

@Component({
  selector: 'app-live-predavanje',
  templateUrl: './live-predavanje.component.html',
  styleUrls: ['./live-predavanje.component.css']
})
export class LivePredavanjeComponent implements OnInit {

  id: number | null = null;
  livePredavanje : PredavanjeDetails = {
    id: 0,
    rb: 0,
    datum: new Date(),
    tema: '',
    posecenost: 0,
    predmet: { id: 0, naziv: '' },
    grupa: { id: 0, naziv: '', godinaUpisa: 0 },
    aktivnosti: []
  };

  constructor(
    private route: ActivatedRoute,
    private predavanjeService: PredavanjeService) {}

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      this.id = id !== null ? Number(id) : null;

      if (!this.id) {
        console.log("NIJE BROJ!!!")
      }
        else {
          this.ucitajPredavanje(Number(id));

          console.log(this.livePredavanje)
        }
    });
  }

  ucitajPredavanje(id: number) {
    this.predavanjeService.getPredavanjeDetails(id).subscribe(
        result => this.livePredavanje = result
    );
  }

}


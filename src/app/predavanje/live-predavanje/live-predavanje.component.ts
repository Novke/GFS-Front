import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PredavanjeService } from '../predavanje.service';
import { AktivnostInfo, GrupaDetails, PredavanjeDetails, StudentDetails, UpdatePredavanjeCmd } from '../models/predavanje.model';

@Component({
  selector: 'app-live-predavanje',
  templateUrl: './live-predavanje.component.html',
  styleUrls: ['./live-predavanje.component.css']
})
export class LivePredavanjeComponent implements OnInit {

  id: number | null = null;

  livePredavanje: PredavanjeDetails = {
    id: 0,
    rb: 0,
    datum: new Date(),
    tema: '',
    posecenost: 0,
    predmet: { id: 0, naziv: '' },
    grupa: { id: 0, naziv: '', godinaUpisa: 0 },
    aktivnosti: []
  };

  liveGrupa: GrupaDetails = {
    id: 0,
    naziv: '',
    godinaUpisa: 0,
    studenti: []
  }

  studentiZaDodavanje: StudentDetails[] = []

  novRb: number = 0;
  novaTema: string = '';
  novDatum = new Date();
  novaPosecenost: number = 0;

  constructor(
    private route: ActivatedRoute,
    private predavanjeService: PredavanjeService) { }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      this.id = id !== null ? Number(id) : null;

      if (!this.id) {
        console.log("NIJE BROJ!!!")
      }
      else {
        this.ucitajPredavanje(Number(id));
      }
    });
  }

  areFieldsTouched(): boolean {
    return (
      this.novRb !== this.livePredavanje.rb ||
      this.novaTema !== this.livePredavanje.tema ||
      this.novaPosecenost !== this.livePredavanje.posecenost ||
      this.novDatum !== this.livePredavanje.datum
    );
  }

  ucitajPredavanje(id: number) {
    this.predavanjeService.getPredavanjeDetails(id).subscribe(
      result => {
        this.osveziPredavanje(result)

        this.ucitajGrupu()
      }
    );
  }

  ucitajGrupu() {
    const id = this.livePredavanje.grupa.id;

    this.predavanjeService.getGrupaDetails(id).subscribe(
      result => {
        this.liveGrupa = result
        this.osveziStudenteZaDodavanje()
      }
    )

  }

  updatePredavanje() {

    const cmd: UpdatePredavanjeCmd = {
      rb: this.novRb,
      datum: this.novDatum,
      posecenost: this.novaPosecenost,
      tema: this.novaTema
    }

    this.predavanjeService.updatePredavanje(
      this.livePredavanje.id,
      cmd)
      .subscribe(
        result => {
          this.osveziPredavanje(result)
        }
      );
  }

  dodajPrisutnog(studentId: number){
    this.predavanjeService.dodajPrisutnog(studentId, this.livePredavanje.id).subscribe(
      result => {
        this.osveziPredavanje(result)
        this.osveziStudenteZaDodavanje()
      }
    )
  }

  skloniPrisutnog(studentId: number){
    this.predavanjeService.skloniPrisutnog(studentId, this.livePredavanje.id).subscribe(
      result => {
        this.osveziPredavanje(result)
        this.osveziStudenteZaDodavanje()
      }
    )
  }

  updatePosecenost(){
    this.predavanjeService.updatePosecenost(this.livePredavanje.id).subscribe(
      result => {
        this.osveziPredavanje(result)
      }
    )
  }

  dodajZadatak(studentId: number){
    this.predavanjeService.dodajZadatak(studentId, this.livePredavanje.id).subscribe(
      result => {
        this.osveziPredavanje(result)
      }
    )
  }

  skloniZadatak(studentId: number){
    this.predavanjeService.skloniZadatak(studentId, this.livePredavanje.id).subscribe(
      result => {
        this.osveziPredavanje(result)
      }
    )
  }

  dodajZadatakZvezdica(studentId: number){
    this.predavanjeService.dodajZadatakZvezdica(studentId, this.livePredavanje.id).subscribe(
      result => {
        this.osveziPredavanje(result)
      }
    )
  }

  osveziPredavanje(result: PredavanjeDetails){
    this.livePredavanje = result

          this.novDatum = result.datum;
          this.novRb = result.rb;
          this.novaTema = result.tema;
          this.novaPosecenost = result.posecenost;
  }

  osveziStudenteZaDodavanje(){
    this.studentiZaDodavanje = this.liveGrupa.studenti.filter(
      s => {
        const num =  this.livePredavanje.aktivnosti.filter(
          a => {
            return a.student.id === s.id
          }
        ).length
        return num===0
      }
    )
  }

  tipEquals(a: AktivnostInfo, tip: string){
    return a.tip === tip;
  }


}


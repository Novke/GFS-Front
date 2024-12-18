import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PredavanjeService } from '../predavanje.service';
import { AktivnostInfo, GrupaDetails, PredavanjeDetails, StudentDetails, UpdatePredavanjeCmd, tipAktivnosti } from '../../models/model';
import { AppRoutes } from 'src/app/app.routes';

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
    aktivnosti: [],
    zavrseno: true
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

  updatedNapomene: { [key: number]: string } = {};

  showModal: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
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

  toggleModal(){
    this.showModal = !this.showModal;
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

  dodajPrisutnog(studentId: number) {
    this.predavanjeService.dodajPrisutnog(studentId, this.livePredavanje.id).subscribe(
      result => {
        this.osveziPredavanje(result)
        this.osveziStudenteZaDodavanje()
      }
    )
  }

  skloniPrisutnog(studentId: number) {
    this.predavanjeService.skloniPrisutnog(studentId, this.livePredavanje.id).subscribe(
      result => {
        this.osveziPredavanje(result)
        this.osveziStudenteZaDodavanje()
      }
    )
  }

  updatePosecenost() {
    this.predavanjeService.updatePosecenost(this.livePredavanje.id).subscribe(
      result => {
        this.osveziPredavanje(result)
      }
    )
  }

  dodajZadatak(studentId: number) {
    this.predavanjeService.dodajZadatak(studentId, this.livePredavanje.id).subscribe(
      result => {
        this.osveziPredavanje(result)
      }
    )
  }

  skloniZadatak(studentId: number) {
    this.predavanjeService.skloniZadatak(studentId, this.livePredavanje.id).subscribe(
      result => {
        this.osveziPredavanje(result)
      }
    )
  }

  dodajZadatakZvezdica(studentId: number) {
    this.predavanjeService.dodajZadatakZvezdica(studentId, this.livePredavanje.id).subscribe(
      result => {
        this.osveziPredavanje(result)
      }
    )
  }

  osveziPredavanje(result: PredavanjeDetails) {
    this.livePredavanje = result;

    this.updatedNapomene = {};
    this.livePredavanje.aktivnosti.forEach(a => {
      this.updatedNapomene[a.id] = a.napomene
    })

    this.novDatum = result.datum;
    this.novRb = result.rb;
    this.novaTema = result.tema;
    this.novaPosecenost = result.posecenost;
  }

  osveziStudenteZaDodavanje() {
    this.studentiZaDodavanje = this.liveGrupa.studenti.filter(
      s => {
        const num = this.livePredavanje.aktivnosti.filter(
          a => {
            return a.student.id === s.id
          }
        ).length
        return num === 0
      }
    )
  }

  updateAktivnostNapomena(aktivnostId: number) {
    const value = this.updatedNapomene[aktivnostId]
    this.predavanjeService.updateAktivnostiNapomena(aktivnostId, value).subscribe(
      result => {
        //ne treba nista jos
      }
    )
  }

  tipEquals(a: AktivnostInfo, key: string) {
    return a.tip === key;
  }

  tipKeys = Object.keys(tipAktivnosti); 

  handleTipAction(tip: string, studentId: number) {
    switch (tip) {
      case tipAktivnosti.PRISUSTVO:
        this.skloniZadatak(studentId);
        break;
      case tipAktivnosti.ZADATAK:
        this.dodajZadatak(studentId);
        break;
      case tipAktivnosti.SA_ZVEZDICOM:
        this.dodajZadatakZvezdica(studentId);
        break;
    }
  }

  buttonLabel(tip: string): string {
    switch (tip) {
      case tipAktivnosti.PRISUSTVO:
        return "-";
      case tipAktivnosti.ZADATAK:
        return "1";
      case tipAktivnosti.SA_ZVEZDICOM:
        return "*";
      default:
        return "";
    }
  }

  zavrsiPredavanje(){
    if (this.id) 
    if (window.confirm("Da li si siguran da želiš da završiš predavanje?"))
      this.predavanjeService.zavrsiPredavanje(Number(this.id)).subscribe(
        result => this.navigatePregled()
    )

  }

  navigatePregled(){
    if (this.id)
      this.router.navigate([AppRoutes.predavanjePregled(Number(this.id))])
  }



}


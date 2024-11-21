import { Component, OnInit } from '@angular/core';
import { EvidentirajPolaganjeCmd, GrupaDetails, StudentDetails, TestDetails, TestPolaganjeInfo, TipTestaInfo } from '../models/model';
import { TestService } from '../test/test.service';
import { ActivatedRoute, Router } from '@angular/router';
import { PredavanjeService } from '../predavanje/predavanje.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-test-evidentiranje',
  templateUrl: './test-evidentiranje.component.html',
  styleUrls: ['./test-evidentiranje.component.css']
})
export class TestEvidentiranjeComponent implements OnInit {

  id: number | null = null
  test: TestDetails | null = null
  grupa: GrupaDetails | null = null
  novMaxPoena: number | null = null
  novDatum: Date | null = null
  novTipTesta: TipTestaInfo | null = null

  tipovi: TipTestaInfo[] = []

  showModalDodaj = false
  studentiZaDodavanje: StudentDetails[] | undefined = []

  prikazaniIspitanik: TestPolaganjeInfo | null = null

  constructor(
    private testService: TestService,
    private predavanjeService: PredavanjeService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit() {
    this.route.paramMap.subscribe(
      params => {
        const id = params.get('id')
        this.id = id !== null ? Number(id) : null

        if (this.id) {
          this.ucitajTest()
        }
      }
    )
  }

  private ucitajTest() {
    this.testService.viewTest(Number(this.id)).subscribe(
      result => {
        this.popuniPolja(result)
        this.ucitajGrupu() //poziva i osvezavanje studenata
        this.ucitajTipove()
      }
    )
  }

  private ucitajTipove(){
    this.testService.findTipoveTestovaPredmeta(this.test!.predmet.id).subscribe(
      result => {
        this.tipovi = result
        this.novTipTesta = this.tipovi.find(t => t.id === this.test!.tipTesta.id) || null;
      },
      error => {
        console.log("Neuspesno nabavljanje tipova", error)
      }
    )
  }

  private popuniPolja(result: TestDetails) {
    this.test = result
    this.novDatum = result.datum
    this.novMaxPoena = result.maxPoena
    // this.novTipTesta = result.tipTesta
    this.novTipTesta = this.tipovi.find(t => t.id === result.tipTesta.id) || null;
  }

  navigatePregled() {

  }

  azuriraj() {
    console.log(this.novTipTesta)
  }

  jesuLiPoljaNepromenjena() {
    return false
  }

  toggleModal() {
    this.showModalDodaj = !this.showModalDodaj
  }

  zavrsiEvidentiranje() {

  }

  dodajIspitanika(studentId: number) {
    this.testService.dodajIspitanika(studentId, this.test!.id).subscribe(
      result => {
        this.popuniPolja(result)
        this.osveziStudenteZaDodavanje()
      }
    )
  }

  ukloniIspitanika(studentId: number) {
    this.testService.skloniIspitanika(studentId, this.test!.id).subscribe(
      result => {
        this.popuniPolja(result)
        this.osveziStudenteZaDodavanje()
      }
    )
  }

  prikaziIspitanika(polaganje: TestPolaganjeInfo) {
    this.prikazaniIspitanik = {
      grupa: polaganje.grupa,
      id: polaganje.id,
      napomene: polaganje.napomene,
      ostvareniPoeni: polaganje.ostvareniPoeni,
      polozio: polaganje.polozio,
      prepisivao: polaganje.prepisivao,
      student: polaganje.student
    }
  }

  sakrijIspitanika() {
    this.prikazaniIspitanik = null
  }

  evidentirajIspitanika(polaganje: TestPolaganjeInfo) {
    const cmd: EvidentirajPolaganjeCmd = {
      grupa: polaganje.grupa,
      napomene: polaganje.napomene,
      ostvareniPoeni: Number(polaganje.ostvareniPoeni),
      prepisivao: polaganje.prepisivao,
      studentId: polaganje.student.id
    }

    this.testService.evidentirajIspitanika(cmd, this.test!.id).subscribe(
      result => {
        console.log("Uspesno!", result)
        this.popuniPolja(result)
        this.prikazaniIspitanik = null
      },
      (error: HttpErrorResponse) => {
        if (error.status >= 400 && error.status < 500) {
          const reason = error.error.reason || 'Sistemska greska'
          alert(`Greska: ${reason}`)
        } else {
          console.error('Neuspesno kreiranje testa', error)
        }
      }
    )
  }

  ucitajGrupu() {
    if (this.test) {
      const id = this.test.grupa.id;

      this.predavanjeService.getGrupaDetails(id).subscribe(
        result => {
          this.grupa = result
          this.osveziStudenteZaDodavanje()
        }
      )
    }

  }

  osveziStudenteZaDodavanje() {
    this.studentiZaDodavanje = this.grupa?.studenti.filter(
      s => {
        const num = this.test?.polaganja.filter(
          p => {
            return p.student.id === s.id
          }
        ).length
        return num === 0
      }
    )
  }

  postojeStudentiZaDodavanje(): Boolean {
    if (this.studentiZaDodavanje) return this.studentiZaDodavanje.length > 0
    else return false;
  }

  poeni2string(polaganje: TestPolaganjeInfo): string {
    if (polaganje.ostvareniPoeni) return polaganje.ostvareniPoeni?.toString()
    else return "- Nije pregledano -"
  }


}

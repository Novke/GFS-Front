import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AppRoutes } from '../app.routes';
import { EvidentirajPolaganjeCmd, GrupaDetails, StudentDetails, TestDetails, TestPolaganjeInfo, TipTestaInfo, UpdateTestCmd } from '../models/model';
import { PredavanjeService } from '../predavanje/predavanje.service';
import { ErrorHandlerUtil } from '../shared/utils/error-handler.util';
import { TestService } from '../test/test.service';

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

  private ucitajTipove() {
    this.testService.findTipoveTestovaPredmeta(this.test!.predmet.id).subscribe(
      result => {
        this.tipovi = result
        this.novTipTesta = this.tipovi.find(t => t.id === this.test!.tipTesta.id) || null;
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
    this.router.navigate([AppRoutes.testPregled(this.test!.id)])
  }

  azuriraj() {
    if (this.novDatum && this.novMaxPoena && this.novTipTesta) {

      const cmd: UpdateTestCmd = {
        datum: this.novDatum,
        maxPoena: this.novMaxPoena,
        tipTestaId: this.novTipTesta?.id
      }

      this.testService.updateTest(this.test!.id, cmd).subscribe(
        result => this.popuniPolja(result),
        error => ErrorHandlerUtil.handleHttpError(error)
      )
    } else {
      alert("Nisu popunjena sva polja!")
    }
  }

  jesuLiPoljaNepromenjena() {
    return this.test!.datum === this.novDatum &&
      this.test!.tipTesta.id === this.novTipTesta?.id &&
      this.test!.maxPoena === this.novMaxPoena
  }

  toggleModal() {
    this.showModalDodaj = !this.showModalDodaj
  }

  zavrsiEvidentiranje() {
    if (window.confirm("Da li si siguran da želiš da završiš sa evidentiranjem testa?"))
      this.testService.zavrsiEvidentiranje(this.test!.id).subscribe(
        result => this.navigatePregled(),
        error => ErrorHandlerUtil.handleHttpError(error)
      )
  }

  dodajIspitanika(studentId: number) {
    this.testService.dodajIspitanika(studentId, this.test!.id).subscribe(
      result => {
        this.popuniPolja(result)
        this.osveziStudenteZaDodavanje()
      },
      error => ErrorHandlerUtil.handleHttpError(error)
    )
  }

  ukloniIspitanika(polaganje: TestPolaganjeInfo) {

    if (polaganje.ostvareniPoeni === null || window.confirm("Da li si siguran da želiš da ukloniš studenta " + polaganje.student.ime + " " + polaganje.student.prezime)) {

      const studentId = polaganje.student.id

      this.testService.skloniIspitanika(studentId, this.test!.id).subscribe(
        result => {
          this.popuniPolja(result)
          this.osveziStudenteZaDodavanje()
        },
        error => ErrorHandlerUtil.handleHttpError(error)
      )
    }
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
      ostvareniPoeni: polaganje.ostvareniPoeni,
      prepisivao: polaganje.prepisivao,
      studentId: polaganje.student.id
    }

    this.testService.evidentirajIspitanika(cmd, this.test!.id).subscribe(
      result => {
        console.log("Uspesno!", result)
        this.popuniPolja(result)
        this.prikazaniIspitanik = null
      },
      error => ErrorHandlerUtil.handleHttpError(error)
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
    if (polaganje.ostvareniPoeni === null) return "- Nije pregledano -"
    return polaganje.ostvareniPoeni?.toString()

  }


}

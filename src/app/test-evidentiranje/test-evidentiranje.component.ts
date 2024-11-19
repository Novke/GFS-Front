import { Component, OnInit } from '@angular/core';
import { GrupaDetails, StudentDetails, TestDetails, TestPolaganjeInfo } from '../models/model';
import { TestService } from '../test/test.service';
import { ActivatedRoute, Router } from '@angular/router';
import { PredavanjeService } from '../predavanje/predavanje.service';

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

  showModal = false
  studentiZaDodavanje: StudentDetails[] | undefined = []

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

        if (this.id) this.ucitajTest()
      }
    )
  }

  private ucitajTest() {
    this.testService.viewTest(Number(this.id)).subscribe(
      result => {
        this.popuniPolja(result)
        this.ucitajGrupu() //poziva i osvezavanje studenata
      }
    )
  }

  private popuniPolja(result: TestDetails) {
    this.test = result
    this.novDatum = result.datum
    this.novMaxPoena = result.maxPoena
  }

  navigatePregled() {

  }

  azuriraj() {

  }

  jesuLiPoljaNepromenjena() {
    return false
  }

  toggleModal() {
    this.showModal = !this.showModal
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

  ukloniIspitanika(studentId: number){
    this.testService.skloniIspitanika(studentId, this.test!.id).subscribe(
      result => {
        this.popuniPolja(result)
        this.osveziStudenteZaDodavanje()
      }
    )
  }

  evidentirajIspitanika(studentId: number){

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
    console.log("Osvezavam studente za dodavanje")
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
    console.log("Rezultat:", this.studentiZaDodavanje)
  }

  postojeStudentiZaDodavanje(): Boolean {
    if (this.studentiZaDodavanje) return this.studentiZaDodavanje.length>0
    else return false;
  }

  poeni2string(polaganje: TestPolaganjeInfo):string {
    if (polaganje.ostvareniPoeni) return polaganje.ostvareniPoeni?.toString()
      else return "- Nije pregledano -"
  }


}

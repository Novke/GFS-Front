import { Component, OnInit } from '@angular/core';
import { CreateUradjenDomaciCmd, DomaciDetails, DomaciStudentiInfo, tipAktivnosti, UpdateDomaciCmd } from 'src/app/models/model';
import { DomaciService } from '../domaci.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AppRoutes } from 'src/app/app.routes';

@Component({
  selector: 'app-evidentiranje',
  templateUrl: './evidentiranje.component.html',
  styleUrls: ['./evidentiranje.component.css']
})
export class EvidentiranjeComponent implements OnInit {

  id: number | null = null;
  domaci: DomaciDetails | undefined;
  novText: string = 'DOMAĆI NIJE UČITAN'
  novNaslov: string = ''
  novDatum: Date = new Date()
  showModal = false;

  selectedStudent: DomaciStudentiInfo | null = null;

  constructor(
    private domaciService: DomaciService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe(
      params => {
        const id = params.get('id')
        this.id = id !== null ? Number(id) : null

        if (this.id) this.ucitajDomaci()
      }
    )
  }

  private ucitajDomaci() {
    this.domaciService.viewDomaci(Number(this.id)).subscribe(
      result => {
        this.popuniPolja(result);
      }
    )
  }

  private popuniPolja(result: DomaciDetails) {
    this.domaci = result
    this.novText = result.text
    this.novDatum = result.datum
    this.novNaslov = result.naslov
  }

  izracunajPrisutne() {
    if (!this.domaci || !this.domaci.studenti) return 0;
    return this.domaci.studenti.filter(a => a.tip).length;
  }

  izracunajAktivne() {
    if (!this.domaci || !this.domaci.studenti) return 0;
    return this.domaci.studenti.filter(
      a => a.tip === tipAktivnosti.ZADATAK || a.tip === tipAktivnosti.SA_ZVEZDICOM
    ).length;
  }

  aktivnost2String(aktivnost: string): string {
    if (!aktivnost) return "/";
    if (aktivnost === tipAktivnosti.ZADATAK || aktivnost === tipAktivnosti.SA_ZVEZDICOM) return "Da";
    return "Ne";
  }

  bodovi2String(student: DomaciStudentiInfo) {
    if (student.oslobodjen) return "OSLOBODJEN"
    if (student.bodovi) return student.bodovi.toString()
    return ""
  }

  openEditModal(student: DomaciStudentiInfo) {
    this.selectedStudent = { ...student };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.selectedStudent = null;
  }

  saveChanges() {
    if (this.selectedStudent && this.domaci) {

      const cmd: CreateUradjenDomaciCmd = {
        studentId: this.selectedStudent.studentId,
        bodovi: this.selectedStudent.bodovi,
        domaciId: Number(this.id),
        napomene: this.selectedStudent.uradjenDomaciNapomene,
        prepisivanje: this.selectedStudent.prepisivanje
      }

      this.domaciService.evidentirajDomaci(cmd).subscribe(
        result => this.popuniPolja(result)
      )
    }
    this.closeModal();
  }

  oslobodi() {
    this.domaciService.oslobodiDomaceg(Number(this.id)).subscribe(
      result => this.domaci = result
    )
  }

  jesuLiPoljaNepromenjena(): boolean {
    return this.novDatum === this.domaci?.datum && 
    this.novText === this.domaci.text &&
    this.novNaslov === this.domaci.naslov
  }

  jesuLiOslobadjani(): boolean {

    return this.domaci?.studenti.filter(
      s => s.oslobodjen
    ).length === this.izracunajAktivne()

  }

  azuriraj() {
    const cmd: UpdateDomaciCmd = {
      datum: this.novDatum,
      text: this.novText,
      naslov: this.novNaslov
    }

    this.domaciService.azurirajDomaci(Number(this.id), cmd).subscribe(
      result => this.popuniPolja(result)
    )
  }

  zavrsi() {
    if (window.confirm("Da li si siguran da želiš da završiš sa pregledanjem domaćeg?")) {
      this.domaciService.zavrsiPregledanje(Number(this.id))
      .subscribe(
        () => this.router.navigate([AppRoutes.domaciPregled(Number(this.id))]),

        error => console.log("Greska", error)
        )


    }
  }

  navigatePregled(){
    if (this.id) this.router.navigate([AppRoutes.domaciPregled(Number(this.id))])
  }
}

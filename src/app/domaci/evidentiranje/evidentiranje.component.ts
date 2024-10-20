import { Component, OnInit } from '@angular/core';
import { CreateUradjenDomaciCmd, DomaciDetails, DomaciStudentiInfo, tipAktivnosti } from 'src/app/models/model';
import { DomaciService } from '../domaci.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-evidentiranje',
  templateUrl: './evidentiranje.component.html',
  styleUrls: ['./evidentiranje.component.css']
})
export class EvidentiranjeComponent implements OnInit{

  id: number | null = null;
  domaci: DomaciDetails | undefined;
  showModal = false;

  selectedStudent: DomaciStudentiInfo | null = null;

  constructor(
    private domaciService: DomaciService,
    private route: ActivatedRoute
  ){}

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
        this.domaci = result;
        console.log("Podaci:", result);
      }
    )
  }

  izracunajPrisutne(){
    if (!this.domaci || !this.domaci.studenti) return 0;
    return this.domaci.studenti.filter(a => a.tip).length;
  }

  izracunajAktivne(){
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

  openEditModal(student: DomaciStudentiInfo) {
    this.selectedStudent = { ...student };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.selectedStudent = null;
  }

  //TODO
  saveChanges() {
    if (this.selectedStudent && this.domaci) {
      
      const cmd : CreateUradjenDomaciCmd = {
        studentId: this.selectedStudent.studentId,
        bodovi: this.selectedStudent.bodovi,
        domaciId: Number(this.id),
        napomene: this.selectedStudent.uradjenDomaciNapomene,
        prepisivanje: this.selectedStudent.prepisivanje
      }

      this.domaciService.evidentirajDomaci(cmd).subscribe(
        result => this.domaci = result
      )
    }
    this.closeModal();
  }
}

import { Component, OnInit } from '@angular/core';
import {
  GrupaInfo,
  KoeficijentiInfo,
  KoeficijentTipTestaCmd,
  PredmetInfo,
  RezultatiStudentaInfo,
  SaveKoeficijentiCmd,
  TipTestaInfo
} from '../models/model';
import { OcenjivanjeService } from './ocenjivanje.service';

@Component({
  selector: 'app-ocenjivanje-select',
  templateUrl: './ocenjivanje-select.component.html',
  styleUrls: ['./ocenjivanje-select.component.css']
})
export class OcenjivanjeSelectComponent implements OnInit {

  grupe: GrupaInfo[] = [];
  predmeti: PredmetInfo[] = [];
  tipovi: TipTestaInfo[] = [];

  izabranaGrupa: number = 0;
  izabranPredmet: number = 0;

  koeficijenti: KoeficijentiInfo | null = null;
  rezultati: RezultatiStudentaInfo[] = [];

  showKoeficijentiEditor: boolean = false;
  loading: boolean = false;

  // Lokalna kopija za editovanje
  editKoef: SaveKoeficijentiCmd = this.getDefaultKoeficijenti();

  constructor(private ocenjivanjeService: OcenjivanjeService) { }

  ngOnInit(): void {
    this.loadGrupeIPredmeti();
  }

  loadGrupeIPredmeti(): void {
    this.ocenjivanjeService.getGrupe().subscribe(g => this.grupe = g);
    this.ocenjivanjeService.getPredmeti().subscribe(p => this.predmeti = p);
  }

  onPredmetChange(): void {
    if (this.izabranPredmet) {
      // Učitaj tipove testa i koeficijente za izabrani predmet
      this.ocenjivanjeService.getTipoviTesta(this.izabranPredmet).subscribe(t => {
        this.tipovi = t;
      });
      this.ocenjivanjeService.getKoeficijenti(this.izabranPredmet).subscribe(k => {
        this.koeficijenti = k;
        this.syncEditKoefFromInfo(k);
      });
    }
    this.rezultati = [];
  }

  onSubmit(): void {
    if (this.izabranaGrupa && this.izabranPredmet) {
      this.loading = true;
      this.ocenjivanjeService.getRezultati(this.izabranPredmet, { grupaId: this.izabranaGrupa })
        .subscribe({
          next: r => {
            this.rezultati = r;
            this.loading = false;
          },
          error: err => {
            console.error('Greška prilikom učitavanja rezultata', err);
            this.loading = false;
          }
        });
    }
  }

  openKoeficijentiEditor(): void {
    if (this.koeficijenti) {
      this.syncEditKoefFromInfo(this.koeficijenti);
    }
    this.showKoeficijentiEditor = true;
  }

  closeKoeficijentiEditor(): void {
    this.showKoeficijentiEditor = false;
  }

  saveKoeficijenti(): void {
    if (!this.izabranPredmet) return;

    this.ocenjivanjeService.saveKoeficijenti(this.izabranPredmet, this.editKoef)
      .subscribe({
        next: k => {
          this.koeficijenti = k;
          this.showKoeficijentiEditor = false;
          // Ako već imamo rezultate, osveži ih
          if (this.rezultati.length > 0) {
            this.onSubmit();
          }
        },
        error: err => {
          console.error('Greška prilikom čuvanja koeficijenata', err);
        }
      });
  }

  private getDefaultKoeficijenti(): SaveKoeficijentiCmd {
    return {
      koefPrisustvo: 1,
      koefZadatak: 2,
      koefZvezdica: 4,
      domaciFlat: 4,
      domaciVarijansa: 6,
      koristiMaxRezultat: true,
      prikaziZbirno: false,
      maxAktivnost: null,
      maxDomaci: null,
      koeficijentiTipova: []
    };
  }

  private syncEditKoefFromInfo(info: KoeficijentiInfo): void {
    this.editKoef = {
      koefPrisustvo: info.koefPrisustvo,
      koefZadatak: info.koefZadatak,
      koefZvezdica: info.koefZvezdica,
      domaciFlat: info.domaciFlat,
      domaciVarijansa: info.domaciVarijansa,
      koristiMaxRezultat: info.koristiMaxRezultat,
      prikaziZbirno: info.prikaziZbirno,
      maxAktivnost: info.maxAktivnost,
      maxDomaci: info.maxDomaci,
      koeficijentiTipova: info.koeficijentiTipova.map(t => ({
        tipTestaId: t.tipTestaId,
        maxPoena: t.maxPoena
      }))
    };
  }

  getKoefTip(tipTestaId: number): KoeficijentTipTestaCmd {
    let found = this.editKoef.koeficijentiTipova.find(k => k.tipTestaId === tipTestaId);
    if (!found) {
      found = { tipTestaId: tipTestaId, maxPoena: null };
      this.editKoef.koeficijentiTipova.push(found);
    }
    return found;
  }

  getPoeniZaTip(rez: RezultatiStudentaInfo, tipTestaId: number): number {
    const r = rez.rezultati.find(x => x.tipTesta.id === tipTestaId);
    return r ? r.ostvarenoPoena : 0;
  }

  getOcenaClass(ocena: number | null): string {
    if (ocena === null) return 'text-danger';
    if (ocena >= 9) return 'text-success fw-bold';
    if (ocena >= 7) return 'text-primary';
    return 'text-secondary';
  }

  getTipNazivFromInfo(tipTestaId: number): string {
    if (this.koeficijenti) {
      const tip = this.koeficijenti.koeficijentiTipova.find(t => t.tipTestaId === tipTestaId);
      if (tip) return tip.tipTestaNaziv;
    }
    const tip = this.tipovi.find(t => t.id === tipTestaId);
    return tip ? tip.naziv : '';
  }
}

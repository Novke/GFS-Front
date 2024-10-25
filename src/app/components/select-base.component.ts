import { Component, OnInit, Input, Output, EventEmitter, Injector } from '@angular/core';
import { GrupaInfo, PredmetInfo } from 'src/app/models/model';
import { PredavanjeService } from 'src/app/predavanje/predavanje.service';

@Component({
  selector: 'app-select-base',
  templateUrl: './select-base.component.html',
  styleUrls: ['./select-base.component.css']
})
export class SelectBaseComponent implements OnInit {
  @Input() submitButtonText: string = 'Submit';
  @Input() newButtonText: string = 'Create New';
  @Input() titleText: string = '';

  @Output() submitSelection = new EventEmitter<void>();
  @Output() createNew = new EventEmitter<void>();

  grupe: GrupaInfo[] = [];
  predmeti: PredmetInfo[] = [];
  @Input() izabranaGrupa: number = 0;
  @Input() izabranPredmet: number = 0;
  @Output() izabranaGrupaChange = new EventEmitter<number>();
  @Output() izabranPredmetChange = new EventEmitter<number>();

  constructor(private predavanjeService: PredavanjeService) { }

  ngOnInit(): void {
    this.loadGroupsAndSubjects();
  }

  loadGroupsAndSubjects(): void {
    this.predavanjeService.getGrupe().subscribe(groups => (this.grupe = groups));
    this.predavanjeService.getPredmeti().subscribe(subjects => (this.predmeti = subjects));
  }

  onIzabranaGrupaChange() {
    this.izabranaGrupaChange.emit(this.izabranaGrupa);
  }
  
  onIzabranPredmetChange() {
    this.izabranPredmetChange.emit(this.izabranPredmet);
  }

  onSubmit(): void {
    if (this.izabranaGrupa && this.izabranPredmet) {
      this.submitSelection.emit();
    }
  }

  onNew(): void {
    this.createNew.emit();
  }
}

import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PredavanjeService } from '../predavanje.service';
import { GrupaInfo, PredmetInfo, StartPredavanjeCmd } from '../../models/model';
import { AppRoutes } from 'src/app/features/privremeno/app-putanje';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-start-predavanje',
    templateUrl: './start-predavanje.component.html',
    styleUrls: ['./start-predavanje.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule]
})
export class StartPredavanjeComponent implements OnInit {
  private predavanjeService = inject(PredavanjeService);
  private router = inject(Router);


  grupe: GrupaInfo[] = [];
  predmeti: PredmetInfo[] = [];
  izabranaGrupa : number = 0;
  izabranPredmet : number= 0;

  ngOnInit(): void {
    this.loadGroupsAndSubjects();
  }

  // Fetch groups and subjects from the service
  loadGroupsAndSubjects(): void {
    // Fetch groups
    this.predavanjeService.getGrupe().subscribe(
      (groups) => {
        this.grupe = groups;
      },
      (error) => {
        console.error('Error fetching groups', error);
      }
    );

    // Fetch subjects
    this.predavanjeService.getPredmeti().subscribe(
      (subjects) => {
        this.predmeti = subjects;
      },
      (error) => {
        console.error('Error fetching subjects', error);
      }
    );
  }

  // Start the lecture with selected group and subject
  startLecture(): void {
    if (this.izabranaGrupa && this.izabranPredmet) {

      const cmd : StartPredavanjeCmd = { predmetId: this.izabranPredmet, grupaId: this.izabranaGrupa };

      this.predavanjeService.startPredavanje(cmd).subscribe(
        (predavanje) => {
          this.router.navigateByUrl(AppRoutes.predavanjeLive(predavanje.id))

        },
        (error) => {
          console.error('Error starting lecture', error);
        }
      );
    }
  }
}

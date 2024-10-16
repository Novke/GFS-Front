import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PredavanjeService } from '../predavanje.service';
import { GrupaInfo, PredmetInfo, StartPredavanjeCmd } from '../../models/predavanje.model';

@Component({
  selector: 'app-start-predavanje',
  templateUrl: './start-predavanje.component.html',
  styleUrls: ['./start-predavanje.component.css']
})
export class StartPredavanjeComponent implements OnInit {

  grupe: GrupaInfo[] = [];
  predmeti: PredmetInfo[] = [];
  izabranaGrupa : number = 0;
  izabranPredmet : number= 0;


  constructor(private predavanjeService: PredavanjeService, private router: Router) {}

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

      console.log("Started lecture with", cmd)

      this.predavanjeService.startPredavanje(cmd).subscribe(
        (predavanje) => {
          console.log('Lecture started successfully:', predavanje);
          
          this.router.navigate(['/predavanje','live', predavanje.id])

        },
        (error) => {
          console.error('Error starting lecture', error);
        }
      );
    }
  }
}

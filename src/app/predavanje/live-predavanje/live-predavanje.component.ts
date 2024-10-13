import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-live-predavanje',
  templateUrl: './live-predavanje.component.html',
  styleUrls: ['./live-predavanje.component.css']
})
export class LivePredavanjeComponent implements OnInit {

  lectureId: number | null = null;

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      this.lectureId = id !== null ? Number(id) : null;

      if (!this.lectureId) console.log("NIJE BROJ!!!")
    });
  }

}

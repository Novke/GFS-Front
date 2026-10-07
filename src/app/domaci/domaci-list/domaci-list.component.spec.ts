import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DomaciListComponent } from './domaci-list.component';

describe('DomaciListComponent', () => {
  let component: DomaciListComponent;
  let fixture: ComponentFixture<DomaciListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [DomaciListComponent]
});
    fixture = TestBed.createComponent(DomaciListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

import { StationsRoutingModule } from './stations-routing.module';
import { StationListComponent } from './components/station-list/station-list.component';

@NgModule({
  declarations: [StationListComponent],
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    StationsRoutingModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatDialogModule, MatProgressBarModule, MatChipsModule,
    MatTooltipModule, MatDividerModule,
  ],
})
export class StationsModule {}

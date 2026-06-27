import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';

import { StationLightsRoutingModule } from './station-lights-routing.module';
import { StationLightsComponent } from './components/station-lights/station-lights.component';

@NgModule({
  declarations: [StationLightsComponent],
  imports: [
    CommonModule,
    FormsModule,
    StationLightsRoutingModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTooltipModule,
  ],
})
export class StationLightsModule {}

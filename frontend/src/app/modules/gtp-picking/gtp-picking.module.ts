import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatRippleModule } from '@angular/material/core';

import { GtpPickingRoutingModule } from './gtp-picking-routing.module';
import { PickingShellComponent } from './components/picking-shell/picking-shell.component';
import { PicklistStatusComponent } from './components/picklist-status/picklist-status.component';

@NgModule({
  declarations: [PickingShellComponent, PicklistStatusComponent],
  imports: [
    CommonModule,
    FormsModule,
    GtpPickingRoutingModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatRippleModule,
  ],
})
export class GtpPickingModule {}

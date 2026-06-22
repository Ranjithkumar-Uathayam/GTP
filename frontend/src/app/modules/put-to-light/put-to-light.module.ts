import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { PutToLightRoutingModule } from './put-to-light-routing.module';
import { StationViewComponent } from './components/station-view/station-view.component';
import { BinDisplayComponent } from './components/bin-display/bin-display.component';
import { OperatorPanelComponent } from './components/operator-panel/operator-panel.component';
import { PtlBoardComponent } from './components/ptl-board/ptl-board.component';

@NgModule({
  declarations: [StationViewComponent, BinDisplayComponent, OperatorPanelComponent, PtlBoardComponent],
  imports: [
    CommonModule, FormsModule,
    PutToLightRoutingModule,
    MatCardModule, MatButtonModule, MatIconModule, MatSelectModule,
    MatFormFieldModule, MatProgressBarModule, MatProgressSpinnerModule,
    MatDividerModule, MatTooltipModule, MatDialogModule, MatChipsModule,
    MatTabsModule, MatListModule,
  ],
})
export class PutToLightModule {}

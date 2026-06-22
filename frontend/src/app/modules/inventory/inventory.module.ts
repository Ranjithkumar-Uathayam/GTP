import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ReactiveFormsModule } from '@angular/forms';

import { InventoryRoutingModule } from './inventory-routing.module';
import { InventoryListComponent } from './components/inventory-list/inventory-list.component';
import { AdjustStockDialogComponent } from './components/adjust-stock-dialog/adjust-stock-dialog.component';

@NgModule({
  declarations: [InventoryListComponent, AdjustStockDialogComponent],
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, RouterModule,
    InventoryRoutingModule,
    MatTableModule, MatPaginatorModule, MatCardModule, MatButtonModule,
    MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatProgressBarModule, MatChipsModule, MatDialogModule, MatTooltipModule,
  ],
})
export class InventoryModule {}

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatStepperModule } from '@angular/material/stepper';
import { MatListModule } from '@angular/material/list';

import { OrdersRoutingModule } from './orders-routing.module';
import { OrderListComponent } from './components/order-list/order-list.component';
import { OrderDetailComponent } from './components/order-detail/order-detail.component';
import { OrderCreateDialogComponent } from './components/order-create/order-create-dialog.component';

@NgModule({
  declarations: [OrderListComponent, OrderDetailComponent, OrderCreateDialogComponent],
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, RouterModule,
    OrdersRoutingModule,
    MatTableModule, MatPaginatorModule, MatSortModule, MatCardModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatChipsModule, MatProgressBarModule, MatDialogModule,
    MatDividerModule, MatTooltipModule, MatStepperModule, MatListModule,
  ],
})
export class OrdersModule {}

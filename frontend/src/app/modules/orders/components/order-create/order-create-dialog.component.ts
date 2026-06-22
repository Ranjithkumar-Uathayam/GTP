import { Component } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { ApiService } from '../../../../core/services/api.service';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-order-create-dialog',
  templateUrl: './order-create-dialog.component.html',
  styleUrls: ['./order-create-dialog.component.scss'],
})
export class OrderCreateDialogComponent {
  form: FormGroup;
  saving = false;

  constructor(
    private fb:     FormBuilder,
    private api:    ApiService,
    private notify: NotificationService,
    public  dialogRef: MatDialogRef<OrderCreateDialogComponent>,
  ) {
    this.form = this.fb.group({
      orderNumber:  ['', Validators.required],
      customerCode: [''],
      customerName: [''],
      priority:     [1],
      notes:        [''],
      items:        this.fb.array([this.newItem()]),
    });
  }

  get items(): FormArray { return this.form.get('items') as FormArray; }

  newItem(): FormGroup {
    return this.fb.group({
      itemCode:    ['', Validators.required],
      itemName:    ['', Validators.required],
      requiredQty: [1,  [Validators.required, Validators.min(1)]],
      uom:         ['PCS'],
    });
  }

  addItem(): void { this.items.push(this.newItem()); }

  removeItem(i: number): void { if (this.items.length > 1) this.items.removeAt(i); }

  submit(): void {
    if (this.form.invalid) return;
    this.saving = true;
    this.api.createOrder(this.form.value).subscribe({
      next: (r) => {
        this.notify.success(`Order ${r.data.OrderNumber} created`);
        this.dialogRef.close(r.data);
      },
      error: (err) => {
        this.notify.error(err.error?.message || 'Failed to create order');
        this.saving = false;
      },
    });
  }
}

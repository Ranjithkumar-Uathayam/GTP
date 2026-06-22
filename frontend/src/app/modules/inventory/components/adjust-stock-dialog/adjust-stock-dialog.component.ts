import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ApiService } from '../../../../core/services/api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { InventoryItem } from '../../../../core/models';

@Component({
  selector: 'app-adjust-stock-dialog',
  template: `
    <h2 mat-dialog-title>Adjust Stock — {{ item.ItemCode }}</h2>
    <mat-dialog-content [formGroup]="form">
      <p class="item-name">{{ item.ItemName }}</p>
      <p class="current-qty">Current: <strong>{{ item.AvailableQty }}</strong> | Free: <strong>{{ item.FreeQty }}</strong></p>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Adjustment (+ or −)</mat-label>
        <input matInput type="number" formControlName="delta" placeholder="+10 or -5">
        <mat-hint>Positive to add stock, negative to remove</mat-hint>
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%;margin-top:12px">
        <mat-label>Reason</mat-label>
        <input matInput formControlName="reason" placeholder="e.g. Received shipment">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" (click)="submit()"
              [disabled]="form.invalid || saving">
        {{ saving ? 'Saving...' : 'Apply' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.item-name { font-weight:500; margin-bottom:4px; } .current-qty { color:#757575; font-size:13px; margin-bottom:12px; }'],
})
export class AdjustStockDialogComponent {
  form: FormGroup;
  saving = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public item: InventoryItem,
    private fb:     FormBuilder,
    private api:    ApiService,
    private notify: NotificationService,
    public  dialogRef: MatDialogRef<AdjustStockDialogComponent>,
  ) {
    this.form = this.fb.group({
      delta:  [null, [Validators.required]],
      reason: [''],
    });
  }

  submit(): void {
    if (this.form.invalid) return;
    this.saving = true;
    const { delta, reason } = this.form.value;
    this.api.adjustStock(this.item.ItemCode, parseFloat(delta), reason).subscribe({
      next: () => {
        this.notify.success('Stock adjusted');
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.notify.error(err.error?.message || 'Failed');
        this.saving = false;
      },
    });
  }
}

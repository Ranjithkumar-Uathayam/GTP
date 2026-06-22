import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Order, OrderItem } from '../../../../core/models';

@Component({
  selector: 'app-operator-panel',
  templateUrl: './operator-panel.component.html',
  styleUrls: ['./operator-panel.component.scss'],
})
export class OperatorPanelComponent {
  @Input() activeOrder: Order | null = null;
  @Input() currentItem: OrderItem | null = null;
  @Input() confirming = false;
  @Input() totalProgress = 0;
  @Output() onConfirm  = new EventEmitter<void>();
  @Output() onComplete = new EventEmitter<void>();
  @Output() onCancel   = new EventEmitter<void>();

  get completedItems(): number {
    return this.activeOrder?.items?.filter(i => i.Status === 'Completed').length ?? 0;
  }

  get remainingItems(): OrderItem[] {
    return this.activeOrder?.items?.filter(i => i.Status !== 'Completed' && i.Status !== 'Skipped') ?? [];
  }
}

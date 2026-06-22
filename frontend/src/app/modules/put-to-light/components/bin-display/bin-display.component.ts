import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { Bin, PTLSession } from '../../../../core/models';

@Component({
  selector: 'app-bin-display',
  templateUrl: './bin-display.component.html',
  styleUrls: ['./bin-display.component.scss'],
})
export class BinDisplayComponent implements OnChanges {
  @Input() bins: Bin[] = [];
  @Input() activeOrderId: number | undefined;
  @Output() binSelected = new EventEmitter<PTLSession>();

  grid: Bin[][] = [];
  maxRow = 0;
  maxCol = 0;

  ngOnChanges(): void {
    this.buildGrid();
  }

  buildGrid(): void {
    if (!this.bins.length) { this.grid = []; return; }

    this.maxRow = Math.max(...this.bins.map(b => b.BinRow));
    this.maxCol = Math.max(...this.bins.map(b => b.BinColumn));

    this.grid = [];
    for (let r = 1; r <= this.maxRow; r++) {
      const row: Bin[] = [];
      for (let c = 1; c <= this.maxCol; c++) {
        const bin = this.bins.find(b => b.BinRow === r && b.BinColumn === c);
        if (bin) row.push(bin);
      }
      if (row.length) this.grid.push(row);
    }
  }

  getBinClass(bin: Bin): string {
    if (!bin.IsActive) return 'inactive';
    if (bin.CurrentOrderID === this.activeOrderId && this.activeOrderId) return 'selected-bin';
    if (!bin.CurrentOrderID) return 'free';
    if (bin.Priority === 3) return 'urgent';
    return 'active';
  }

  onBinClick(bin: Bin): void {
    if (bin.CurrentOrderID) {
      this.binSelected.emit({
        OrderID:     bin.CurrentOrderID,
        OrderNumber: bin.OrderNumber || '',
        CustomerName: bin.CustomerName,
        Priority:    bin.Priority || 1,
        Status:      bin.OrderStatus || '',
        TotalItems:  bin.TotalItems || 0,
        PutItems:    bin.PutItems || 0,
        StartedAt:   '',
        BinID:       bin.BinID,
        BinCode:     bin.BinCode,
        BinRow:      bin.BinRow,
        BinColumn:   bin.BinColumn,
        LightColor:  bin.LightColor,
        StationID:   bin.StationID,
        StationCode: '',
        StationName: '',
      } as PTLSession);
    }
  }

  binProgress(bin: Bin): number {
    if (!bin.TotalItems) return 0;
    return Math.round(((bin.PutItems || 0) / bin.TotalItems) * 100);
  }

  gridStyle(): Record<string, string> {
    return {
      'grid-template-columns': `repeat(${this.maxCol}, 1fr)`,
    };
  }
}

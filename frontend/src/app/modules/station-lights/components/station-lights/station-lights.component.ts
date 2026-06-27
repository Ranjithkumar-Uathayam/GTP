import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LightService, StationLightRow, StationLightUpdate } from '../../../../services/light.service';

interface PartySlot {
  partyId:     number;       // 1..4
  channel:     number;
  channelName: string;
  cardCode:    string | null;
  status:      'ON' | 'OFF' | 'IDLE';
  partyStatus: 'ACTIVE' | 'COMPLETED' | 'OFF' | 'IDLE';
  totalQty:    number;
  pickedQty:   number;
  remainingQty:number;
  updatedTime: string | null;
}

interface StationPanel {
  stationId:  string;
  sessionId:  number | null;
  picklistId: string | null;
  slots:      PartySlot[];
}

const STATION_IDS = ['STN-01', 'STN-02'];
const STATION_LABELS: Record<string, string> = {
  'STN-01': 'Station A',
  'STN-02': 'Station B',
};

@Component({
  selector:        'app-station-lights',
  templateUrl:     './station-lights.component.html',
  styleUrls:       ['./station-lights.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StationLightsComponent implements OnInit, OnDestroy {
  stations: StationPanel[] = STATION_IDS.map(id => this._emptyPanel(id));
  selectedStation = 'STN-01';
  resetting = false;

  private destroy$ = new Subject<void>();

  constructor(
    private lightSvc: LightService,
    private cdr:      ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Load initial state from REST for each station
    STATION_IDS.forEach(sid => {
      this.lightSvc.fetchStatus(sid).subscribe({
        next: res => {
          this._applyRows(sid, null, res.data);
          this.cdr.markForCheck();
        },
        error: () => {},
      });
    });

    // Subscribe to live Socket.IO updates
    this.lightSvc.update$.pipe(takeUntil(this.destroy$)).subscribe(update => {
      if (!update) return;
      this._applyRows(update.stationId, update.sessionId, update.lights);
      this.cdr.markForCheck();
    });
  }

  get activePanel(): StationPanel {
    return this.stations.find(s => s.stationId === this.selectedStation)!;
  }

  stationLabel(id: string): string { return STATION_LABELS[id] || id; }

  onLitCount(panel: StationPanel): number {
    return panel.slots.filter(s => s.status === 'ON').length;
  }

  resetLights(): void {
    const sessionId = this.activePanel?.sessionId;
    if (!sessionId) return;
    this.resetting = true;
    this.lightSvc.resetLights(sessionId).subscribe({
      next: () => { this.resetting = false; this.cdr.markForCheck(); },
      error: () => { this.resetting = false; this.cdr.markForCheck(); },
    });
  }

  trackByParty(_: number, slot: PartySlot): number { return slot.partyId; }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _emptyPanel(stationId: string): StationPanel {
    return {
      stationId,
      sessionId:  null,
      picklistId: null,
      slots: [1, 2, 3, 4].map(p => ({
        partyId:     p,
        channel:     stationId === 'STN-01' ? p - 1 : p + 3,
        channelName: stationId === 'STN-01' ? `D${p - 1}` : `D${p + 3}`,
        cardCode:    null,
        status:      'IDLE' as const,
        partyStatus: 'IDLE' as const,
        totalQty:    0,
        pickedQty:   0,
        remainingQty:0,
        updatedTime: null,
      })),
    };
  }

  private _applyRows(stationId: string, sessionId: number | null, rows: StationLightRow[]): void {
    const idx = this.stations.findIndex(s => s.stationId === stationId);
    if (idx === -1) return;

    const panel   = this._emptyPanel(stationId);
    panel.sessionId = sessionId;

    if (rows.length) {
      panel.picklistId = rows[0].PicklistId ?? null;
      for (const r of rows) {
        const slot = panel.slots.find(s => s.partyId === r.PartyId);
        if (slot) {
          slot.cardCode     = r.CardCode;
          slot.channel      = r.Channel;
          slot.channelName  = r.ChannelName;
          slot.status       = r.Status;
          slot.partyStatus  = r.PartyStatus ?? (r.Status === 'ON' ? 'ACTIVE' : 'OFF');
          slot.totalQty     = r.TotalQty    ?? 0;
          slot.pickedQty    = r.PickedQty   ?? 0;
          slot.remainingQty = r.RemainingQty ?? 0;
          slot.updatedTime  = r.UpdatedTime;
        }
      }
    }

    this.stations = [
      ...this.stations.slice(0, idx),
      panel,
      ...this.stations.slice(idx + 1),
    ];
  }
}

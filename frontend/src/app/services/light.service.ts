import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

export interface StationLightRow {
  StatusID:    number;
  SessionID:   number;
  StationId:   string;
  PicklistId:  string | null;
  CardCode:    string;
  PartyId:     number;      // 1..4
  Channel:     number;      // 0..7
  ChannelName: string;      // D0..D7
  Status:      'ON' | 'OFF';
  UpdatedTime: string;
  // Quantity data joined from GTP_PickProgress
  TotalQty:    number;
  PickedQty:   number;
  RemainingQty:number;
  PartyStatus: 'ACTIVE' | 'COMPLETED' | 'OFF';
}

export interface StationLightUpdate {
  sessionId: number | null;
  stationId: string;
  lights:    StationLightRow[];
}

@Injectable({ providedIn: 'root' })
export class LightService implements OnDestroy {
  private socket: Socket;

  // Keyed by stationId → latest update payload
  private _updates = new Map<string, StationLightUpdate>();
  private _update$ = new BehaviorSubject<StationLightUpdate | null>(null);

  readonly update$: Observable<StationLightUpdate | null> = this._update$.asObservable();

  constructor(private http: HttpClient) {
    this.socket = io(environment.socketUrl, { transports: ['websocket', 'polling'] });

    this.socket.on('station-light-update', (data: StationLightUpdate) => {
      this._updates.set(data.stationId, data);
      this._update$.next(data);
    });

    this.socket.on('connect', () => {
      // Request current state for default stations
      this.socket.emit('request-lights', { stationId: 'STN-01' });
      this.socket.emit('request-lights', { stationId: 'STN-02' });
    });
  }

  getLightsForStation(stationId: string): StationLightRow[] {
    return this._updates.get(stationId)?.lights ?? [];
  }

  getSessionId(stationId: string): number | null {
    return this._updates.get(stationId)?.sessionId ?? null;
  }

  /** Fetch current status from REST (initial load) */
  fetchStatus(stationId: string, sessionId?: number): Observable<{ success: boolean; data: StationLightRow[] }> {
    const params = sessionId ? `?sessionId=${sessionId}` : '';
    return this.http.get<{ success: boolean; data: StationLightRow[] }>(
      `${environment.apiUrl}/picking/lights/${stationId}${params}`
    );
  }

  /** Manual reset via REST */
  resetLights(sessionId: number): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${environment.apiUrl}/picking/session/${sessionId}/lights/reset`,
      {}
    );
  }

  ngOnDestroy(): void {
    this.socket.disconnect();
  }
}

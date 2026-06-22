import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ApiService } from '../../../../core/services/api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { WebsocketService } from '../../../../core/services/websocket.service';
import { Station, Bin } from '../../../../core/models';

@Component({
  selector: 'app-station-list',
  templateUrl: './station-list.component.html',
  styleUrls: ['./station-list.component.scss'],
})
export class StationListComponent implements OnInit {
  stations: Station[] = [];
  selectedStation: Station | null = null;
  loading = false;

  showCreateForm = false;
  showAddBin     = false;

  stationForm: FormGroup;
  binForm:     FormGroup;

  saving = false;

  constructor(
    private fb:     FormBuilder,
    private api:    ApiService,
    private notify: NotificationService,
    private ws:     WebsocketService,
  ) {
    this.stationForm = this.fb.group({
      stationCode: ['', Validators.required],
      stationName: ['', Validators.required],
      description: [''],
    });

    this.binForm = this.fb.group({
      binCode:    ['', Validators.required],
      binRow:     [1,  [Validators.required, Validators.min(1)]],
      binColumn:  [1,  [Validators.required, Validators.min(1)]],
      lightColor: ['green'],
    });
  }

  ngOnInit(): void {
    this.loadStations();
    this.ws.on('STATION_UPDATE').subscribe(() => {
      if (this.selectedStation) this.selectStation(this.selectedStation.StationID);
    });
  }

  loadStations(): void {
    this.loading = true;
    this.api.getStations().subscribe({
      next: (r) => { this.stations = r.data; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  selectStation(id: number): void {
    this.api.getStation(id).subscribe((r) => { this.selectedStation = r.data; });
  }

  createStation(): void {
    if (this.stationForm.invalid) return;
    this.saving = true;
    this.api.createStation(this.stationForm.value).subscribe({
      next: () => {
        this.notify.success('Station created');
        this.stationForm.reset();
        this.showCreateForm = false;
        this.saving = false;
        this.loadStations();
      },
      error: (err) => { this.notify.error(err.error?.message || 'Failed'); this.saving = false; },
    });
  }

  addBin(): void {
    if (!this.selectedStation || this.binForm.invalid) return;
    this.saving = true;
    this.api.addBin(this.selectedStation.StationID, this.binForm.value).subscribe({
      next: () => {
        this.notify.success('Bin added');
        this.binForm.patchValue({ binCode: '' });
        this.showAddBin = false;
        this.saving = false;
        this.selectStation(this.selectedStation!.StationID);
      },
      error: (err) => { this.notify.error(err.error?.message || 'Failed'); this.saving = false; },
    });
  }

  getBinClass(bin: Bin): string {
    if (!bin.IsActive) return 'inactive';
    if (!bin.CurrentOrderID) return 'free';
    return 'active';
  }

  stationUtil(s: Station): number {
    if (!s.TotalBins) return 0;
    return Math.round(((s.ActiveBins || 0) / s.TotalBins) * 100);
  }
}

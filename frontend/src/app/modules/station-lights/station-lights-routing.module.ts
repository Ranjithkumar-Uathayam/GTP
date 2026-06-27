import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StationLightsComponent } from './components/station-lights/station-lights.component';

const routes: Routes = [
  { path: '', component: StationLightsComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class StationLightsRoutingModule {}

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StationListComponent } from './components/station-list/station-list.component';

const routes: Routes = [{ path: '', component: StationListComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class StationsRoutingModule {}

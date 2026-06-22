import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StationViewComponent } from './components/station-view/station-view.component';

const routes: Routes = [{ path: '', component: StationViewComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PutToLightRoutingModule {}

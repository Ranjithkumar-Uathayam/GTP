import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PickingShellComponent } from './components/picking-shell/picking-shell.component';
import { PicklistStatusComponent } from './components/picklist-status/picklist-status.component';

const routes: Routes = [
  { path: '',       component: PickingShellComponent  },
  { path: 'status', component: PicklistStatusComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class GtpPickingRoutingModule {}

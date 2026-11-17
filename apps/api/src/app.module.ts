import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CoreModule } from './core/core.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { LeaveModule } from './leave/leave.module.js';
import { MeModule } from './me/me.module.js';
import { OrgModule } from './org/org.module.js';
import { PeopleModule } from './people/people.module.js';
import { PlanningModule } from './planning/planning.module.js';
import { TimeclockModule } from './timeclock/timeclock.module.js';

// One module per area of the application. See docs/architecture.md, section 3.
@Module({
  imports: [
    CoreModule,
    AuthModule,
    OrgModule,
    PeopleModule,
    DevicesModule,
    PlanningModule,
    TimeclockModule,
    LeaveModule,
    MeModule,
  ],
})
export class AppModule {}

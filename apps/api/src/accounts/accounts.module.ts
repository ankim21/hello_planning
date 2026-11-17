import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

@Module({
  controllers: [AccountsController, EmployeesController],
  providers: [AccountsService, EmployeesService],
})
export class AccountsModule {}

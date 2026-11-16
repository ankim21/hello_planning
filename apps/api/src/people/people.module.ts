import { Module } from '@nestjs/common';
import { PeopleController } from './people.controller.js';

@Module({ controllers: [PeopleController] })
export class PeopleModule {}

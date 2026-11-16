import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { config } from '../config.js';
import { AccessService } from '../access/access.service.js';
import { SessionGuard } from '../access/session.guard.js';
import { AuditService } from './audit.service.js';
import { PrismaService } from './prisma.service.js';

export const SESSION_DAYS = 30;

/** Services every other module needs: database, audit, login check, rights. */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: config.JWT_SECRET,
      signOptions: { expiresIn: `${SESSION_DAYS}d` },
    }),
  ],
  providers: [PrismaService, AuditService, AccessService, SessionGuard],
  exports: [PrismaService, AuditService, AccessService, SessionGuard, JwtModule],
})
export class CoreModule {}

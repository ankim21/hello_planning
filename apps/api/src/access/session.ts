import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Grant } from './permissions.js';

export const SESSION_COOKIE = 'session';

/** The logged-in person, attached to the request by SessionGuard. */
export interface SessionUser {
  id: string;
  email: string;
  employeeId: string | null;
  /** Still on the temporary password given by an administrator. */
  mustChangePassword: boolean;
  grants: Grant[];
}

/** Use as a controller parameter: `@CurrentUser() user: SessionUser`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser =>
    context.switchToHttp().getRequest().user,
);

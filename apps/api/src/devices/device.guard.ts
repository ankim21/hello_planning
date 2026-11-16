import { createHash } from 'node:crypto';
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma.service.js';

export const DEVICE_HEADER = 'x-device-token';

/** The tablet making the request, attached by DeviceGuard. */
export interface CurrentDeviceInfo {
  id: string;
  name: string;
  siteId: string;
}

// The token is long and random, so a fast hash is enough (unlike passwords).
export const hashDeviceToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** Requires the token of a registered, non-revoked tablet. */
@Injectable()
export class DeviceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers[DEVICE_HEADER];
    if (typeof token !== 'string' || !token) throw new UnauthorizedException();

    const device = await this.prisma.device.findUnique({
      where: { tokenHash: hashDeviceToken(token) },
    });
    if (!device || device.revokedAt) throw new UnauthorizedException();

    const info: CurrentDeviceInfo = {
      id: device.id,
      name: device.name,
      siteId: device.siteId,
    };
    request.device = info;
    return true;
  }
}

export const CurrentDevice = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentDeviceInfo =>
    context.switchToHttp().getRequest().device,
);

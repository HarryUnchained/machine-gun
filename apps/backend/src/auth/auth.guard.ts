import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers['authorization'];
    const token = typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : undefined;
    const validToken = process.env.API_KEY || 'my-super-secret-key';

    if (token !== validToken) {
      throw new UnauthorizedException('Auth failed');
    }

    return true;
  }
}

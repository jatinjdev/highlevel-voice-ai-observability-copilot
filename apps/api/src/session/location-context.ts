import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export interface LocationContextRequest {
  headers: { authorization?: string };
  query: Record<string, unknown>;
  locationContext?: {
    locationId: string;
    userId: string | null;
    source: 'marketplace_session' | 'development_query';
  };
}

export const LocationContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<LocationContextRequest>();
    if (!request.locationContext) throw new Error('Location context guard was not applied.');
    return request.locationContext.locationId;
  },
);

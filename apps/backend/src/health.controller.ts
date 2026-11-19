import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @Version(VERSION_NEUTRAL)
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({ description: 'The API is available.' })
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

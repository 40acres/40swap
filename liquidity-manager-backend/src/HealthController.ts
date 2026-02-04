import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { Public } from './PublicDecorator.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
    constructor(private health: HealthCheckService) {}

    @Get()
    @Public()
    @HealthCheck()
    check(): Promise<HealthCheckResult> {
        return this.health.check([]);
    }
}

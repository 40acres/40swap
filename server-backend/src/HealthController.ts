import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
    constructor(
        private health: HealthCheckService,
    ) {}

    @Get()
    @HealthCheck()
    check(): Promise<HealthCheckResult> {
        return this.health.check([]);
    }

}
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { JobsModule } from './jobs/jobs.module';
import { DlqModule } from './dlq/dlq.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    DatabaseModule,
    RedisModule,
    LifecycleModule,
    JobsModule,
    DlqModule,
    WorkflowsModule,
    EventsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

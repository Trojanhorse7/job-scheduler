import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { WorkerService } from './worker/worker.service';
import { HandlerRegistry, createDefaultRegistry } from './worker/handlers';
import { DataSource } from 'typeorm';

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
  ],
  providers: [
    {
      provide: HandlerRegistry,
      useFactory: (ds: DataSource) => createDefaultRegistry(),
      inject: [DataSource],
    },
    WorkerService,
  ],
})
export class WorkerModule {}

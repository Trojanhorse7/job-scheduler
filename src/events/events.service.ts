import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Subject } from 'rxjs';
import Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';
import { REDIS_CHANNEL } from '../common/enums';

export interface JobEvent {
  event: string;
  jobId: string;
  status: string | null;
  [key: string]: unknown;
}

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private subscriber!: Redis;
  readonly events$ = new Subject<JobEvent>();

  constructor(
    private readonly redis: RedisService,
    @InjectPinoLogger(EventsService.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.subscriber = this.redis.createSubscriber();
    this.subscriber.subscribe(REDIS_CHANNEL, (err) => {
      if (err) this.logger.error({ err }, 'Redis subscribe error');
      else this.logger.info({ channel: REDIS_CHANNEL }, 'Subscribed to job events');
    });
    this.subscriber.on('message', (_channel, raw) => {
      try {
        const payload = JSON.parse(raw) as JobEvent;
        this.events$.next(payload);
      } catch {
        this.logger.warn({ raw }, 'Failed to parse job event');
      }
    });
  }

  onModuleDestroy(): void {
    this.events$.complete();
    void this.subscriber.quit();
  }
}

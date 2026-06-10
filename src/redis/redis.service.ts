import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  constructor(@InjectPinoLogger(RedisService.name) private readonly logger: PinoLogger) {}

  onModuleInit(): void {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });
    this.client.on('error', (err) => this.logger.error({ err }, 'Redis client error'));
    this.client.on('connect', () => this.logger.info('Redis connected'));
  }

  onModuleDestroy(): void {
    void this.client.quit();
  }

  async publish(channel: string, data: unknown): Promise<void> {
    await this.client.publish(channel, JSON.stringify(data));
  }

  /** Create a dedicated subscriber client (caller is responsible for cleanup). */
  createSubscriber(): Redis {
    return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }
}

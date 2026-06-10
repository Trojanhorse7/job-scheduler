import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from '../entities/job.entity';
import { DlqService } from './dlq.service';
import { DlqController } from './dlq.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Job])],
  providers: [DlqService],
  controllers: [DlqController],
})
export class DlqModule {}

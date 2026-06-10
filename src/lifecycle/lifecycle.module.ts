import { Global, Module } from '@nestjs/common';
import { JobLifecycleService } from './lifecycle.service';

@Global()
@Module({
  providers: [JobLifecycleService],
  exports: [JobLifecycleService],
})
export class LifecycleModule {}

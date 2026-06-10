import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDataSourceOptions, entities } from './data-source';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot(getDataSourceOptions()),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

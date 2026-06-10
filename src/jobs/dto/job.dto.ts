import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, IsEnum, IsISO8601,
  IsObject, IsArray, Min, Max,
} from 'class-validator';
import { JobPriority, JobInterval } from '../../common/enums';

export class CreateJobDto {
  @ApiProperty() @IsString() type!: string;
  @ApiPropertyOptional() @IsObject() @IsOptional() payload?: Record<string, unknown>;
  @ApiPropertyOptional({ enum: JobPriority, default: JobPriority.MEDIUM })
  @IsInt() @Min(1) @Max(3) @IsOptional() priority?: number;
  @ApiPropertyOptional() @IsISO8601() @IsOptional() scheduledAt?: string;
  @ApiPropertyOptional({ enum: JobInterval }) @IsEnum(JobInterval) @IsOptional() interval?: JobInterval;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(10) @IsOptional() maxRetries?: number;
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsOptional() dependsOn?: string[];
}

export class JobResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() status!: string;
  @ApiProperty() priority!: number;
  @ApiProperty() effectivePriority!: number;
  @ApiProperty() retryCount!: number;
  @ApiProperty() maxRetries!: number;
  @ApiProperty() scheduledAt!: Date;
  @ApiPropertyOptional() interval!: string | null;
  @ApiPropertyOptional() errorMessage!: string | null;
  @ApiProperty() inDlq!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

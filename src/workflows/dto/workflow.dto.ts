import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, ValidateNested, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class WorkflowStepDto {
  @ApiProperty() @IsString() key!: string;
  @ApiProperty() @IsString() type!: string;
  @ApiPropertyOptional() @IsOptional() payload?: Record<string, unknown>;
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsOptional() dependsOn?: string[];
  @ApiPropertyOptional() @IsInt() @Min(1) @Max(3) @IsOptional() priority?: number;
}

export class CreateWorkflowDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ type: [WorkflowStepDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];
}

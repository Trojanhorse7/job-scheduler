import {
  Controller, Get, Post, Delete, Param, Body,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CreateJobDto, JobResponseDto } from './dto/job.dto';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new job' })
  @ApiResponse({ status: 201, type: JobResponseDto })
  create(@Body() dto: CreateJobDto) {
    return this.jobs.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all jobs' })
  findAll() {
    return this.jobs.findAll();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Job counts by status' })
  getStats() {
    return this.jobs.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.findOne(id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get job event timeline' })
  getLogs(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.getLogs(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a job' })
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.cancel(id);
  }
}

import { Controller, Get, Post, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/workflow.dto';

@ApiTags('workflows')
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a DAG workflow' })
  create(@Body() dto: CreateWorkflowDto) {
    return this.workflows.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all workflows' })
  findAll() {
    return this.workflows.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a workflow with its jobs' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflows.findOne(id);
  }
}

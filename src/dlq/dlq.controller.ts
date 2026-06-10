import { Controller, Get, Post, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DlqService } from './dlq.service';

@ApiTags('dlq')
@Controller('dlq')
export class DlqController {
  constructor(private readonly dlq: DlqService) {}

  @Get()
  @ApiOperation({ summary: 'List all dead-lettered jobs' })
  list() {
    return this.dlq.listDlq();
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a dead-lettered job' })
  retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.dlq.retry(id);
  }
}

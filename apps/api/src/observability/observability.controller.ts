import type {
  AgentReanalysisResponse,
  AnalysisBatchStatus,
  AgentAnalysisDetail,
  AgentCallPage,
  CallAnalysisDetail,
  ObservabilityDashboard,
} from '@copilot/contracts';
import {
  agentReanalysisRequestSchema,
  agentCallPageQuerySchema,
  createSuccessCriterionRequestSchema,
  updateSuccessCriterionRequestSchema,
} from '@copilot/contracts';
import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';

import { LocationContext } from '../session/location-context';
import { LocationContextGuard } from '../session/location-context.guard';
import { ObservabilityService } from './observability.service';
import { RecommendationCommandsService } from './recommendation-commands.service';
import { SuccessCriteriaService } from './success-criteria.service';

@Controller('observability')
@UseGuards(LocationContextGuard)
export class ObservabilityController {
  constructor(
    private readonly observabilityService: ObservabilityService,
    private readonly successCriteriaService: SuccessCriteriaService,
    private readonly recommendationCommands: RecommendationCommandsService,
  ) {}

  @Get()
  dashboard(@LocationContext() locationId: string): Promise<ObservabilityDashboard> {
    return this.observabilityService.dashboard(locationId);
  }

  @Get('agents')
  agents(@LocationContext() locationId: string): Promise<ObservabilityDashboard> {
    return this.observabilityService.dashboard(locationId);
  }

  @Get('agents/:agentId')
  agentDetail(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
  ): Promise<AgentAnalysisDetail> {
    return this.observabilityService.agentDetail(locationId, agentId);
  }

  @Get('agents/:agentId/calls')
  agentCalls(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Query() query: unknown,
  ): Promise<AgentCallPage> {
    const page = agentCallPageQuerySchema.parse(query);
    return this.observabilityService.agentCalls(locationId, agentId, page);
  }

  @Get('calls/:callId')
  callDetail(
    @LocationContext() locationId: string,
    @Param('callId') callId: string,
  ): Promise<CallAnalysisDetail> {
    return this.observabilityService.callDetail(locationId, callId);
  }

  @Post('calls/:callId/reanalyze')
  reanalyze(@LocationContext() locationId: string, @Param('callId') callId: string) {
    return this.observabilityService.reanalyze(locationId, callId);
  }

  @Post('agents/:agentId/reanalyze')
  reanalyzeAgent(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Body() body: unknown,
  ): Promise<AgentReanalysisResponse> {
    const { window } = agentReanalysisRequestSchema.parse(body);
    return this.observabilityService.reanalyzeAgent(locationId, agentId, window);
  }

  @Get('agents/:agentId/reanalysis/:batchId')
  reanalysisStatus(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Param('batchId') batchId: string,
  ): Promise<AnalysisBatchStatus> {
    return this.observabilityService.reanalysisStatus(locationId, agentId, batchId);
  }

  @Post('agents/:agentId/success-criteria')
  createSuccessCriterion(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Body() body: unknown,
  ) {
    const { name, description } = createSuccessCriterionRequestSchema.parse(body);
    return this.successCriteriaService.create(locationId, agentId, name, description);
  }

  @Put('agents/:agentId/success-criteria/:criterionId')
  updateSuccessCriterion(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Param('criterionId') criterionId: string,
    @Body() body: unknown,
  ) {
    const { description } = updateSuccessCriterionRequestSchema.parse(body);
    return this.successCriteriaService.update(locationId, agentId, criterionId, description);
  }

  @Delete('agents/:agentId/success-criteria/:criterionId')
  removeSuccessCriterion(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Param('criterionId') criterionId: string,
  ) {
    return this.successCriteriaService.remove(locationId, agentId, criterionId);
  }

  @Post('agents/:agentId/success-criteria/:criterionId/recommendation')
  generateRecommendation(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Param('criterionId') criterionId: string,
  ) {
    return this.recommendationCommands.generate(locationId, agentId, criterionId);
  }

  @Delete('agents/:agentId/success-criteria/:criterionId/recommendation')
  removeRecommendation(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Param('criterionId') criterionId: string,
  ) {
    return this.recommendationCommands.remove(locationId, agentId, criterionId);
  }
}

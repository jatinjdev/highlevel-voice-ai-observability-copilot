import type {
  AgentAnalysisRequestResponse,
  AgentAnalysisDetail,
  AgentCallPage,
  CallAnalysisDetail,
  ObservabilityDashboard,
} from '@copilot/contracts';
import {
  agentAnalysisRequestSchema,
  agentCallPageQuerySchema,
  createSuccessCriterionRequestSchema,
} from '@copilot/contracts';
import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { LocationContext } from '../session/location-context';
import { LocationContextGuard } from '../session/location-context.guard';
import { PipelineService } from '../pipeline/pipeline.service';
import { ObservabilityService } from './observability.service';
import { RecommendationCommandsService } from './recommendation-commands.service';
import { SuccessCriteriaService } from './success-criteria.service';

@Controller('observability')
@UseGuards(LocationContextGuard)
export class ObservabilityController {
  constructor(
    private readonly observabilityService: ObservabilityService,
    private readonly pipelineService: PipelineService,
    private readonly successCriteriaService: SuccessCriteriaService,
    private readonly recommendationCommands: RecommendationCommandsService,
  ) {}

  @Get('agents')
  agents(@LocationContext() locationId: string): Promise<ObservabilityDashboard> {
    return this.observabilityService.dashboard(locationId);
  }

  @Post('agents/discover')
  discoverAgents(@LocationContext() locationId: string) {
    return this.pipelineService.discoverAgents(locationId);
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

  @Post('calls/:callId/analyze')
  analyzeCall(@LocationContext() locationId: string, @Param('callId') callId: string) {
    return this.observabilityService.analyzeCall(locationId, callId);
  }

  @Post('agents/:agentId/analyze')
  analyzeAgent(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Body() body: unknown,
  ): Promise<AgentAnalysisRequestResponse> {
    const { window } = agentAnalysisRequestSchema.parse(body);
    return this.pipelineService.analyzeAgentWindow(locationId, agentId, window);
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

  @Delete('agents/:agentId/success-criteria/:criterionId')
  removeSuccessCriterion(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Param('criterionId') criterionId: string,
  ) {
    return this.successCriteriaService.remove(locationId, agentId, criterionId);
  }

  @Post('agents/:agentId/recommendations')
  generateRecommendations(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.recommendationCommands.generateAll(locationId, agentId);
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

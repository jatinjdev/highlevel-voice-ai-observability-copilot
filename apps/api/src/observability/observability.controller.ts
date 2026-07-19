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
  successCriterionDraftRequestSchema,
} from '@copilot/contracts';
import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';

import { LocationContext } from '../session/location-context';
import { LocationContextGuard } from '../session/location-context.guard';
import { ObservabilityService } from './observability.service';
import { SuccessCriteriaService } from './success-criteria.service';

@Controller('observability')
@UseGuards(LocationContextGuard)
export class ObservabilityController {
  constructor(
    private readonly observabilityService: ObservabilityService,
    private readonly successCriteriaService: SuccessCriteriaService,
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

  @Post('agents/:agentId/success-criteria/drafts')
  createSuccessCriterionDraft(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Body() body: unknown,
  ) {
    const { naturalLanguageRule } = successCriterionDraftRequestSchema.parse(body);
    return this.successCriteriaService.createDraft(locationId, agentId, naturalLanguageRule);
  }

  @Put('agents/:agentId/success-criteria/:criterionId')
  updateSuccessCriterionDraft(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Param('criterionId') criterionId: string,
    @Body() body: unknown,
  ) {
    const { naturalLanguageRule } = successCriterionDraftRequestSchema.parse(body);
    return this.successCriteriaService.updateDraft(
      locationId,
      agentId,
      criterionId,
      naturalLanguageRule,
    );
  }

  @Post('agents/:agentId/success-criteria/:criterionId/activate')
  activateSuccessCriterion(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Param('criterionId') criterionId: string,
  ) {
    return this.successCriteriaService.activate(locationId, agentId, criterionId);
  }

  @Post('agents/:agentId/success-criteria/:criterionId/retire')
  retireSuccessCriterion(
    @LocationContext() locationId: string,
    @Param('agentId') agentId: string,
    @Param('criterionId') criterionId: string,
  ) {
    return this.successCriteriaService.retire(locationId, agentId, criterionId);
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { SEOPlanData, trainingPlanImportSchema } from '@openathlete/shared';

import { PrismaService } from '../prisma/services/prisma.service';

@Injectable()
export class SeoPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async createTemporaryPlan(planData: unknown): Promise<{ token: string }> {
    // Validate plan data
    const validationResult = trainingPlanImportSchema.safeParse(planData);
    if (!validationResult.success) {
      throw new BadRequestException(
        `Invalid plan data: ${validationResult.error.message}`,
      );
    }

    const validatedPlanData = validationResult.data;

    // Create temporary plan with 7 days expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const temporaryPlan = await this.prisma.temporaryTrainingPlan.create({
      data: {
        planData: validatedPlanData,
        expiresAt,
      },
    });

    return { token: temporaryPlan.id };
  }

  async getTemporaryPlan(token: string): Promise<SEOPlanData> {
    const temporaryPlan = await this.prisma.temporaryTrainingPlan.findUnique({
      where: { id: token },
    });

    if (!temporaryPlan) {
      throw new NotFoundException('Plan not found');
    }

    // Check if expired
    if (new Date() > temporaryPlan.expiresAt) {
      throw new NotFoundException('Plan has expired');
    }

    // Check if already imported
    if (temporaryPlan.importedAt) {
      throw new BadRequestException('Plan has already been imported');
    }

    // Validate and return plan data
    const validationResult = trainingPlanImportSchema.safeParse(
      temporaryPlan.planData,
    );
    if (!validationResult.success) {
      throw new BadRequestException('Invalid plan data stored');
    }

    return validationResult.data;
  }
}

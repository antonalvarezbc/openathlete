import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  forwardRef,
} from '@nestjs/common';

import { EventTemplate } from '@openathlete/database';
import {
  CreateEventTemplateDto,
  Event,
  SPORT_TYPE,
  mapPrismaWorkoutToDto,
  mapWorkoutDtoToPrisma,
  startOfDay,
  workoutSchema,
} from '@openathlete/shared';

import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { TrainingLoadEstimationService } from '../../queue/services/training-load-estimation.service';
import { authorizePlanAthlete, findPlanWeek } from '../helpers/plan-access';
import { prepareWorkoutTargets } from '../helpers/workout-targets';
import { EVENT_INCLUDES } from './event-includes';
import { EventService } from './event.service';

@Injectable()
export class EventTemplateService {
  private readonly logger = new Logger(EventTemplateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private eventService: EventService,
    @Optional()
    @Inject(forwardRef(() => TrainingLoadEstimationService))
    private trainingLoadEstimationService?: TrainingLoadEstimationService,
  ) {}

  async getMyEventTemplates(user: AuthUser, search?: string) {
    const templates = await this.prisma.eventTemplate.findMany({
      where: {
        userId: user.userId,
        ...(search && {
          event: {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
        }),
      },
      include: {
        event: {
          include: EVENT_INCLUDES,
        },
        folder: true,
      },
    });
    return templates.map((t) => ({
      ...t,
      event: this.eventService.prismaEventToEvent(t.event),
    }));
  }

  async createEventTemplate(user: AuthUser, body: CreateEventTemplateDto) {
    const source = (await this.eventService.getEventById(
      user,
      body.eventId,
    )) as Event;
    const sourceWorkout =
      source.type === 'TRAINING' ? source.workout : undefined;
    const portableSteps = sourceWorkout
      ? await prepareWorkoutTargets(
          this.prisma,
          workoutSchema.parse(sourceWorkout).steps,
          {
            athleteId: source.athleteId,
            sport:
              source.type === 'TRAINING' ? source.sport : SPORT_TYPE.RUNNING,
            portable: true,
          },
        )
      : undefined;
    const event = await this.eventService.duplicateEvent(user, body.eventId);

    await this.prisma.event.update({
      where: {
        eventId: event.eventId,
      },
      data: {
        athlete: {
          disconnect: true,
        },
      },
    });

    if (event.type === 'TRAINING') {
      await this.prisma.eventTraining.update({
        where: {
          eventId: event.eventId,
        },
        data: {
          estimatedLoad: null,
        },
      });
    }

    if (portableSteps) {
      const training = await this.prisma.eventTraining.findUniqueOrThrow({
        where: { eventId: event.eventId },
      });
      await this.prisma.workout.create({
        data: {
          eventTrainingId: training.eventTrainingId,
          ...mapWorkoutDtoToPrisma({ steps: portableSteps }),
        },
      });
    }

    const eventTemplate = await this.prisma.eventTemplate.create({
      data: {
        userId: user.userId,
        eventId: event.eventId,
        folderId: body.folderId,
      },
    });

    return eventTemplate;
  }

  async deleteEventTemplate(
    user: AuthUser,
    eventTemplateId: EventTemplate['eventTemplateId'],
  ) {
    const eventTemplate = await this.prisma.eventTemplate.findUnique({
      where: {
        eventTemplateId: eventTemplateId,
      },
    });

    if (!eventTemplate) {
      throw new Error('Event template not found');
    }

    if (eventTemplate.userId !== user.userId) {
      throw new Error('Unauthorized');
    }

    await this.prisma.eventTemplate.delete({
      where: {
        eventTemplateId: eventTemplateId,
      },
    });
  }

  async updateEventTemplate(
    user: AuthUser,
    eventTemplateId: EventTemplate['eventTemplateId'],
    data: { folderId?: number | null },
  ) {
    const eventTemplate = await this.prisma.eventTemplate.findUnique({
      where: {
        eventTemplateId: eventTemplateId,
      },
    });

    if (!eventTemplate) {
      throw new Error('Event template not found');
    }

    if (eventTemplate.userId !== user.userId) {
      throw new Error('Unauthorized');
    }

    const updated = await this.prisma.eventTemplate.update({
      where: {
        eventTemplateId: eventTemplateId,
      },
      data: {
        folderId: data.folderId,
      },
      include: {
        event: {
          include: EVENT_INCLUDES,
        },
        folder: true,
      },
    });

    return {
      ...updated,
      event: this.eventService.prismaEventToEvent(updated.event),
    };
  }

  /**
   * Create an event from a template with specific dates and athlete
   * POST /api/event-template/:templateId/use
   */
  async useEventTemplate(
    user: AuthUser,
    eventTemplateId: EventTemplate['eventTemplateId'],
    dto: {
      startDate: Date;
      endDate: Date;
      athleteId?: number | null;
      trainingPlanId?: number;
    },
  ) {
    // Get the template
    const template = await this.prisma.eventTemplate.findUnique({
      where: {
        eventTemplateId: eventTemplateId,
      },
      include: {
        event: {
          include: EVENT_INCLUDES,
        },
      },
    });

    if (!template) {
      throw new Error('Event template not found');
    }

    if (template.userId !== user.userId) {
      throw new Error('Unauthorized');
    }

    if (!template.event) {
      throw new Error('Template event not found');
    }

    const templateEvent = template.event;
    const athleteId = dto.athleteId ?? user.athlete?.athleteId;
    if (!athleteId) throw new BadRequestException('Athlete ID is required');
    await authorizePlanAthlete(this.prisma, user, athleteId);
    const sourceWorkout = templateEvent.training?.workout;
    const portableSteps = sourceWorkout
      ? await prepareWorkoutTargets(
          this.prisma,
          mapPrismaWorkoutToDto(sourceWorkout).steps,
          { sport: templateEvent.training!.sport, portable: true },
        )
      : undefined;
    const resolvedSteps = portableSteps
      ? await prepareWorkoutTargets(this.prisma, portableSteps, {
          athleteId,
          sport: templateEvent.training!.sport,
        })
      : undefined;

    // Prepare the event data from template
    const subEntityData: Record<string, unknown> = {
      ...templateEvent[
        templateEvent.type.toLocaleLowerCase() as Lowercase<Event['type']>
      ],
    };

    // Remove IDs and relations
    delete subEntityData.eventTrainingId;
    delete subEntityData.eventCompetitionId;
    delete subEntityData.eventNoteId;
    delete subEntityData.eventActivityId;
    delete subEntityData.eventId;
    delete subEntityData.relatedActivityId;
    delete subEntityData.relatedActivity;

    // Remove workout and estimatedLoad - will be duplicated/calculated separately
    if (templateEvent.type === 'TRAINING') {
      delete subEntityData.workout;
      delete subEntityData.estimatedLoad; // Don't copy estimatedLoad from template
    }

    let trainingWeekId: number | undefined;
    if (dto.trainingPlanId) {
      await authorizePlanAthlete(this.prisma, user, athleteId);
      trainingWeekId = await findPlanWeek(
        this.prisma,
        dto.trainingPlanId,
        athleteId,
        dto.startDate,
        dto.endDate,
      );
    }
    // Create the new event from template
    const newEvent = await this.prisma.event.create({
      data: {
        trainingWeekId,
        startDate: dto.startDate,
        endDate: dto.endDate,
        name: templateEvent.name,
        type: templateEvent.type,
        athleteId,
        [templateEvent.type.toLocaleLowerCase()]: {
          create: {
            ...subEntityData,
            ...(resolvedSteps
              ? {
                  workout: {
                    create: mapWorkoutDtoToPrisma({ steps: resolvedSteps }),
                  },
                }
              : {}),
          },
        },
      },
      include: EVENT_INCLUDES,
    });

    if (newEvent.training?.workout) {
      this.eventService.emitWorkoutPlannedChanged(
        newEvent.eventId,
        athleteId,
        newEvent.training.workout.workoutId,
        newEvent.startDate,
        newEvent.training.sport,
      );
    }

    // Schedule training load estimation for future training events
    if (
      newEvent.type === 'TRAINING' &&
      newEvent.training &&
      newEvent.startDate > startOfDay(new Date()) &&
      this.trainingLoadEstimationService &&
      newEvent.athleteId
    ) {
      this.trainingLoadEstimationService
        .scheduleEstimation(
          newEvent.eventId,
          newEvent.training.eventTrainingId,
          newEvent.athleteId,
        )
        .catch((error) => {
          // Log but don't fail the request
          this.logger.error(
            `Failed to schedule training load estimation: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error.stack : undefined,
          );
        });
    }

    // Return the complete event
    return this.eventService.getEventById(user, newEvent.eventId);
  }
}

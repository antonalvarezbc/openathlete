import { Prisma } from '@openathlete/database';

/**
 * Deletes a user and all their data. Pass a transaction client so a failure
 * part-way through leaves the account untouched.
 */
export async function deleteUserData(
  db: Prisma.TransactionClient,
  userId: number,
): Promise<void> {
  // Get athlete if exists
  const athlete = await db.athlete.findUnique({
    where: { userId },
    select: { athleteId: true },
  });

  if (athlete) {
    const athleteId = athlete.athleteId;

    // Delete all events and related data (similar to event service deleteEvent)
    const events = await db.event.findMany({
      where: { athleteId },
      select: {
        eventId: true,
        training: { select: { workout: { select: { workoutId: true } } } },
      },
    });

    for (const event of events) {
      if (event.training?.workout?.workoutId) {
        // Delete provider exports for workouts
        await db.providerWorkoutExport.deleteMany({
          where: {
            workout: {
              eventTrainingId: event.eventId,
            },
          },
        });
      }

      // Delete workout-related data
      await db.workout.deleteMany({
        where: { eventTrainingId: event.eventId },
      });
      await db.eventTraining.deleteMany({
        where: { eventId: event.eventId },
      });
      await db.eventCompetition.deleteMany({
        where: { eventId: event.eventId },
      });
      await db.eventNote.deleteMany({
        where: { eventId: event.eventId },
      });

      // Delete activity-related data
      await db.eventActivityWeather.deleteMany({
        where: { eventActivity: { eventId: event.eventId } },
      });
      await db.eventActivityNormalizationFactor.deleteMany({
        where: {
          normalization: { eventActivity: { eventId: event.eventId } },
        },
      });
      await db.eventActivityNormalization.deleteMany({
        where: { eventActivity: { eventId: event.eventId } },
      });
      await db.record.deleteMany({
        where: { eventActivity: { event: { eventId: event.eventId } } },
      });
      await db.activityFeedbackQuestion.deleteMany({
        where: { activity: { eventId: event.eventId } },
      });
      await db.activityFeedbackEmbedding.deleteMany({
        where: { activity: { eventId: event.eventId } },
      });
      await db.eventActivity.deleteMany({
        where: { eventId: event.eventId },
      });
    }

    // Delete events
    await db.event.deleteMany({
      where: { athleteId },
    });

    // Delete athlete-related data
    const trainingZones = await db.trainingZone.findMany({
      where: { athleteId },
      include: {
        values: true,
      },
    });
    for (const trainingZone of trainingZones) {
      await db.trainingZoneValue.deleteMany({
        where: { trainingZoneId: trainingZone.trainingZoneId },
      });
    }
    await db.trainingZone.deleteMany({
      where: { athleteId },
    });
    await db.equipment.deleteMany({
      where: { athleteId },
    });
    await db.cycle.deleteMany({
      where: { athleteId },
    });
    await db.athleteMetric.deleteMany({
      where: { athleteId },
    });
    await db.trainingLoadCalculation.deleteMany({
      where: { athleteId },
    });
    await db.trainingPlan.deleteMany({
      where: { athleteId },
    });
    await db.athleteAvailability.deleteMany({
      where: { athleteId },
    });
    await db.providerAccount.deleteMany({
      where: { athleteId },
    });
    await db.providerWorkoutExport.deleteMany({
      where: { athlete: { athleteId } },
    });
    await db.athleteSettings.deleteMany({
      where: { athleteId },
    });
    await db.athleteInjury.deleteMany({
      where: { athleteId },
    });

    // Delete coach-athlete relationships
    await db.coachAthlete.deleteMany({
      where: { athleteId },
    });
  }

  // Delete user-related data
  await db.token.deleteMany({
    where: { userId },
  });
  await db.eventTemplate.deleteMany({
    where: { userId },
  });
  await db.agentThread.deleteMany({
    where: { userId },
  });
  await db.eventTemplateFolder.deleteMany({
    where: { userId },
  });
  await db.athleteInvitation.deleteMany({
    where: { userId },
  });
  await db.coachInvitation.deleteMany({
    where: { OR: [{ coachUserId: userId }, { athleteUserId: userId }] },
  });
  await db.messageThreadParticipant.deleteMany({
    where: { userId },
  });
  await db.message.deleteMany({
    where: { senderId: userId },
  });
  await db.messageReadReceipt.deleteMany({
    where: { userId },
  });
  await db.subscription.deleteMany({
    where: { userId },
  });
  await db.coachAthlete.deleteMany({
    where: { userId },
  });

  // Delete athlete record if exists
  if (athlete) {
    await db.athlete.delete({
      where: { athleteId: athlete.athleteId },
    });
  }

  // Finally, delete the user
  await db.user.delete({
    where: { userId },
  });
}

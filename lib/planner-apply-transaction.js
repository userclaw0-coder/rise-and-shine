export async function applyPlannerMutationWithRollback({
  mutateTask,
  mutateTags,
  writeEvents,
  rollbackTask,
  rollbackTags,
  cleanupCreatedTags,
}) {
  let taskMutated = false;
  let tagsMutated = false;
  const createdTagIds = [];

  try {
    const taskResult = await mutateTask();
    taskMutated = Boolean(taskResult?.mutated);

    const tagsResult = await mutateTags();
    tagsMutated = Boolean(tagsResult?.mutated);
    if (Array.isArray(tagsResult?.createdTagIds) && tagsResult.createdTagIds.length > 0) {
      createdTagIds.push(...tagsResult.createdTagIds);
    }

    await writeEvents();
  } catch (error) {
    const rollbackErrors = [];

    if (taskMutated) {
      try {
        await rollbackTask();
      } catch (rollbackError) {
        rollbackErrors.push({ stage: "rollbackTask", message: rollbackError?.message || String(rollbackError) });
      }
    }

    if (tagsMutated) {
      try {
        await rollbackTags();
      } catch (rollbackError) {
        rollbackErrors.push({ stage: "rollbackTags", message: rollbackError?.message || String(rollbackError) });
      }
    }

    if (createdTagIds.length > 0) {
      try {
        await cleanupCreatedTags(createdTagIds);
      } catch (rollbackError) {
        rollbackErrors.push({
          stage: "cleanupCreatedTags",
          message: rollbackError?.message || String(rollbackError),
        });
      }
    }

    if (rollbackErrors.length > 0) {
      const rollbackSummary = rollbackErrors
        .map((item) => `${item.stage}: ${item.message}`)
        .join("; ");
      const combinedError = new Error(
        `planner_apply_failed_and_rollback_incomplete: ${error?.message || String(error)} | ${rollbackSummary}`
      );
      combinedError.cause = error;
      combinedError.rollbackErrors = rollbackErrors;
      throw combinedError;
    }

    throw error;
  }
}

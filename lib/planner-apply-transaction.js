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
    if (taskMutated) {
      await rollbackTask();
    }

    if (tagsMutated) {
      await rollbackTags();
    }

    if (createdTagIds.length > 0) {
      await cleanupCreatedTags(createdTagIds);
    }

    throw error;
  }
}

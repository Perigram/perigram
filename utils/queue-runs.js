function stringId(value) {
  return value?.toString?.() || value || '';
}

export function acceptedQueueRunId(queue = {}) {
  return stringId(queue.data?.materialConsumption?.runId)
    || stringId(queue.data?.physicalOutputs?.runId)
    || '';
}

export function currentQueueRun(runs = [], queue = {}) {
  const readable = Array.isArray(runs) ? runs.filter(Boolean) : [];
  if (!readable.length) return null;
  const acceptedId = acceptedQueueRunId(queue);
  if (acceptedId) {
    const accepted = readable.find(run => stringId(run._id) === acceptedId);
    if (accepted) return accepted;
  }
  return readable[readable.length - 1] || null;
}

// Claim-mode executor harness: polls the platform's worker protocol with
// the install's connector token and executes claimed service runs. Claims
// are pinned server-side to the installing organization's queue for the
// plugin, so every claimed run belongs to this executor.
//
// The loop is sequential: one claimed run at a time, heartbeat while the
// handler runs, then complete/fail. Task ids have the shape
// `plugin.<pluginId>.<serviceId>`; a run for an unknown service fails
// loudly instead of being dropped.
//
// All calls carry `x-worker-token: <connector token>` (the connector
// panel's token — NOT the deployment WORKER_TOKEN).

const TASK_ID_PATTERN = /^plugin\.[a-z0-9-]+\.([a-z0-9-]+)$/;

export async function runClaimExecutor({
  appUrl,
  token,
  workerId = 'executor-1',
  services = {},
  pollIntervalMs = 2000,
  heartbeatIntervalMs = 20000,
  signal = null,
  fetchImpl = fetch,
  onLog = () => {}
} = {}) {
  if (!appUrl) throw new Error('runClaimExecutor requires appUrl');
  if (!token) throw new Error('runClaimExecutor requires the connector token');

  const base = String(appUrl).replace(/\/+$/, '');
  const stopped = signal ? whenAborted(signal) : new Promise(() => {});

  onLog(`claim executor ${workerId} polling ${base}/api/tasks/claim (${Object.keys(services).length} service(s))`);
  while (!signal?.aborted) {
    let run = null;
    try {
      run = await claim(base, { workerId, token, fetchImpl });
    } catch (error) {
      onLog(`claim failed: ${error?.message || error}`);
      await sleep(pollIntervalMs, stopped);
      continue;
    }
    if (!run) {
      await sleep(pollIntervalMs, stopped);
      continue;
    }
    onLog(`claimed run ${run._id} (${run.taskId})`);
    try {
      await executeRun(base, run, services, { token, heartbeatIntervalMs, fetchImpl, onLog });
    } catch (error) {
      onLog(`run ${run._id} failed: ${error?.message || error}`);
    }
    // Poll cadence between EVERY claim: without this yield a queue that
    // always has a run turns the executor into a microtask spin that
    // starves timers (heartbeats, shutdown signals) entirely.
    await sleep(pollIntervalMs, stopped);
  }
  onLog('claim executor stopped');
}

async function claim(base, { workerId, token, fetchImpl }) {
  const response = await fetchImpl(`${base}/api/tasks/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-worker-token': token },
    body: JSON.stringify({ workerId })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body || response.statusText}`);
  }
  const payload = await response.json();
  return payload?.run || null;
}

async function executeRun(base, run, services, { token, heartbeatIntervalMs, fetchImpl, onLog }) {
  const match = String(run.taskId || '').match(TASK_ID_PATTERN);
  const serviceId = match ? match[1] : String(run.taskId || '');
  const handler = services[serviceId];
  if (typeof handler !== 'function') {
    await failRun(base, run, { token, fetchImpl }, `no handler for service ${serviceId} — provided: ${Object.keys(services).join(', ') || '(none)'}`);
    return;
  }

  const heartbeat = setInterval(() => {
    postJson(`${base}/api/tasks/${run._id}/heartbeat`, { claimToken: run.claimToken }, token, fetchImpl)
      .catch(error => onLog(`heartbeat for ${run._id} failed: ${error?.message || error}`));
  }, heartbeatIntervalMs);
  try {
    const input = run.input?.parameters?.value ?? null;
    const output = await handler(input);
    await postJson(`${base}/api/tasks/${run._id}/complete`, {
      claimToken: run.claimToken,
      result: { output: output === undefined ? null : output }
    }, token, fetchImpl);
    onLog(`run ${run._id} completed`);
  } catch (error) {
    await failRun(base, run, { token, fetchImpl }, error?.message || String(error));
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

async function failRun(base, run, { token, fetchImpl }, message) {
  try {
    await postJson(`${base}/api/tasks/${run._id}/fail`, { claimToken: run.claimToken, message }, token, fetchImpl);
  } catch (error) {
    // The run is already failing; a failed fail-call (expired claim, done
    // run) must not mask the original message.
    void error;
  }
}

function postJson(url, body, token, fetchImpl) {
  return fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-worker-token': token },
    body: JSON.stringify(body)
  }).then(async response => {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }
    return response;
  });
}

function sleep(ms, stopped) {
  return new Promise(resolve => {
    const timer = setTimeout(finish, ms);
    function finish() {
      stopped?.catch(() => {});
      resolve();
    }
    stopped?.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function whenAborted(signal) {
  return new Promise(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
}

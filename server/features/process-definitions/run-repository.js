import { randomUUID } from 'node:crypto';
// Aliased static imports: the previous lazy relative-import specifiers
// resolved against the bundled nitro dev entry and broke every manual action
// execution in dev with ERR_MODULE_NOT_FOUND; plain relative static
// specifiers get rebased by the bundler the same way, so an alias form
// (which resolves to an absolute file URL) is required. `#packages/*`
// (the package.json `imports` self-reference) also resolves under plain
// `node --test` (the `test:durable` runner), which cannot resolve `~`.
import { advanceProcessRun, createProcessRun } from '#packages/processes/src/index.js';

const COLLECTION_NAMES = Object.freeze({
  runs: 'execution_runs',
  invocations: 'execution_step_invocations',
  waits: 'execution_waits',
  outputs: 'execution_outputs',
  steps: 'execution_steps',
  receipts: 'execution_receipts'
});

const clone = value => value == null ? value : structuredClone(value);
const now = clock => clock().toISOString();

function resultValue(result) {
  return result?.value === undefined ? result : result.value;
}

function identityFields(invocation) {
  return {
    runId: invocation.runId,
    invocationId: invocation.invocationId,
    invocationIdentity: clone(invocation.invocationIdentity),
    producerOutputId: invocation.producerOutputId,
    producerIdentity: clone(invocation.producerIdentity),
    controlScope: clone(invocation.controlScope)
  };
}

function dispatchTaskRunId(dispatch) {
  if (!dispatch || typeof dispatch !== 'object') return null;
  const taskJob = [
    ...(dispatch.jobs || []),
    ...(dispatch.raw?.jobs || [])
  ].find(job => ['task_run', 'task'].includes(job?.type));
  return dispatch.taskRunId
    || dispatch.tasks?.[0]?.runId
    || dispatch.tasks?.[0]?.id
    || dispatch.raw?.tasks?.[0]?.runId
    || dispatch.raw?.tasks?.[0]?.id
    || taskJob?.id
    || null;
}

function requireSnapshot(input) {
  if (!Object.hasOwn(input, 'expectedCompletionSockets') || !Array.isArray(input.expectedCompletionSockets)) {
    throw new Error('Invocation requires an expected completion socket snapshot');
  }
  if (!Object.hasOwn(input, 'connectedRoutes') || !Array.isArray(input.connectedRoutes)) {
    throw new Error('Invocation requires a connected route snapshot');
  }
}

function sourceId(route) {
  return String(route?.sourceNodeId || route?.fromNodeId || route?.source?.nodeId || route?.from?.nodeId || '');
}

function socketId(value) {
  return String(value?.socketId || value?.id || value?.key || value || '');
}

export function snapshotInvocation(request = {}, processData = {}) {
  const record = request.record || {};
  const nodeId = String(record.nodeId || record.id || request.nodeId || '');
  const declaredSockets = request.expectedCompletionSockets
    || record.expectedCompletionSockets
    || record.outputSockets
    || record.outputs
    || [];
  const allRoutes = processData.routes || processData.connections || processData.edges || [];
  const routes = request.connectedRoutes || allRoutes.filter(route => !nodeId || sourceId(route) === nodeId);
  return {
    expectedCompletionSockets: declaredSockets.map(socketId).filter(Boolean),
    connectedRoutes: clone(routes),
    producerOutputId: request.producerOutputId || record.producerOutputId || null,
    producerIdentity: clone(request.producerIdentity || record.producerIdentity || {
      nodeId,
      outputSocketId: socketId(record.producerOutputId || record.outputSocketId)
    })
  };
}

export class DurableRunRepository {
  constructor({ connection, clock = () => new Date(), id = randomUUID } = {}) {
    if (!connection) throw new Error('Durable run repository requires a MongoDB connection');
    this.connection = connection;
    this.clock = clock;
    this.id = id;
  }

  collection(kind) {
    return this.connection.collection(COLLECTION_NAMES[kind]);
  }

  async initialize() {
    this.initialization ||= Promise.all([
      this.collection('invocations').createIndex({ invocationId: 1 }, { unique: true }),
      this.collection('invocations').createIndex({ 'dispatch.taskRunId': 1, receiptId: 1 }),
      this.collection('receipts').createIndex({ invocationId: 1 }, { unique: true }),
      this.collection('steps').createIndex({ runId: 1, stepId: 1, invocationId: 1 }, { unique: true })
    ]);
    await this.initialization;
    return this;
  }

  async transaction(work) {
    // Sessions live on the client in driver 6.x; the connection may be a
    // Db handle or the client itself.
    const client = this.connection.client || this.connection;
    const session = await client.startSession();
    try {
      let value;
      await session.withTransaction(async () => { value = await work(session); });
      return value;
    } finally {
      await session.endSession();
    }
  }

  async createRun({ run, definition, producerOutputId = null, producerIdentity = null, controlScope = null }) {
    await this.initialize();
    const runId = String(run.id || run._id || this.id());
    const createdAt = now(this.clock);
    const record = {
      _id: runId,
      runId,
      revision: 0,
      producerOutputId,
      producerIdentity: clone(producerIdentity),
      controlScope: clone(controlScope),
      invocationIdentity: null,
      state: clone(run),
      definition: clone(definition),
      advancementCount: 0,
      advancedRoutes: [],
      createdAt,
      updatedAt: createdAt
    };
    await this.collection('runs').insertOne(record);
    return clone(record);
  }

  async saveRunState(runId, state, expectedRevision) {
    const updatedAt = now(this.clock);
    const result = resultValue(await this.collection('runs').findOneAndUpdate(
      { _id: String(runId), revision: expectedRevision },
      { $set: { state: clone(state), updatedAt }, $inc: { revision: 1 } },
      { returnDocument: 'after' }
    ));
    if (!result) throw new Error(`Run ${runId} revision conflict`);
    return clone(result);
  }

  async createInvocation(input) {
    requireSnapshot(input);
    const invocationId = String(input.invocationId || this.id());
    const createdAt = now(this.clock);
    const invocationIdentity = clone(input.invocationIdentity || {
      runId: String(input.runId),
      stepId: String(input.stepId),
      attempt: Number(input.attempt || 1)
    });
    const record = {
      _id: invocationId,
      invocationId,
      runId: String(input.runId),
      stepId: String(input.stepId),
      revision: 0,
      status: 'ready',
      attempt: Number(input.attempt || 1),
      invocationIdentity,
      producerOutputId: input.producerOutputId || input.request?.producerOutputId || null,
      producerIdentity: clone(input.producerIdentity),
      controlScope: clone(input.controlScope),
      expectedCompletionSockets: clone(input.expectedCompletionSockets),
      connectedRoutes: clone(input.connectedRoutes),
      request: clone(input.request),
      receiptId: null,
      dispatchedAt: null,
      completedAt: null,
      createdAt,
      updatedAt: createdAt
    };
    await this.transaction(async session => {
      const options = { session };
      await this.collection('invocations').insertOne(record, options);
      await this.collection('steps').insertOne({
        _id: `${record.runId}:${record.stepId}:${record.invocationId}`,
        stepId: record.stepId,
        ...identityFields(record),
        revision: 0,
        status: 'awaiting-dispatch',
        createdAt,
        updatedAt: createdAt
      }, options);
    });
    return clone(record);
  }

  async markDispatched(invocationId, dispatch = {}) {
    const updatedAt = now(this.clock);
    const result = resultValue(await this.collection('invocations').findOneAndUpdate(
      { _id: String(invocationId), status: { $in: ['ready', 'retrying'] }, receiptId: null },
      { $set: { status: 'dispatched', dispatch: clone(dispatch), dispatchedAt: updatedAt, updatedAt }, $inc: { revision: 1 } },
      { returnDocument: 'after' }
    ));
    if (!result) throw new Error(`Invocation ${invocationId} cannot be marked dispatched`);
    await this.collection('steps').updateOne(
      { _id: `${result.runId}:${result.stepId}:${result.invocationId}` },
      { $set: { status: 'awaiting-receipt', updatedAt }, $inc: { revision: 1 } }
    );
    return clone(result);
  }

  async recordWait(invocationId, wait) {
    const invocation = await this.collection('invocations').findOne({ _id: String(invocationId) });
    if (!invocation) throw new Error(`Invocation ${invocationId} not found`);
    const createdAt = now(this.clock);
    const waitId = String(wait.waitId || this.id());
    const record = {
      _id: waitId,
      waitId,
      ...identityFields(invocation),
      revision: 0,
      status: wait.status || 'waiting',
      dueAt: wait.dueAt || null,
      payload: clone(wait.payload),
      createdAt,
      updatedAt: createdAt
    };
    await this.collection('waits').insertOne(record);
    return clone(record);
  }

  async ingestReceipt(input, { advance } = {}) {
    const invocationId = String(input.invocationId || '');
    if (!invocationId) throw new Error('Receipt requires invocationId');
    return this.transaction(async session => {
      const options = { session };
      const invocation = await this.collection('invocations').findOne({ _id: invocationId }, options);
      if (!invocation) throw new Error(`Invocation ${invocationId} not found`);
      requireSnapshot(invocation);
      const receiptSocketId = String(input.socketId || '');
      if (receiptSocketId && invocation.expectedCompletionSockets.length && !invocation.expectedCompletionSockets.includes(receiptSocketId)) {
        throw new Error(`Socket ${receiptSocketId || '<missing>'} is not expected by invocation ${invocationId}`);
      }

      if (invocation.receiptId) {
        return { applied: false, reason: 'duplicate', invocation: clone(invocation) };
      }
      const receiptId = String(input.receiptId || this.id());
      const completedAt = now(this.clock);
      const claimed = resultValue(await this.collection('invocations').findOneAndUpdate(
        { _id: invocationId, revision: invocation.revision, receiptId: null, status: { $in: ['dispatched', 'retrying'] } },
        { $set: { receiptId, status: 'completed', completedAt, updatedAt: completedAt }, $inc: { revision: 1 } },
        { ...options, returnDocument: 'after' }
      ));
      if (!claimed) {
        const current = await this.collection('invocations').findOne({ _id: invocationId }, options);
        if (current?.receiptId) return { applied: false, reason: 'duplicate', invocation: clone(current) };
        return { applied: false, reason: 'conflict', invocation: clone(current) };
      }

      const identity = identityFields(claimed);
      const receipt = {
        _id: receiptId,
        receiptId,
        ...identity,
        revision: 0,
        socketId: receiptSocketId,
        output: clone(input.output),
        producerReceipt: clone(input.producerReceipt),
        createdAt: completedAt,
        updatedAt: completedAt
      };
      const outputId = String(input.outputId || this.id());
      const output = {
        _id: outputId,
        outputId,
        ...identity,
        revision: 0,
        socketId: receipt.socketId,
        value: clone(input.output),
        createdAt: completedAt,
        updatedAt: completedAt
      };
      await this.collection('receipts').insertOne(receipt, options);
      await this.collection('outputs').insertOne(output, options);
      await this.collection('steps').updateOne(
        { _id: `${claimed.runId}:${claimed.stepId}:${claimed.invocationId}` },
        { $set: { status: 'completed', outputId: output.outputId, updatedAt: completedAt }, $inc: { revision: 1 } },
        options
      );

      const matchingRoutes = claimed.connectedRoutes.filter(route => {
        const fromSocket = socketId(route?.sourceSocketId || route?.fromSocketId || route?.source?.socketId || route?.from?.socketId);
        return !receipt.socketId || !fromSocket || fromSocket === receipt.socketId;
      });
      const advancement = advance ? await advance({
        runId: claimed.runId,
        invocation: clone(claimed),
        receipt: clone(receipt),
        output: clone(input.output),
        routes: clone(matchingRoutes),
        session
      }) : null;
      const runUpdate = {
        $set: { lastReceiptId: receiptId, updatedAt: completedAt },
        $inc: { revision: 1, advancementCount: 1 }
      };
      if (matchingRoutes.length) runUpdate.$push = { advancedRoutes: { $each: clone(matchingRoutes) } };
      if (advancement?.state) runUpdate.$set.state = clone(advancement.state);
      await this.collection('runs').updateOne({ _id: claimed.runId }, runUpdate, options);
      return { applied: true, invocation: clone(claimed), receipt: clone(receipt), output: clone(output), routes: clone(matchingRoutes) };
    });
  }

  async failInvocation(invocationId, { error = null, cancelled = false } = {}, { advance } = {}) {
    const id = String(invocationId || '');
    if (!id) throw new Error('Failure ingestion requires invocationId');
    return this.transaction(async session => {
      const options = { session };
      const invocation = await this.collection('invocations').findOne({ _id: id }, options);
      if (!invocation) throw new Error(`Invocation ${id} not found`);
      if (invocation.receiptId) {
        return { applied: false, reason: 'duplicate', invocation: clone(invocation) };
      }
      const failedAt = now(this.clock);
      const receiptId = String(this.id());
      const claimed = resultValue(await this.collection('invocations').findOneAndUpdate(
        { _id: id, revision: invocation.revision, receiptId: null, status: { $in: ['dispatched', 'retrying'] } },
        { $set: { receiptId, status: cancelled ? 'cancelled' : 'failed', completedAt: failedAt, updatedAt: failedAt }, $inc: { revision: 1 } },
        { ...options, returnDocument: 'after' }
      ));
      if (!claimed) {
        const current = await this.collection('invocations').findOne({ _id: id }, options);
        if (current?.receiptId) return { applied: false, reason: 'duplicate', invocation: clone(current) };
        return { applied: false, reason: 'conflict', invocation: clone(current) };
      }
      const identity = identityFields(claimed);
      const failure = { message: error?.message || String(error || 'Task failed'), statusCode: error?.statusCode || null };
      const receipt = {
        _id: receiptId,
        receiptId,
        ...identity,
        revision: 0,
        socketId: null,
        output: { error: failure, cancelled },
        producerReceipt: null,
        createdAt: failedAt,
        updatedAt: failedAt
      };
      await this.collection('receipts').insertOne(receipt, options);
      await this.collection('steps').updateOne(
        { _id: `${claimed.runId}:${claimed.stepId}:${claimed.invocationId}` },
        { $set: { status: cancelled ? 'cancelled' : 'failed', error: failure, updatedAt: failedAt }, $inc: { revision: 1 } },
        options
      );
      const advancement = advance ? await advance({
        runId: claimed.runId,
        invocation: clone(claimed),
        receipt: clone(receipt),
        output: null,
        routes: [],
        session
      }) : null;
      const runUpdate = {
        $set: {
          lastReceiptId: receiptId,
          updatedAt: failedAt,
          ...(advancement?.state ? { state: clone(advancement.state) } : {})
        },
        $inc: { revision: 1, advancementCount: 1 }
      };
      await this.collection('runs').updateOne({ _id: claimed.runId }, runUpdate, options);
      return { applied: true, invocation: clone(claimed), receipt: clone(receipt) };
    });
  }

  async retryInvocation(invocationId, expectedRevision) {
    const updatedAt = now(this.clock);
    const result = resultValue(await this.collection('invocations').findOneAndUpdate(
      { _id: String(invocationId), revision: expectedRevision, receiptId: null, status: { $in: ['ready', 'dispatched', 'retrying'] } },
      { $set: { status: 'retrying', updatedAt }, $inc: { revision: 1, attempt: 1 } },
      { returnDocument: 'after' }
    ));
    if (!result) throw new Error(`Invocation ${invocationId} retry revision conflict`);
    return clone(result);
  }

  async findUnreceiptedInvocations({ runId } = {}) {
    const query = { receiptId: null, status: { $in: ['ready', 'dispatched', 'retrying'] } };
    if (runId) query.runId = String(runId);
    return clone(await this.collection('invocations').find(query).toArray());
  }

  async findInvocationByTaskRunId(taskRunId) {
    const id = String(taskRunId || '');
    if (!id) return null;
    const record = await this.collection('invocations').findOne({
      'dispatch.taskRunId': id,
      receiptId: null,
      status: { $in: ['ready', 'dispatched', 'retrying'] }
    });
    return clone(record);
  }

  async getExecution(runId) {
    const id = String(runId);
    const [run, invocations, waits, outputs, steps, receipts] = await Promise.all([
      this.collection('runs').findOne({ _id: id }),
      this.collection('invocations').find({ runId: id }).toArray(),
      this.collection('waits').find({ runId: id }).toArray(),
      this.collection('outputs').find({ runId: id }).toArray(),
      this.collection('steps').find({ runId: id }).toArray(),
      this.collection('receipts').find({ runId: id }).toArray()
    ]);
    return clone({ run, invocations, waits, outputs, steps, receipts });
  }

  async findRunsForOrganization(organizationId, { limit = 100 } = {}) {
    await this.initialize();
    return clone(await this.collection('runs')
      .find({ 'controlScope.organizationId': String(organizationId) })
      .sort({ updatedAt: -1 })
      .limit(Number(limit) || 100)
      .toArray());
  }

  // Cancellation (SPEC "Process authoring maturity"): a parked run (status
  // 'waiting') is cancelled atomically — outstanding invocations claim a
  // cancellation receipt (a racing worker receipt either landed before the
  // status guard refused the cancel, or finds the invocation receipted),
  // waiting steps are skipped, and the run state becomes 'cancelled', the
  // status the advancement loop never picks up again.
  async cancelRun(runId, { actor = null, reason = '' } = {}) {
    const id = String(runId || '');
    if (!id) throw new Error('Cancellation requires runId');
    const cancelledAt = now(this.clock);
    return this.transaction(async session => {
      const options = { session };
      const run = await this.collection('runs').findOne({ _id: id }, options);
      if (!run) throw new Error(`Run ${id} not found`);
      if (run.state?.status !== 'waiting') {
        const error = new Error(`Run ${id} is ${run.state?.status || 'unknown'}; only waiting runs can be cancelled`);
        error.statusCode = 409;
        throw error;
      }
      for (const invocation of await this.collection('invocations')
        .find({ runId: id, receiptId: null, status: { $in: ['ready', 'dispatched', 'retrying'] } }, options)
        .toArray()) {
        const claimed = resultValue(await this.collection('invocations').findOneAndUpdate(
          { _id: invocation._id, revision: invocation.revision, receiptId: null },
          {
            $set: { receiptId: this.id(), status: 'cancelled', completedAt: cancelledAt, updatedAt: cancelledAt },
            $inc: { revision: 1 }
          },
          { ...options, returnDocument: 'after' }
        ));
        if (!claimed) continue;
        await this.collection('steps').updateOne(
          { _id: `${claimed.runId}:${claimed.stepId}:${claimed.invocationId}` },
          { $set: { status: 'cancelled', updatedAt: cancelledAt }, $inc: { revision: 1 } },
          options
        );
        await this.collection('waits').updateMany(
          { invocationId: claimed.invocationId },
          { $set: { status: 'cancelled', updatedAt: cancelledAt } },
          options
        );
      }
      const state = clone(run.state);
      state.status = 'cancelled';
      state.cancelled = { at: cancelledAt, by: actor?.userId || null, ...(reason ? { reason } : {}) };
      for (const step of Object.values(state.steps || {})) {
        if (['waiting', 'pending', 'running'].includes(step.status)) step.status = 'skipped';
      }
      delete state.pendingEffect;
      const updated = resultValue(await this.collection('runs').findOneAndUpdate(
        { _id: id, revision: run.revision },
        { $set: { state, updatedAt: cancelledAt }, $inc: { revision: 1 } },
        { ...options, returnDocument: 'after' }
      ));
      if (!updated) {
        const error = new Error(`Run ${id} revision conflict`);
        error.statusCode = 409;
        throw error;
      }
      return clone(updated);
    });
  }
}

let defaultRepository;
export function getRunRepository(connection) {
  defaultRepository ||= new DurableRunRepository({ connection });
  return defaultRepository;
}

function makeDurableEffectExecutor({ repository, runId, payload, actor, executeEffect, isAsyncBoundary, processData }) {
  return async (request, run) => {
    const dispatch = await executeEffect(request, run);
    if (!isAsyncBoundary(request, dispatch)) return dispatch;
    const snapshot = snapshotInvocation(request, processData);
    const stepId = String(request.record?.nodeId || request.record?.id || request.nodeId || `step-${run?.steps?.length || 0}`);
    const invocation = await repository.createInvocation({
      runId,
      stepId,
      request,
      invocationIdentity: { runId, stepId, attempt: request.attempt || 1 },
      producerOutputId: request.producerOutputId || snapshot.producerOutputId || null,
      producerIdentity: snapshot.producerIdentity,
      controlScope: payload.controlScope || { organizationId: actor?.organizationId || null },
      expectedCompletionSockets: snapshot.expectedCompletionSockets,
      connectedRoutes: snapshot.connectedRoutes
    });
    await repository.markDispatched(invocation.invocationId, {
      accepted: true,
      dispatchId: dispatch?.id || dispatch?.taskId || dispatch?.tasks?.[0]?.id || dispatch?.jobs?.[0]?.id || null,
      taskRunId: dispatchTaskRunId(dispatch)
    });
    return { __processEffectPending: true, invocationId: invocation.invocationId };
  };
}

async function advanceUntilBoundary({ repository, runId, run, revision, definition, environment }) {
  let state = run;
  let currentRevision = revision;
  for (let index = 0; state.status === 'running' && index < 999; index += 1) {
    const advanced = await advanceProcessRun(state, definition, environment(state));
    if (JSON.stringify(advanced) === JSON.stringify(state)) break;
    state = advanced;
    const saved = await repository.saveRunState(runId, state, currentRevision);
    currentRevision = saved.revision;
  }
  if (state.status === 'running' && !(await repository.findUnreceiptedInvocations({ runId })).length) {
    throw new Error('Process run exceeded 1000 steps');
  }
  return { run: state, revision: currentRevision };
}

export async function executeManualRun(definition, payload = {}, {
  actor,
  executeEffect,
  isAsyncBoundary = () => false,
  catalogContext,
  domain,
  data,
  repository = getRunRepository()
} = {}) {
  let run = createProcessRun(definition, payload.trigger || {}, {
    processDefinitionId: definition._id || definition.id,
    context: { inputs: payload.inputs || {}, actor }
  });
  const runId = String(run.id || run._id);
  await repository.createRun({
    run,
    definition,
    producerOutputId: payload.producerOutputId || null,
    producerIdentity: payload.producerIdentity || null,
    controlScope: payload.controlScope || { organizationId: actor?.organizationId || null }
  });
  const result = await advanceUntilBoundary({
    repository,
    runId,
    run,
    revision: 0,
    definition: definition.data,
    environment: current => ({
      executeEffect: makeDurableEffectExecutor({
        repository,
        runId,
        payload,
        actor,
        executeEffect,
        isAsyncBoundary,
        processData: definition.data
      }),
      catalogContext,
      domain,
      data: data(current)
    })
  });
  return result.run;
}

export async function continueStoredRun(runRecord, definition, payload = {}, {
  actor,
  executeEffect,
  isAsyncBoundary = () => false,
  catalogContext,
  domain,
  data,
  repository = getRunRepository()
} = {}) {
  const runId = String(runRecord.runId || runRecord._id);
  const result = await advanceUntilBoundary({
    repository,
    runId,
    run: structuredClone(runRecord.state),
    revision: Number(runRecord.revision || 0),
    definition: definition.data,
    environment: current => ({
      executeEffect: makeDurableEffectExecutor({
        repository,
        runId,
        payload,
        actor,
        executeEffect,
        isAsyncBoundary,
        processData: definition.data
      }),
      catalogContext,
      domain,
      data: data(current)
    })
  });
  return result.run;
}

export async function resumeDueRuns({ repository = getRunRepository() } = {}) {
  return repository.findUnreceiptedInvocations();
}

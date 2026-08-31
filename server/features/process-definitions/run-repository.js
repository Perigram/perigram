import { randomUUID } from 'node:crypto';

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
      this.collection('receipts').createIndex({ invocationId: 1 }, { unique: true }),
      this.collection('steps').createIndex({ runId: 1, stepId: 1, invocationId: 1 }, { unique: true })
    ]);
    await this.initialization;
    return this;
  }

  async transaction(work) {
    const session = await this.connection.startSession();
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
      if (invocation.expectedCompletionSockets.length && !invocation.expectedCompletionSockets.includes(receiptSocketId)) {
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
        output: clone(output),
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
}

let defaultRepository;
export function getRunRepository(connection) {
  defaultRepository ||= new DurableRunRepository({ connection });
  return defaultRepository;
}

class DispatchPending extends Error {}

export async function executeManualRun(definition, payload = {}, { actor, executeEffect, catalogContext, domain, data, repository = getRunRepository() } = {}) {
  const { advanceProcessRun, createProcessRun } = await import('../../../packages/processes/src/index.js');
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
  let revision = 0;
  for (let index = 0; run.status === 'running' && index < 999; index += 1) {
    try {
      const advanced = await advanceProcessRun(run, definition.data, {
        executeEffect: async request => {
          const snapshot = snapshotInvocation(request, definition.data);
          const stepId = String(request.record?.nodeId || request.record?.id || request.nodeId || `step-${index}`);
          const invocation = await repository.createInvocation({
            runId,
            stepId,
            request,
            invocationIdentity: { runId, stepId, attempt: 1 },
            producerOutputId: request.producerOutputId || snapshot.producerOutputId || null,
            producerIdentity: snapshot.producerIdentity,
            controlScope: payload.controlScope || { organizationId: actor?.organizationId || null },
            expectedCompletionSockets: snapshot.expectedCompletionSockets,
            connectedRoutes: snapshot.connectedRoutes
          });
          const dispatch = await executeEffect(request, run);
          await repository.markDispatched(invocation.invocationId, { accepted: true, dispatchId: dispatch?.id || dispatch?.taskId || null });
          throw new DispatchPending('External effect awaits a durable receipt');
        },
        catalogContext,
        domain,
        data: data(run)
      });
      if (JSON.stringify(advanced) === JSON.stringify(run)) break;
      run = advanced;
      const saved = await repository.saveRunState(runId, run, revision);
      revision = saved.revision;
    } catch (error) {
      if (error instanceof DispatchPending) break;
      throw error;
    }
  }
  if (run.status === 'running' && !(await repository.findUnreceiptedInvocations({ runId })).length) {
    throw new Error('Process run exceeded 1000 steps');
  }
  return run;
}

export async function resumeDueRuns({ repository = getRunRepository() } = {}) {
  return repository.findUnreceiptedInvocations();
}

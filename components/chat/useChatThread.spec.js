import { describe, expect, it } from 'vitest';
import { AGENT_RUN_STOP_TIMEOUT_MS, reduceAgentRun } from './useChatThread.js';

// The chat client run machine: idle | running | awaiting-answer | stopping |
// completed | failed, driven by the server's conversation stream snapshot.
const idle = { state: 'idle', activity: null, question: null };

describe('chat agent run machine', () => {
  it('starts a run on activity and stream snapshots', () => {
    const running = reduceAgentRun(idle, {
      type: 'activity',
      userId: 'bot-1',
      name: 'Assistant',
      steps: [{ kind: 'tool', name: 'list_types' }]
    });
    expect(running.state).toBe('running');
    expect(running.activity).toMatchObject({ userId: 'bot-1', steps: [{ kind: 'tool', name: 'list_types' }] });

    const streamed = reduceAgentRun(running, {
      type: 'stream',
      userId: 'bot-1',
      name: 'Assistant',
      text: 'Working'
    });
    expect(streamed.state).toBe('running');
    expect(streamed.activity.answer).toBe('Working');
    expect(streamed.activity.steps).toHaveLength(1);
  });

  it('enters awaiting-answer on a question and returns to running on the answer', () => {
    const running = reduceAgentRun(idle, { type: 'activity', userId: 'bot-1', name: 'Assistant' });
    const asking = reduceAgentRun(running, {
      type: 'question',
      userId: 'bot-1',
      name: 'Assistant',
      question: 'Which project?',
      options: ['A', 'B']
    });
    expect(asking.state).toBe('awaiting-answer');
    expect(asking.question).toEqual({ question: 'Which project?', options: ['A', 'B'] });

    const answered = reduceAgentRun(asking, { type: 'question-end' });
    expect(answered.state).toBe('running');
    expect(answered.question).toBeNull();
  });

  it('enters stopping on stop and ignores stream events while stopping', () => {
    const running = reduceAgentRun(idle, { type: 'activity', userId: 'bot-1', name: 'Assistant', steps: ['a'] });
    const stopping = reduceAgentRun(running, { type: 'stop' });
    expect(stopping.state).toBe('stopping');
    expect(stopping.activity).toBeNull();

    expect(reduceAgentRun(stopping, { type: 'activity', userId: 'bot-1', steps: ['late'] })).toBe(stopping);
    expect(reduceAgentRun(stopping, { type: 'stream', text: 'late' })).toBe(stopping);
  });

  it('settles stopping through stream end, the persisted message, or the timeout', () => {
    const running = reduceAgentRun(idle, { type: 'activity', userId: 'bot-1' });
    const stopping = reduceAgentRun(running, { type: 'stop' });

    expect(reduceAgentRun(stopping, { type: 'stream-end' }).state).toBe('completed');
    expect(reduceAgentRun(stopping, { type: 'message', message: { agent: { steps: [] } } }).state).toBe('completed');
    expect(reduceAgentRun(stopping, { type: 'stop-timeout' }).state).toBe('completed');
    expect(AGENT_RUN_STOP_TIMEOUT_MS).toBe(8000);
  });

  it('settles a persisted run message as completed or failed by its notice', () => {
    const running = reduceAgentRun(idle, { type: 'activity', userId: 'bot-1' });
    expect(reduceAgentRun(running, { type: 'message', message: { agent: { steps: [] } } })).toEqual({
      state: 'completed',
      activity: null,
      question: null
    });
    expect(reduceAgentRun(
      reduceAgentRun(idle, { type: 'activity', userId: 'bot-1' }),
      { type: 'message', message: { agent: { steps: [] }, notice: 'error' } }
    ).state).toBe('failed');
    expect(reduceAgentRun(running, { type: 'message', message: { text: 'human reply' } })).toBe(running);
  });

  it('reconciles the live snapshot after a stream gap', () => {
    const restored = reduceAgentRun(idle, {
      type: 'live',
      active: true,
      userId: 'bot-1',
      name: 'Assistant',
      steps: ['read'],
      answer: 'Partial'
    });
    expect(restored.state).toBe('running');
    expect(restored.activity).toMatchObject({ steps: ['read'], answer: 'Partial' });

    const asking = reduceAgentRun(idle, {
      type: 'live',
      active: true,
      userId: 'bot-1',
      question: { question: 'Pick', options: [] }
    });
    expect(asking.state).toBe('awaiting-answer');

    expect(reduceAgentRun(restored, { type: 'live', active: false }).state).toBe('completed');
    expect(reduceAgentRun(idle, { type: 'live', active: false })).toBe(idle);
  });

  it('rejects events outside the declared edges', () => {
    expect(reduceAgentRun(idle, { type: 'stop' })).toBe(idle);
    expect(reduceAgentRun(idle, { type: 'stream-end' })).toBe(idle);
    expect(reduceAgentRun(idle, { type: 'question-end' })).toBe(idle);
    const completed = { state: 'completed', activity: null, question: null };
    expect(reduceAgentRun(completed, { type: 'stop' })).toBe(completed);
  });
});

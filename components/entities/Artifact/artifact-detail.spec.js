import { describe, expect, it } from 'vitest';
import { artifactRevisionOptions, resolveArtifactEditingContract } from '~/utils/artifact-detail.js';

const domainUi = {
  getAttachmentCreation: type => ({ mode: type === 'DXF_SOURCE' ? 'upload' : 'generated', accept: '.dxf' }),
  getAttachmentEditor: type => ({ mode: type === 'CSV_TABLE' ? 'csv' : type === 'LAYOUT_DXF' ? 'layout' : 'none' })
};

describe('artifact detail editing contract', () => {
  it('allows replacement only for editable upload/capture/editor artifacts', () => {
    const artifact = { data: { type: 'DXF_SOURCE' } };
    expect(resolveArtifactEditingContract({ artifact, domainUi, canEdit: true }).canReplaceFile).toBe(true);
    expect(resolveArtifactEditingContract({ artifact, domainUi, canEdit: false }).canReplaceFile).toBe(false);
    expect(resolveArtifactEditingContract({ artifact: { data: { type: 'GENERATED' } }, domainUi, canEdit: true }).canReplaceFile).toBe(false);
  });

  it('selects the declared editor mode and produces stable revision choices', () => {
    expect(resolveArtifactEditingContract({ artifact: { data: { type: 'CSV_TABLE' } }, domainUi, canEdit: true }).editor.mode).toBe('csv');
    expect(artifactRevisionOptions([{ _id: 'r2', data: { number: 2 } }, { _id: 'r1', data: { number: 1 } }]))
      .toEqual([{ label: 'v2', value: 'r2' }, { label: 'v1', value: 'r1' }]);
  });
});

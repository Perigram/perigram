export const buildOccsFoldedPreviewPayload = ({ faces = [], folds = [], joints = [] } = {}) => {
  const preview = { faces, folds };
  if (joints.length) preview.joints = joints;
  return preview;
};

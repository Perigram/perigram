export const buildOccsFoldedPreviewPayload = ({ faces = [], folds = [], joints = [], bodies = [], cutouts = [] } = {}) => {
  const preview = { faces, folds };
  if (joints.length) preview.joints = joints;
  if (bodies.length) preview.bodies = bodies;
  if (cutouts.length) preview.cutouts = cutouts;
  return preview;
};

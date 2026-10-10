import { buildCassetteV2ClipperLayout } from '../cassetteV2Clipper.js';
import { OCCS_LAYER_CUT_OUTER, OCCS_LAYER_FOLD_ROUTE } from './layers.js';

export const buildOccsProductionLayout = async (faces = [], options = {}) => {
  const layout = await buildCassetteV2ClipperLayout(faces, options);
  return {
    ...layout,
    layerCodes: {
      cutOuter: OCCS_LAYER_CUT_OUTER,
      foldRoute: OCCS_LAYER_FOLD_ROUTE
    }
  };
};

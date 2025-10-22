export const cassetteSchema = {
    layers: [
        {
            name: 'cut',
            type: 'vector',
            required: true,
            description: 'Cut line vectors'
        },
        {
            name: 'bend',
            type: 'vector',
            required: false,
            description: 'Bend line vectors'
        },
        {
            name: 'frame',
            type: 'vector',
            required: false,
            description: 'Frame vectors'
        },
        {
            name: 'dimensions',
            type: 'vector',
            required: false,
            description: 'Dimension vectors'
        }
    ]
};

/**
 * Cassette document structure in MongoDB
 * @typedef {Object} Cassette
 * @property {string} _id - MongoDB ObjectId
 * @property {string} name - Cassette name
 * @property {string} userId - Owner user ID
 * @property {string} dxfId - GridFS file ID for original DXF
 * @property {string} svgId - GridFS file ID for preview SVG
 * @property {Object} layerMapping - Mapping of DXF layers to cassette layers
 * @property {string[]} layerMapping.cut - Array of DXF layer names mapped to cut
 * @property {string[]} layerMapping.bend - Array of DXF layer names mapped to bend
 * @property {string[]} layerMapping.frame - Array of DXF layer names mapped to frame
 * @property {string[]} layerMapping.dimensions - Array of DXF layer names mapped to dimensions
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {string} processingStatus - Status: 'pending', 'processing', 'done', 'error'
 */

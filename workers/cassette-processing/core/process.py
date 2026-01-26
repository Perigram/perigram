from utils.logger import setup_logger
from utils.mongo import db, cassettes_bucket
from dxf_utils import read_dxf
import sys
from pathlib import Path

# Import geometry building from fileprocessing
# In Docker: /app/fileprocessing and /app/cassette-processing
# Locally: workers/fileprocessing and workers/cassette-processing
if os.path.exists('/app/fileprocessing'):
    sys.path.append('/app/fileprocessing')
else:
    sys.path.append(str(Path(__file__).parent.parent.parent / 'fileprocessing'))

from core.geometry.build_geometry import build_geometry
from core.geometry.dxf_parser import convert_entity_to_shapely

logger = setup_logger("cassette_processor")

def process_cassette(cassette_doc):
    """
    Process a cassette document:
    1. Read DXF from GridFS
    2. Extract nesting layer entities
    3. Build polygon geometry
    4. Save polygonParts to cassettes collection
    """
    cassette_id = cassette_doc['_id']
    cassette_name = cassette_doc['name']
    dxf_id = cassette_doc['dxfId']
    nesting_layer = cassette_doc.get('nestingLayer', 'frame')
    layer_mapping = cassette_doc.get('layerMapping', {})
    
    logger.info(f"Processing cassette: {cassette_name}, nestingLayer: {nesting_layer}")
    
    # Get layer names for nesting layer
    layer_names = layer_mapping.get(nesting_layer, [])
    
    if not layer_names:
        logger.warning(f"No layers mapped for nesting layer '{nesting_layer}', using all 'frame' layers")
        # Fallback to all frame layers if specified layer is empty
        layer_names = layer_mapping.get('frame', [])
    
    if not layer_names:
        raise Exception(f"No layer names found for nesting. LayerMapping: {layer_mapping}")
    
    logger.info(f"Using layer names for nesting: {layer_names}")
    
    # Read DXF from GridFS
    try:
        dxf_stream = cassettes_bucket.open_download_stream(dxf_id)
        drawing = read_dxf(dxf_stream)
        logger.info(f"Successfully loaded DXF from GridFS")
    except Exception as e:
        logger.error(f"Failed to load DXF: {e}")
        raise Exception(f"Failed to load DXF from GridFS: {e}")
    
    # Filter entities by nesting layer names
    msp = drawing.modelspace()
    filtered_entities = []
    
    for entity in msp:
        try:
            entity_layer = entity.dxf.layer
            if entity_layer in layer_names:
                filtered_entities.append(entity)
        except Exception as e:
            logger.debug(f"Skipping entity without layer: {e}")
            continue
    
    logger.info(f"Found {len(filtered_entities)} entities in nesting layers")
    
    if not filtered_entities:
        raise Exception(f"No entities found in nesting layers: {layer_names}")
    
    # Build polygon geometry using existing logic
    tolerance = 0.01  # flattening tolerance
    polygon_parts = build_geometry(drawing, tolerance)
    
    logger.info(f"Generated {len(polygon_parts)} polygon parts")
    
    # Convert to MongoDB format
    polygon_parts_data = []
    for part in polygon_parts:
        part_dict = part.to_mongo_dict()
        if part_dict:  # Skip invalid parts
            polygon_parts_data.append(part_dict)
    
    logger.info(f"Converted {len(polygon_parts_data)} valid polygon parts")
    
    if not polygon_parts_data:
        raise Exception("No valid polygon parts generated from DXF")
    
    # Update cassettes collection
    db['cassettes'].update_one(
        {'_id': cassette_id},
        {'$set': {
            'polygonParts': polygon_parts_data
        }}
    )
    
    logger.info(f"Successfully processed cassette {cassette_name}: {len(polygon_parts_data)} parts")
    
    return {
        'polygonPartsCount': len(polygon_parts_data),
        'layerNames': layer_names
    }

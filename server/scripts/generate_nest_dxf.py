import argparse
import json
import os
import sys
import logging
import io
import tempfile
from bson import ObjectId
from pymongo import MongoClient
from gridfs import GridFSBucket
import ezdxf
from ezdxf import xref, recover
from ezdxf.math import Matrix44

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("dxf_gen")

def create_mongo_client():
    mongo_uri = os.environ.get("MONGODB_URI")
    if not mongo_uri:
        raise Exception("MONGODB_URI environment variable not set")
    return MongoClient(mongo_uri)

def read_dxf_from_gridfs(bucket, file_id, cache):
    file_id_str = str(file_id)
    if file_id_str in cache:
        return cache[file_id_str]
    
    try:
        download_stream = bucket.open_download_stream(file_id)
        content = download_stream.read()
        
        # Use temp file for recover
        with tempfile.NamedTemporaryFile(delete=False, suffix='.dxf') as tmp:
            tmp.write(content)
            tmp_path = tmp.name
            
        try:
            doc, auditor = recover.readfile(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
                
        cache[file_id_str] = doc
        return doc
    except Exception as e:
        logger.error(f"Error reading DXF {file_id}: {e}")
        raise

def process_transforms(transforms_data, output_dir, slug, mongo_client):
    db = mongo_client.get_default_database()
    cassettes_collection = db["cassettes"]
    baked_cassettes_collection = db["baked_cassettes"]
    cassettes_bucket = GridFSBucket(db, bucket_name="cassettes")
    
    # Fetch layer standards and pens for styling
    layer_standards = {s["code"]: s for s in db["layer_standards"].find()}
    pen_templates = {str(p["_id"]): p for p in db["pen_templates"].find()}
    
    doc_cache = {}
    generated_files = []
    
    for container in transforms_data:
        container_id = container.get("container_id")
        transforms = container.get("transforms")
        sheet_w = container.get("width", 0)
        sheet_h = container.get("height", 0)
        
        logger.info(f"Processing container {container_id} with {len(transforms)} items")
        
        new_doc = ezdxf.new()
        new_msp = new_doc.modelspace()
        
        # Add sheet boundary
        if sheet_w > 0 and sheet_h > 0:
            if "SHEET" not in new_doc.layers:
                l = new_doc.layers.new("SHEET")
                l.rgb = (128, 128, 128) # Gray
                l.dxf.lineweight = 15 # 0.15mm
            
            # Draw rectangle
            new_msp.add_lwpolyline([(0, 0), (sheet_w, 0), (sheet_w, sheet_h), (0, sheet_h)], close=True, dxfattribs={'layer': 'SHEET'})
        
        # Pre-create standard layers with styles
        for code, std in layer_standards.items():
            layer_name = code
            pen_id = str(std.get("defaultPenId"))
            pen = pen_templates.get(pen_id)
            
            if layer_name not in new_doc.layers:
                l = new_doc.layers.new(layer_name)
                if pen:
                    stroke = pen.get("stroke", {})
                    color_hex = stroke.get("color", "#FFFFFF").lstrip("#")
                    if len(color_hex) == 6:
                        rgb = tuple(int(color_hex[i:i+2], 16) for i in (0, 2, 4))
                        l.rgb = rgb
                    
                    weight = stroke.get("weight", 0.25)
                    l.dxf.lineweight = int(weight * 100)
                    
                    pattern = stroke.get("pattern", "SOLID")
                    if pattern == "DASHED":
                        l.dxf.linetype = "DASHED"
                    elif pattern == "DOTTED":
                        l.dxf.linetype = "DOTTED"

        for transform in transforms:
            cassette_id_str = transform.get("cassette_id")
            cassette_id = ObjectId(cassette_id_str)
            
            cassette = cassettes_collection.find_one({"_id": cassette_id})
            if not cassette:
                cassette = baked_cassettes_collection.find_one({"_id": cassette_id})
                
            if not cassette:
                logger.error(f"Cassette {cassette_id} not found")
                continue
                
            dxf_id = cassette.get("dxfId")
            if not dxf_id:
                 continue
                 
            source_doc = read_dxf_from_gridfs(cassettes_bucket, dxf_id, doc_cache)
            layer_mapping = cassette.get("layerMapping", {})
            
            source_msp = source_doc.modelspace()
            entities = list(source_msp)
            
            if not entities:
                continue
            
            # Use Loader to copy resources (blocks, linetypes)
            # but we will manually add entities to control layers
            loader = xref.Loader(source_doc, new_doc)
            
            # Transform matrix
            x = transform.get("x", 0)
            y = transform.get("y", 0)
            angle = transform.get("angle", 0)
            
            rotationMatrix = Matrix44.z_rotate(angle)
            translationMatrix = Matrix44.translate(x, y, 0)
            matrix = rotationMatrix * translationMatrix
            
            for entity in entities:
                try:
                    source_layer = entity.dxf.layer
                    target_layer = layer_mapping.get(source_layer)
                    
                    if not target_layer:
                        if source_layer in layer_standards:
                            target_layer = source_layer
                        else:
                            target_layer = source_layer
                    
                    if target_layer not in new_doc.layers:
                        new_doc.layers.new(target_layer)
                    
                    # Copy entity
                    new_entity = entity.copy()
                    new_msp.add_entity(new_entity)
                    new_entity.dxf.layer = target_layer
                    new_entity.transform(matrix)
                except Exception as ex:
                    logger.warning(f"Failed to copy entity: {ex}")
            
            # Execute loader to finalize resource copies if any
            loader.execute()
                
        # Save file
        filename = f"{slug}_part_{container_id}.dxf"
        filepath = os.path.join(output_dir, filename)
        new_doc.saveas(filepath)
        generated_files.append({"filename": filename, "path": filepath})
        logger.info(f"Saved {filepath}")
        
    return generated_files

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--transforms", required=True, help="Path to transforms JSON file")
    parser.add_argument("--output-dir", required=True, help="Directory to save DXF files")
    parser.add_argument("--slug", required=True, help="Job slug")
    
    args = parser.parse_args()
    
    try:
        with open(args.transforms, 'r') as f:
            transforms_data = json.load(f)
            
        client = create_mongo_client()
        files = process_transforms(transforms_data, args.output_dir, args.slug, client)
        print(json.dumps(files))
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)
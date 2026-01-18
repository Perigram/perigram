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

def hex_to_aci(hex_color):
    # Very simple mapping for common colors to AutoCAD Color Index (ACI)
    hex_color = hex_color.upper().lstrip('#')
    if hex_color == 'FF0000': return 1 # Red
    if hex_color == 'FFFF00': return 2 # Yellow
    if hex_color == '00FF00': return 3 # Green
    if hex_color == '00FFFF': return 4 # Cyan
    if hex_color == '0000FF': return 5 # Blue
    if hex_color == 'FF00FF': return 6 # Magenta
    if hex_color == 'FFFFFF': return 7 # White
    if hex_color == '000000': return 7 # Black (on white bg) or white (on black bg)
    if hex_color == '808080': return 8 # Gray
    return 7 # Default White/Black

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
        
        # Pre-create standard layers with styles
        for code, std in layer_standards.items():
            layer_name = code
            pen_id = str(std.get("defaultPenId"))
            pen = pen_templates.get(pen_id)
            
            if layer_name not in new_doc.layers:
                l = new_doc.layers.new(layer_name)
                if pen:
                    stroke = pen.get("stroke", {})
                    color_hex = stroke.get("color", "#FFFFFF")
                    l.color = hex_to_aci(color_hex)
                    
                    # Set TrueColor if possible
                    clean_hex = color_hex.lstrip("#")
                    if len(clean_hex) == 6:
                        rgb = tuple(int(clean_hex[i:i+2], 16) for i in (0, 2, 4))
                        l.rgb = rgb
                    
                    weight = stroke.get("weight", 0.25)
                    # AutoCAD weight is in mm * 100
                    # Standard weights: 0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211
                    l.dxf.lineweight = int(weight * 100)
                    
                    pattern = stroke.get("pattern", "SOLID").upper()
                    if pattern == "DASHED":
                        if "DASHED" not in new_doc.linetypes:
                            new_doc.linetypes.new("DASHED", dxfattribs={"description": "Dashed", "pattern": [10.0, 5.0, -5.0]})
                        l.dxf.linetype = "DASHED"
                    elif pattern == "DOTTED":
                        if "DOTTED" not in new_doc.linetypes:
                            new_doc.linetypes.new("DOTTED", dxfattribs={"description": "Dotted", "pattern": [0.0, 5.0, -5.0]})
                        l.dxf.linetype = "DOTTED"

        new_msp = new_doc.modelspace()
        
        # Add sheet boundary
        if sheet_w > 0 and sheet_h > 0:
            if "SHEET" not in new_doc.layers:
                l = new_doc.layers.new("SHEET")
                l.color = 8 # Gray
                l.dxf.lineweight = 15 # 0.15mm
            
            # Draw rectangle
            new_msp.add_lwpolyline([(0, 0), (sheet_w, 0), (sheet_w, sheet_h), (0, sheet_h)], close=True, dxfattribs={'layer': 'SHEET'})


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
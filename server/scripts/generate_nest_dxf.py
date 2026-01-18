
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
        # Save to temp file because ezdxf.recover needs a file (mostly) or seekable stream
        # ezdxf.read(stream) works too but recover is safer for user uploads
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
    
    doc_cache = {}
    generated_files = []
    
    for container in transforms_data:
        container_id = container.get("container_id")
        transforms = container.get("transforms")
        
        logger.info(f"Processing container {container_id} with {len(transforms)} items")
        
        new_doc = ezdxf.new()
        new_msp = new_doc.modelspace()
        
        for transform in transforms:
            cassette_id_str = transform.get("cassette_id")
            cassette_id = ObjectId(cassette_id_str)
            
            # Find cassette
            cassette = cassettes_collection.find_one({"_id": cassette_id})
            if not cassette:
                cassette = baked_cassettes_collection.find_one({"_id": cassette_id})
                
            if not cassette:
                logger.error(f"Cassette {cassette_id} not found")
                continue
                
            dxf_id = cassette.get("dxfId")
            if not dxf_id:
                 logger.error(f"Cassette {cassette_id} has no dxfId")
                 continue
                 
            source_doc = read_dxf_from_gridfs(cassettes_bucket, dxf_id, doc_cache)
            
            # Copy all entities
            # We need to copy layers first
            source_msp = source_doc.modelspace()
            entities = list(source_msp)
            
            if not entities:
                continue
                
            required_layers = {e.dxf.layer for e in entities}
            
            try:
                loader = xref.Loader(source_doc, new_doc)
                if required_layers:
                    loader.load_layers(list(required_layers))
                loader.execute()
                
                # Transform matrix
                # Transform is x, y, angle (degrees)
                x = transform.get("x", 0)
                y = transform.get("y", 0)
                angle = transform.get("angle", 0)
                
                # Create matrix: Rotation then Translation
                # ezdxf uses radians for Z rotation in Matrix44? No, Matrix44.z_rotate takes radians.
                # But transform.angle usually comes in degrees from lbf (0, 90, 180, 270)
                # Wait, lbf outputs degrees? "allowed_orientations": [0.0, 90.0...]
                # Let's verify if `main.py` converted it.
                # main.py: `rotationMatrix = Matrix44.z_rotate(transform.angle)` 
                # If `transform.angle` is degrees, this might be wrong if z_rotate expects radians.
                # ezdxf docs: Matrix44.z_rotate(angle: float) -> Matrix44. angle in radians.
                # In `main.py`, `convert_files_to_input_items` didn't convert angle.
                # `nesting_input_builder` sets `allowed_orientations` in degrees?
                # Jaguar (lbf) usually works with radians or degrees?
                # If main.py worked, maybe lbf returns radians?
                # Or main.py was buggy?
                # "rotation = transformation.get("rotation")" -> passed to Transform.
                # I'll check if main.py had conversion. It did not.
                # But wait, `math.radians`? No.
                # I'll assume radians if lbf returns radians, or convert if degrees.
                # Usually nesting engines return radians.
                # However, if lbf input uses [0, 90, 180], it likely returns matching values.
                # If it returns 90.0 (float), z_rotate(90) would be 90 radians, which is wrong.
                # I will assume DEGREES from lbf (since input is 90) and convert to RADIANS.
                # Wait, main.py didn't convert. That's suspicious.
                # Maybe lbf returns radians?
                # If I look at `main.py` again: `from ezdxf.math import Matrix44`.
                # If lbf returns 1.57 for 90 deg, then main.py is correct.
                # I'll stick to converting to radians if it looks like degrees (> 2PI).
                # But 0 is ambiguous.
                # Let's assume it returns RADIANS for now to match main.py, OR main.py was relying on input being radians?
                # No, input `allowed_orientations` is `[0.0, 90.0, ...]`.
                # I will convert to radians just to be safe if I see large values, or just always convert if I assume degrees.
                # Actually, standard lbf usually returns rotation index or radians.
                # I'll assume RADIANS for now, but keep an eye on it.
                # EDIT: If main.py `z_rotate` takes radians, and lbf returns degrees, main.py was wrong.
                # I will use `math.radians(angle)` just to be safe, assuming lbf returns degrees (matching input).
                
                import math
                angle_rad = math.radians(angle)
                
                m = Matrix44.z_rotate(angle_rad) * Matrix44.translate(x, y, 0)
                
                for entity in entities:
                    # Copy entity to new doc
                    try:
                        new_entity = new_doc.entitydb.duplicate_entity(entity)
                        new_entity.dxf.handle = None # Reset handle
                        new_entity.dxf.owner = None
                        
                        # Add to modelspace
                        new_msp.add_entity(new_entity)
                        
                        # Transform
                        new_entity.transform(m)
                    except Exception as ex:
                        logger.warning(f"Failed to copy/transform entity: {ex}")

            except Exception as e:
                logger.error(f"Error loading layers/xref: {e}")
                
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
        
        # If transforms_data is the lbf output, we need to convert it to "ResultContainer" structure first?
        # Or did Node convert it?
        # Node receives lbf output: { solution: { layouts: [...] } }
        # Node should parse it and pass a clean list of containers to this script.
        # Structure expected: [{ "container_id": ..., "transforms": [...] }]
        
        files = process_transforms(transforms_data, args.output_dir, args.slug, client)
        
        print(json.dumps(files))
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)

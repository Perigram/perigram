
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
                x = transform.get("x", 0)
                y = transform.get("y", 0)
                angle = transform.get("angle", 0)
                
                # Match main.py: rotation then translation
                rotationMatrix = Matrix44.z_rotate(angle)
                translationMatrix = Matrix44.translate(x, y, 0)
                matrix = rotationMatrix * translationMatrix
                
                for entity in entities:
                    try:
                        # Copy entity using ezdxf xref-safe way (copy then add to msp)
                        # entity.copy() works if resources are already loaded by Loader
                        new_entity = entity.copy()
                        new_msp.add_entity(new_entity)
                        new_entity.transform(matrix)
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

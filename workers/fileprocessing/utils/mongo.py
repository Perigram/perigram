import gridfs
from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()

from .logger import setup_logger

logger = setup_logger("mongo")

def create_mongo_client():
    mongo_uri = os.environ.get("MONGO_URI") or os.environ.get("MONGODB_URI")
    if not mongo_uri:
        logger.error("Error: Neither 'MONGO_URI' nor 'MONGODB_URI' found in environment variables.")
        raise Exception("Mongo connection failed")

    # Mask password for logging
    from urllib.parse import urlparse
    parsed = urlparse(mongo_uri)
    if parsed.password:
        masked_uri = mongo_uri.replace(parsed.password, "********")
    else:
        masked_uri = mongo_uri
        
    logger.info(f"Connecting to MongoDB with URI: {masked_uri}")
    return MongoClient(mongo_uri)


_client : MongoClient = create_mongo_client()

# Determine database name
db_name = os.environ.get("MONGO_DB_NAME")
if not db_name:
    try:
        db = _client.get_default_database()
        db_name = db.name
    except Exception:
        raise Exception("MongoDB database name not provided. Set MONGO_DB_NAME or include it in MONGO_URI.")
else:
    db = _client[db_name]

logger.info(f"Using database: {db_name}")

user_dxf_bucket = gridfs.GridFSBucket(db, bucket_name="userDxf")
valid_dxf_bucket = gridfs.GridFSBucket(db, bucket_name="validDxf")

user_dxf_files_svg_bucket = gridfs.GridFSBucket(db, bucket_name="userDxfFilesSvg")


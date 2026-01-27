from gridfs import GridFSBucket
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
    try:
        from urllib.parse import urlparse
        hostname = parsed.hostname
        port = parsed.port
        logger.info(f"Target host: {hostname}, Port: {port}")
    except Exception as e:
        logger.warning(f"Could not parse hostname from URI: {e}")
        
    return MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)


_client : MongoClient = create_mongo_client()

# Try to get database: 
# 1. From MONGO_DB_NAME env var
# 2. From default database in URI
# 3. Fallback to 'cutkit_dev'
db_name = os.environ.get("MONGO_DB_NAME")
if db_name:
    db = _client[db_name]
else:
    try:
        db = _client.get_default_database()
    except Exception:
        db = _client['cutkit_dev']

logger.info(f"Using database: {db.name}")

user_dxf_bucket = GridFSBucket(db, bucket_name="userDxf")
valid_dxf_bucket = GridFSBucket(db, bucket_name="validDxf")

user_dxf_files_svg_bucket = GridFSBucket(db, bucket_name="userDxfFilesSvg")


svg_result_bucket = GridFSBucket(db, bucket_name="nestSvg")
dxf_result_bucket = GridFSBucket(db, bucket_name="nestDxf")

# Add cassettes bucket for new cassette system
cassettes_bucket = GridFSBucket(db, bucket_name="cassettes")


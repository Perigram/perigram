import os
from pymongo import MongoClient
from gridfs import GridFSBucket

MONGODB_URI = os.environ.get('MONGODB_URI') or os.environ.get('MONGO_URI') or 'mongodb://localhost:27017/cutkit_demo'

_client = MongoClient(MONGODB_URI)

# Determine database name
db_name = os.environ.get("MONGO_DB_NAME")
if not db_name:
    try:
        db = _client.get_default_database()
    except Exception:
        raise Exception("MongoDB database name not provided. Set MONGO_DB_NAME or include it in MONGO_URI.")
else:
    db = _client[db_name]

# Mask password for logging
from urllib.parse import urlparse
parsed = urlparse(MONGODB_URI)
if parsed.password:
    masked_uri = MONGODB_URI.replace(parsed.password, "********")
else:
    masked_uri = MONGODB_URI
    
print(f"Connecting to MongoDB with URI: {masked_uri}")
print(f"Using database: {db.name}")

# GridFS buckets
cassettes_bucket = GridFSBucket(db, bucket_name='cassettes')

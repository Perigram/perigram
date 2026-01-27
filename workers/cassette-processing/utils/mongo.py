import os
from pymongo import MongoClient
from gridfs import GridFSBucket

MONGODB_URI = os.environ.get('MONGODB_URI') or os.environ.get('MONGO_URI') or 'mongodb://localhost:27017/cutkit_demo'

_client = MongoClient(MONGODB_URI)

# Try to get default database from URI, fallback to 'cutkit_dev' if not specified
try:
    db = _client.get_default_database()
except Exception:
    db = _client['cutkit_dev']

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

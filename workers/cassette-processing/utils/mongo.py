import os
from pymongo import MongoClient
from gridfs import GridFSBucket

MONGODB_URI = os.environ.get('MONGODB_URI', 'mongodb://localhost:27017')
DATABASE_NAME = os.environ.get('DATABASE_NAME', 'cutkit_demo')

_client = MongoClient(MONGODB_URI)
db = _client[DATABASE_NAME]

# GridFS buckets
cassettes_bucket = GridFSBucket(db, bucket_name='cassettes')

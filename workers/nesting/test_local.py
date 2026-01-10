import os
os.environ['MONGO_URI'] = 'mongodb://localhost:27017/cutkit_dev'
os.environ['PATH'] = os.environ['PATH'] + ':' + os.getcwd()

# Now run the worker
import main

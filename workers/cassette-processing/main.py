import os
import time
import traceback
import threading
import signal
import sys
import json
import urllib.request
from datetime import datetime
from utils.logger import setup_logger
from utils.mongo import db, _client
from bson import ObjectId
from core.process import process_cassette

logger = setup_logger("cassette_processing_worker")
logger.info("Starting cassette processing worker")

keep_alive_interval = 10

current_doc_id = None
shutdown_requested = False

def signal_handler(signum, frame):
    """Handle graceful shutdown signals"""
    global current_doc_id, shutdown_requested
    
    logger.info(f"Received {signum} signal, initiating graceful shutdown")
    
    shutdown_requested = True
    
    if current_doc_id:
        try:
            logger.info(f"Shutdown while processing cassette {current_doc_id}")
        except Exception as e:
            logger.error(f"Failed to reset job {current_doc_id}: {e}")
    else:
        logger.info("No current job to reset")
    
    logger.info("Graceful shutdown completed")
    sys.exit(0)

signal.signal(signal.SIGTERM, signal_handler)

try:
    db.command('ping')
    logger.info("Database connection successful")

except Exception as e:
    logger.error(f"Database connection failed: {e}")
    raise e

cassettes = db["cassettes"]
PROCESS_API_URL = os.environ.get("PERIGRAM_API_URL", "http://app:3000").rstrip("/")
WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "")

def mark_task_run(task_run_id, status, output=None, error=None):
    if not task_run_id:
        return
    endpoint = {
        "RUNNING": "heartbeat",
        "SUCCEEDED": "complete",
        "FAILED": "fail"
    }.get(status)
    if not endpoint:
        return
    result = output or {}
    payload = {"result": result, "claimToken": result.get("claimToken"), "message": str(error) if error else None}
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{PROCESS_API_URL}/api/tasks/{task_run_id}/{endpoint}",
        data=data,
        headers={"Content-Type": "application/json", "x-worker-token": WORKER_TOKEN},
        method="POST"
    )
    try:
        urllib.request.urlopen(request, timeout=5).read()
    except Exception as e:
        logger.error(f"Failed to update task run {task_run_id}: {e}")

def claim_task():
    payload = {
        "taskId": "cassette.bakeTemplate",
        "workerType": "cassette-processing",
        "workerId": os.environ.get("WORKER_ID", "cassette-processing"),
        "leaseMs": 60000
    }
    request = urllib.request.Request(
        f"{PROCESS_API_URL}/api/tasks/claim",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-worker-token": WORKER_TOKEN},
        method="POST"
    )
    try:
        data = urllib.request.urlopen(request, timeout=5).read()
        return json.loads(data.decode("utf-8")).get("run")
    except Exception as e:
        logger.error(f"Failed to claim task: {e}")
        return None

def keep_alive_worker():
    global current_doc_id
    
    while not shutdown_requested:
        if current_doc_id:
            try:
                cassettes.update_one(
                    {"_id": current_doc_id},
                    {"$set": {"update_ts": datetime.now()}}
                )
                logger.debug(f"Updated keep-alive for cassette {current_doc_id}")
            except Exception as e:
                logger.error(f"Failed to update keep-alive: {e}")
        
        time.sleep(keep_alive_interval)

keepalive_thread = threading.Thread(target=keep_alive_worker, daemon=True)
keepalive_thread.start()

logger.info("Cassette processing worker started")

while not shutdown_requested:
    logger.info("Worker trying to claim cassette task")
    task_run = claim_task()
    if not task_run:
        time.sleep(5)
        continue
    cassette_id = task_run.get("input", {}).get("entities", {}).get("cassette")
    doc = cassettes.find_one({"_id": ObjectId(cassette_id) if ObjectId.is_valid(str(cassette_id)) else cassette_id})
    if doc is None:
        mark_task_run(task_run.get("_id"), "FAILED", {"claimToken": task_run.get("claimToken")}, error=Exception("Cassette not found"))
        continue
    
    current_doc_id = doc["_id"]
    
    try:
        claim_token = task_run.get("claimToken")
        mark_task_run(task_run.get("_id"), "RUNNING", {"claimToken": claim_token})
        cassettes.update_one(
            {"_id": current_doc_id },
            {"$set": {"update_ts": datetime.now()}}
        )
        
        logger.info(f"Processing cassette: {doc['name']}")
        result = process_cassette(doc)
        
        cassettes.update_one(
            {"_id": current_doc_id},
            {"$set": {
                "update_ts": datetime.now()
            }}
        )
        mark_task_run(task_run.get("_id"), "SUCCEEDED", {
            "taskId": "cassette.bakeTemplate",
            "claimToken": claim_token,
            "entities": [{"type": "cassette", "id": str(current_doc_id)}],
            "data": {"status": "done"}
        })
        
        logger.info(f"Successfully processed cassette: {doc['name']}")
        
    except Exception as e:
        logger.error(f"Error processing cassette", extra={"error": str(e), "traceback": traceback.format_exc()})
        cassettes.update_one(
            {"_id": current_doc_id},
            {"$set": {
                "error": str(e),
                "update_ts": datetime.now()
            }}
        )
        mark_task_run(task_run.get("_id"), "FAILED", {"claimToken": claim_token}, error=e)
    finally:
        current_doc_id = None

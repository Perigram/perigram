import time
import traceback
import threading
import signal
import sys
import os
import json
import urllib.request
from datetime import datetime
from utils.logger import setup_logger
from utils.mongo import db
from pymongo import ReturnDocument
from core.main import nesting_process

logger = setup_logger("main_nesting")
logger.info("Starting new nesting worker")

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
            logger.info(f"Resetting current job {current_doc_id} to pending status")
            nesting_jobs.update_one(
                {"_id": current_doc_id},
                {"$set": {"status": "pending"}}
            )
            logger.info(f"Successfully reset job {current_doc_id} to pending")
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

nesting_jobs = db["nesting_jobs"]
PROCESS_API_URL = os.environ.get("CUTKIT_API_URL", "http://app:3000").rstrip("/")
WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "")

def mark_process_run(process_run_id, status, output=None, error=None):
    if not process_run_id:
        return
    endpoint = {
        "RUNNING": "heartbeat",
        "SUCCEEDED": "complete",
        "FAILED": "fail"
    }.get(status)
    if not endpoint:
        return
    payload = {"result": output or {}, "message": str(error) if error else None}
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{PROCESS_API_URL}/api/processes/{process_run_id}/{endpoint}",
        data=data,
        headers={"Content-Type": "application/json", "x-worker-token": WORKER_TOKEN},
        method="POST"
    )
    try:
        urllib.request.urlopen(request, timeout=5).read()
    except Exception as e:
        logger.error(f"Failed to update process run {process_run_id}: {e}")

def keep_alive_worker():
    global current_doc_id
    
    while not shutdown_requested:
        if current_doc_id:
            try:
                nesting_jobs.update_one(
                    {"_id": current_doc_id},
                    {"$set": {"update_ts": datetime.now()}}
                )
                logger.debug(f"Updated keep-alive for document {current_doc_id}")
            except Exception as e:
                logger.error(f"Failed to update keep-alive: {e}")
        
        time.sleep(keep_alive_interval)

keepalive_thread = threading.Thread(target=keep_alive_worker, daemon=True)
keepalive_thread.start()

while not shutdown_requested:
    logger.info("Worker nesting try to find new files to process")
    doc = nesting_jobs.find_one_and_update(
        {"status": "pending"},
        {"$set": {"status": "processing"}},
        return_document=ReturnDocument.AFTER
    )
    
    if doc is None:
        time.sleep(5)
        continue
    
    current_doc_id = doc["_id"]
    
    try:
        start_at = datetime.now()
        mark_process_run(doc.get("processRunId"), "RUNNING")
        nesting_jobs.update_one(
            {"_id": current_doc_id },
            {
                "$set": {
                    "update_ts": datetime.now(),
                    "startAt": start_at,
                },
            },
        )
        
        nesting_process(doc)
        
        time_taken = datetime.now() - start_at
        import math
        time_taken_minutes = math.ceil(time_taken.total_seconds() / 60)
        
        nesting_jobs.update_one(
            {"_id": current_doc_id},
            {
                "$set": {
                    "status": "done",
                    "finishedAt": datetime.now(),
                    "update_ts": datetime.now(),
                    "timeTaken": time_taken_minutes
                }
            }
        )
        mark_process_run(doc.get("processRunId"), "SUCCEEDED", {
            "processId": "nesting.solve",
            "entities": [{"type": "nesting_run", "id": str(doc.get("runId"))}],
            "data": {"nestingSlug": doc.get("slug"), "timeTaken": time_taken_minutes}
        })
        
    except Exception as e:
        logger.error("Error in project processing", extra={"error": str(e), "traceback": traceback.format_exc()})
        nesting_jobs.update_one(
            {"_id": current_doc_id},
            {"$set": {
                "status": "error",
                "error": str(e),
                "update_ts": datetime.now(),
                "finishedAt": datetime.now()
            }}
        )
        mark_process_run(doc.get("processRunId"), "FAILED", error=e)
    finally:
        current_doc_id = None

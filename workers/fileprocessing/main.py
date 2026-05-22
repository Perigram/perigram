import os
import time
import traceback
import threading
import signal
import sys
import json
import urllib.request
from datetime import datetime, timedelta
from utils.logger import setup_logger
from utils.mongo import db, _client
from pymongo import ReturnDocument
from core.main import process_file

logger = setup_logger("main_fileprocessing")
logger.info("Starting new file processing worker")

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
            user_dxf_files.update_one(
                {"_id": current_doc_id},
                {"$set": {"processingStatus": "pending"}}
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

user_dxf_files = db["user_dxf_files"]
PROCESS_API_URL = os.environ.get("CUTKIT_API_URL", "http://app:3000").rstrip("/")
WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "")

def mark_process_run(process_run_id, status, output=None, error=None):
    if not process_run_id:
        return
    endpoint = {
        "RUNNING": "heartbeat",
        "SUCCEEDED": "complete",
        "FAILED": "fail",
        "QUEUED": "cancel"
    }.get(status)
    if not endpoint:
        return
    payload = {"result": output or {}, "message": str(error) if error else None, "reason": "Worker released job"}
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
                user_dxf_files.update_one(
                    {"_id": current_doc_id},
                    {"$set": {"update_ts": datetime.now()}}
                )
                logger.debug(f"Updated keep-alive for document {current_doc_id}")
            except Exception as e:
                logger.error(f"Failed to update keep-alive: {e}")
        
        time.sleep(keep_alive_interval)

keepalive_thread = threading.Thread(target=keep_alive_worker, daemon=True)
keepalive_thread.start()

woker_tag = os.environ.get("WORKER_TAG", "normal")

logger.info("Worker file processing started with tag", extra={"tag": woker_tag})

while not shutdown_requested:
    logger.info("Worker file processing try to find new files to process")
    doc = user_dxf_files.find_one_and_update(
        {"processingStatus": "pending", "worker_tag": woker_tag },
        {"$set": {"processingStatus": "processing"}},
        return_document=ReturnDocument.AFTER
    )
    
    if doc is None:
        time.sleep(5)
        continue
    
    current_doc_id = doc["_id"]
    
    try:
        mark_process_run(doc.get("processRunId"), "RUNNING")
        user_dxf_files.update_one(
            {"_id": current_doc_id },
            {"$set": {"update_ts": datetime.now()}}
        )
        result = process_file(doc)
        
        if result:
            user_dxf_files.update_one(
                {"_id": current_doc_id},
                {"$set": {"processingStatus": "completed"}}
            )
            mark_process_run(doc.get("processRunId"), "SUCCEEDED", {
                "processId": "dxf.parseUpload",
                "data": {"fileId": str(current_doc_id), "status": "completed"}
            })
        else:
            user_dxf_files.update_one(
                {"_id": current_doc_id},
                {"$set": {"processingStatus": "pending"}}
            )
            mark_process_run(doc.get("processRunId"), "QUEUED")
            
    except Exception as e:
        logger.error("Error in project processing", extra={"error": str(e), "traceback": traceback.format_exc()})
        user_dxf_files.update_one(
            {"_id": current_doc_id},
            {"$set": {"processingStatus": "error",
                      "processingError": str(e)}}
        )
        mark_process_run(doc.get("processRunId"), "FAILED", error=e)
    finally:
        current_doc_id = None

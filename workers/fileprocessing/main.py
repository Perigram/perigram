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
from bson import ObjectId
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
            logger.info(f"Shutdown while processing upload {current_doc_id}")
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
PROCESS_API_URL = os.environ.get("PERIGRAM_API_URL", "http://app:3000").rstrip("/")
WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "")

def mark_task_run(task_run_id, status, output=None, error=None):
    if not task_run_id:
        return
    endpoint = {
        "RUNNING": "heartbeat",
        "SUCCEEDED": "complete",
        "FAILED": "fail",
        "QUEUED": "cancel"
    }.get(status)
    if not endpoint:
        return
    result = output or {}
    payload = {
        "result": result,
        "claimToken": result.get("claimToken"),
        "message": str(error) if error else None,
        "reason": "Worker released task"
    }
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
        "taskId": "dxf.parseUpload",
        "workerType": "file-processing",
        "workerId": os.environ.get("WORKER_ID", woker_tag),
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
    logger.info("Worker file processing try to claim new task")
    task_run = claim_task()
    if not task_run:
        time.sleep(5)
        continue
    upload_id = task_run.get("input", {}).get("entities", {}).get("upload")
    doc = user_dxf_files.find_one({"_id": ObjectId(upload_id) if ObjectId.is_valid(str(upload_id)) else upload_id})
    if doc is None:
        mark_task_run(task_run.get("_id"), "FAILED", {"claimToken": task_run.get("claimToken")}, error=Exception("Upload document not found"))
        continue
    
    current_doc_id = doc["_id"]
    
    try:
        claim_token = task_run.get("claimToken")
        mark_task_run(task_run.get("_id"), "RUNNING", {"claimToken": claim_token})
        user_dxf_files.update_one(
            {"_id": current_doc_id },
            {"$set": {"update_ts": datetime.now()}}
        )
        result = process_file(doc)
        
        if result:
            user_dxf_files.update_one(
                {"_id": current_doc_id},
                {"$set": {"update_ts": datetime.now()}}
            )
            mark_task_run(task_run.get("_id"), "SUCCEEDED", {
                "taskId": "dxf.parseUpload",
                "claimToken": claim_token,
                "data": {"fileId": str(current_doc_id), "status": "completed"}
            })
        else:
            mark_task_run(task_run.get("_id"), "FAILED", error=Exception("File processor returned no result"))
            
    except Exception as e:
        logger.error("Error in project processing", extra={"error": str(e), "traceback": traceback.format_exc()})
        user_dxf_files.update_one(
            {"_id": current_doc_id},
            {"$set": {"processingError": str(e), "update_ts": datetime.now()}}
        )
        mark_task_run(task_run.get("_id"), "FAILED", {"claimToken": claim_token}, error=e)
    finally:
        current_doc_id = None

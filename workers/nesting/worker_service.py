from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json
import subprocess
import os
import sys
import tempfile
import shutil
from pathlib import Path
from shapely.geometry import Polygon
import logging

# Ensure we can import from core
sys.path.append(str(Path(__file__).parent))

from core.nesting_input_builder import build_input_json, build_item

# Setup logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nesting_worker")

app = FastAPI()

class NestingItem(BaseModel):
    id: int
    cassette_id: str
    coords: List[Any] # [[x,y], ...]
    handles: List[str]
    count: int

class NestingParams(BaseModel):
    width: float
    height: float
    space: float
    sheetCount: int

class NestingRequest(BaseModel):
    items: List[NestingItem]
    params: NestingParams

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/nest")
def run_nesting(request: NestingRequest):
    logger.info(f"Received nesting request with {len(request.items)} items")
    
    jaguar_items = []
    
    # Process items: Buffer and convert to lbf format
    for item in request.items:
        try:
            # Create shapely polygon from coords
            poly = Polygon(item.coords)
            
            # Buffer the polygon by space
            # Note: space is applied to each item, essentially adding space/2 margin?
            # In main.py: buffered_polygon = shapely_polygon.buffer(space)
            # This adds 'space' amount to all sides. So distance between two items will be 2*space.
            # If 'space' means gap between items, usually we buffer by space/2.
            # But adhering to existing main.py logic:
            if request.params.space > 0:
                buffered_poly = poly.buffer(request.params.space)
            else:
                buffered_poly = poly
                
            # Simplify if needed (optional, existing main.py didn't simplify explicitly here but lbf might)
            
            # Get coords
            if buffered_poly.is_empty:
                logger.warning(f"Item {item.id} became empty after buffering")
                continue
                
            # Handle MultiPolygon if buffer creates it (unlikely for simple expansion but possible)
            if buffered_poly.geom_type == 'MultiPolygon':
                # Take the largest one? Or fail?
                # For nesting, we usually want the outer boundary.
                buffered_poly = max(buffered_poly.geoms, key=lambda a: a.area)
                
            buffered_coords = list(buffered_poly.exterior.coords)
            
            # Build item using core utility
            j_item = build_item(item.id, item.count, buffered_coords)
            jaguar_items.append(j_item)
            
        except Exception as e:
            logger.error(f"Error processing item {item.id}: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid geometry for item {item.id}: {str(e)}")

    # Build full input json
    input_json = build_input_json(
        request.params.sheetCount,
        request.params.width,
        request.params.height,
        jaguar_items
    )
    
    # Create temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(input_json, f)
        input_file = f.name
        
    solution_folder = tempfile.mkdtemp()
    
    try:
        logger.info("Running lbf...")
        result = subprocess.run(
            ['lbf', '--input-file', input_file, '--solution-folder', solution_folder, '--prob-var', 'bpp'],
            capture_output=True,
            text=True,
            timeout=3600
        )
        
        if result.returncode != 0:
            logger.error(f"lbf failed: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"lbf failed: {result.stderr}")
            
        # Read Output
        json_files = [f for f in os.listdir(solution_folder) if f.endswith('.json')]
        if not json_files:
             # lbf might not produce output if no solution?
             raise HTTPException(status_code=500, detail="No solution file found from lbf")
             
        solution_file = os.path.join(solution_folder, json_files[0])
        with open(solution_file, 'r') as f:
            output = json.load(f)
            
        return output

    finally:
        if os.path.exists(input_file):
            os.unlink(input_file)
        if os.path.exists(solution_folder):
            shutil.rmtree(solution_folder)
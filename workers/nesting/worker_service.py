from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Union
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
from core.geometry_utils import create_safe_polygon

# Setup logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nesting_worker")

app = FastAPI()

class NestingItem(BaseModel):
    id: int
    source_id: Optional[str] = None
    coords: List[Any] # [[x,y], ...]
    handles: List[str]
    count: int

class NestingParams(BaseModel):
    width: float
    height: float
    space: float
    sheetCount: int
    sheet_polygon: Optional[Union[List[List[float]], Dict[str, Any]]] = None

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
            poly = create_safe_polygon(item.coords)
            
            if not poly:
                logger.warning(f"Item {item.id} has invalid coordinates, skipping")
                continue
            
            # Buffer the polygon by space
            if request.params.space > 0:
                buffered_poly = poly.buffer(request.params.space)
            else:
                buffered_poly = poly
                
            if buffered_poly.is_empty:
                logger.warning(f"Item {item.id} became empty after buffering")
                continue
                
            if buffered_poly.geom_type == 'MultiPolygon':
                buffered_poly = max(buffered_poly.geoms, key=lambda a: a.area)
                
            buffered_coords = list(buffered_poly.exterior.coords)
            
            # lbf requires consecutive IDs starting from 0
            lbf_id = len(jaguar_items)
            
            j_item = build_item(lbf_id, item.count, buffered_coords)
            j_item['original_id'] = item.id # Store for internal mapping
            jaguar_items.append(j_item)
            
        except Exception as e:
            logger.error(f"Error processing item {item.id}: {e}")
            continue

    if not jaguar_items:
        return {
            "status": "error",
            "message": "No valid items to nest (all items failed geometry validation)",
            "solution": {"layouts": []}
        }

    # Build full input json
    input_json = build_input_json(
        request.params.sheetCount,
        request.params.width,
        request.params.height,
        jaguar_items,
        bin_polygon=request.params.sheet_polygon
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
             raise HTTPException(status_code=500, detail="No solution file found from lbf")
             
        solution_file = os.path.join(solution_folder, json_files[0])
        with open(solution_file, 'r') as f:
            output = json.load(f)
            
        # Map lbf IDs back to original item IDs in the solution
        id_map = {item['id']: item['original_id'] for item in jaguar_items}
        
        if 'solution' in output and 'layouts' in output['solution']:
            for layout in output['solution']['layouts']:
                if 'placed_items' in layout:
                    for placed in layout['placed_items']:
                        lbf_id = placed.get('item_id')
                        if lbf_id in id_map:
                            placed['item_id'] = id_map[lbf_id]
            
        return output

    finally:
        if os.path.exists(input_file):
            os.unlink(input_file)
        if os.path.exists(solution_folder):
            shutil.rmtree(solution_folder)

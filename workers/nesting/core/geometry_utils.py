from shapely.geometry import Polygon
import logging

logger = logging.getLogger("geometry_utils")

def clean_polygon_coords(coords):
    """
    Cleans and validates coordinates for Shapely Polygon.
    Returns a closed list of coordinates with at least 4 points (3 unique),
    or None if invalid.
    """
    if not coords or len(coords) < 3:
        return None
    
    cleaned = []
    for p in coords:
        if isinstance(p, (list, tuple)) and len(p) >= 2:
            cleaned.append((float(p[0]), float(p[1])))
    
    if len(cleaned) < 3:
        return None

    unique_consecutive = []
    for p in cleaned:
        if not unique_consecutive or p != unique_consecutive[-1]:
            unique_consecutive.append(p)
    
    if len(unique_consecutive) > 1 and unique_consecutive[0] != unique_consecutive[-1]:
        unique_consecutive.append(unique_consecutive[0])
    
    if len(unique_consecutive) < 4:
        return None
        
    return unique_consecutive

def create_safe_polygon(coords):
    """
    Attempts to create a Shapely Polygon safely.
    Forcefully closes the ring and logs coordinates on failure.
    """
    cleaned = clean_polygon_coords(coords)
    if not cleaned:
        return None
    
    try:
        poly = Polygon(cleaned)
        if not poly.is_empty:
            return poly
        return None
    except Exception as e:
        logger.error(f"Shapely failed to construct polygon from {cleaned}. Error: {e}")
        return None

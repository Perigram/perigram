def build_config():
    config = {
        'cde_config': {
            'quadtree_depth': 5,
            'cd_threshold': 16,
            'item_surrogate_config': {
                'n_pole_limits': [[100, 0.0], [20, 0.75], [10, 0.90]],
                'n_ff_poles': 2,
                'n_ff_piers': 0
            }
        },
        'poly_simpl_tolerance': 0.001,
        'min_item_separation': 0.0,
        'prng_seed': 0,
        'n_samples': 5000,
        'ls_frac': 0.2
    }
    return config

def build_item(id, demand, points):
    return {
        'id': id,
        'demand': demand,
        'allowed_orientations': [0.0, 90.0, 180.0, 270.0],
        'shape': {
            'type': 'simple_polygon',
            'data': points
        }
    }
    
def normalize_bin_polygon(polygon):
    if not polygon:
        return None
    if isinstance(polygon, dict):
        outer = polygon.get('outer')
        if not outer:
            return None
        return {
            'outer': outer,
            'inner': polygon.get('inner') or []
        }
    return {
        'outer': polygon,
        'inner': []
    }

def build_bin(stock, width, height, polygon=None):
    normalized_polygon = normalize_bin_polygon(polygon)
    shape_data = {
        'outer': normalized_polygon['outer'] if normalized_polygon else [
            [0.0, 0.0],
            [width, 0.0],
            [width, height],
            [0.0, height],
            [0.0, 0.0]
        ],
        'inner': normalized_polygon['inner'] if normalized_polygon else []
    }
    return {
        'id': 0,
        'cost': 1,
        'stock': stock,
        'shape': {
            'type': 'polygon',
            'data': shape_data
        }
    }

def build_input_json(sheet_count, bin_width, bin_height, items, bin_polygon=None):
    return {
        'name': 'nesting_job',
        'items': items,
        'bins': [
            build_bin(sheet_count, bin_width, bin_height, bin_polygon)
        ]
    }

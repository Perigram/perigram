#!/usr/bin/env python3
"""
Test script for the lbf binary
"""
import json
import subprocess

from core.nesting_input_builder import build_config

def test_lbf():
    sample_input = {
        "config": build_config(),
        "problem_type": "bpp",
        "instance": {
            "name": "Test",
            "items": [
                {
                  "id": 0,
                  "demand": 1,
                  "allowed_orientations": [
                    0.0,
                    180.0
                  ],
                  "shape": {
                    "type": "simple_polygon",
                    "data": [
                      [
                        0.0,
                        0.0
                      ],
                      [
                        2.0,
                        0.0
                      ],
                      [
                        2.0,
                        2.0
                      ],
                      [
                        0.0,
                        2.0
                      ],
                      [
                        0.0,
                        0.0
                      ]
                    ]
                  }
                }
            ],
            "bins": [
              {
                "id": 0,
                "cost": 1,
                "stock": 1,
                "shape": {
                  "type": "polygon",
                  "data": {
                    "outer": [
                      [0.0, 0.0],
                      [100.0, 0.0],
                      [100.0, 100.0],
                      [0.0, 100.0]
                    ]
                  }
                }
              }
            ]
        }
    }
    
    try:
        input_json_as_string : str = json.dumps(sample_input)
        
        result = subprocess.run(
            ['lbf'],
            input=input_json_as_string,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            print("✅ lbf executed successfully!")
            print("Output:")
            print(result.stdout)
        else:
            print("❌ lbf failed with return code:", result.returncode)
            print("Error output:")
            print(result.stderr)
            
    except subprocess.TimeoutExpired:
        print("❌ lbf execution timed out")
    except FileNotFoundError:
        print("❌ lbf binary not found. Make sure it's built and available in PATH")
    except Exception as e:
        print(f"❌ Error running lbf: {e}")

if __name__ == "__main__":
    test_lbf()

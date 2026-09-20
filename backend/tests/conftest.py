import sys
from pathlib import Path

# Ensure backend root is on sys.path for test discovery and absolute imports
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

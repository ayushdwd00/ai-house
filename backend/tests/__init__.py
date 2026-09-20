import sys
from pathlib import Path

# Add backend directory to sys.path so modules and models are resolvable
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

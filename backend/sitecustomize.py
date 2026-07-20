import sys, os
# Ensure the project root (containing the 'app' package) is on PYTHONPATH.
root = os.path.abspath(os.path.dirname(__file__))
if root not in sys.path:
    sys.path.insert(0, root)

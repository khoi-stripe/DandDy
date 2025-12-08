#!/usr/bin/env python3
"""
File watcher that auto-rebuilds bundles when source files change.

Usage (from project root):
    python scripts/watch_bundle.py

Requires watchdog: pip install watchdog
"""

import sys
import time
from pathlib import Path

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
except ImportError:
    print("Error: watchdog not installed. Run: pip install watchdog")
    sys.exit(1)

# Import the bundle builder
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from simple_bundle import main as rebuild_bundles, manager_parts, builder_parts

# Collect all watched files (relative to ROOT)
WATCHED_FILES = set()
for parts_list in [manager_parts, builder_parts]:
    for rel_path in parts_list:
        WATCHED_FILES.add(rel_path)


class BundleRebuildHandler(FileSystemEventHandler):
    """Rebuild bundles when watched JS files change."""
    
    def __init__(self):
        self.last_rebuild = 0
        self.debounce_seconds = 0.5  # Prevent rapid rebuilds
    
    def on_modified(self, event):
        if event.is_directory:
            return
        
        # Get relative path from ROOT
        try:
            rel_path = Path(event.src_path).relative_to(ROOT)
            rel_str = str(rel_path).replace("\\", "/")
        except ValueError:
            return
        
        # Check if this file is in our watch list
        if rel_str not in WATCHED_FILES:
            return
        
        # Debounce rapid changes (e.g., editor saving multiple times)
        now = time.time()
        if now - self.last_rebuild < self.debounce_seconds:
            return
        self.last_rebuild = now
        
        print(f"\n📦 Change detected: {rel_str}")
        print("   Rebuilding bundles...")
        
        try:
            rebuild_bundles()
            print("   ✅ Bundles rebuilt successfully!")
        except Exception as e:
            print(f"   ❌ Error rebuilding: {e}")


def main():
    print("🔍 Bundle Watcher Started")
    print(f"   Watching {len(WATCHED_FILES)} source files...")
    print("   Press Ctrl+C to stop\n")
    
    event_handler = BundleRebuildHandler()
    observer = Observer()
    
    # Watch the root directory and subdirectories
    observer.schedule(event_handler, str(ROOT), recursive=True)
    observer.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n👋 Stopping watcher...")
        observer.stop()
    
    observer.join()
    print("   Done!")


if __name__ == "__main__":
    main()


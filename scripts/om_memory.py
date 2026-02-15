import lancedb
from sentence_transformers import SentenceTransformer
import time
import uuid
import os
import sys

# Configuration
DB_PATH = "C:/Users/holyd/.openclaw/workspace/knowledge/memory/lance_brain"
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"

# 1. Initialize High-Performance Brain (LanceDB)
# -----------------------------------------------------
def init_brain():
    print("🧠 Initializing Memory Core...", file=sys.stderr)
    
    # Ensure directory exists
    os.makedirs(DB_PATH, exist_ok=True)
    
    # Connect
    db = lancedb.connect(DB_PATH)
    
    # Load Model (Automatic download if needed)
    print(f"📉 Loading Embedding Model ({EMBEDDING_MODEL_NAME})...", file=sys.stderr)
    embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    
    return db, embedding_model

# 2. Memory Structures (Schemas)
# -----------------------------------------------------
# We define tables for different memory types:
# - 'episodic': Daily stream of events (Conversations, Actions)
# - 'semantic': Facts, Concepts, World Knowledge
# - 'sensory': Raw input logs (Vision/Hearing metdata)

def create_tables_if_not_exist(db):
    # Episodic Memory Table
    # (id, timestamp, type, content, vector)
    if "episodic" not in db.table_names():
        # Create with dummy data to infer schema (LanceDB pyarrow trick)
        # Or better: LanceDB supports pydantic schemas. 
        # But let's keep it simple with auto-inference from first insert or empty create.
        # Actually LanceDB requires schema or data.
        pass

# 3. Memory Operations
# -----------------------------------------------------
class MemoryCore:
    def __init__(self):
        self.db, self.model = init_brain()
        
    def _embed(self, text):
        return self.model.encode(text).tolist()
        
    def remember(self, content, memory_type="thought", tags=None):
        """Store a new memory."""
        vector = self._embed(content)
        
        data = [{
            "id": str(uuid.uuid4()),
            "timestamp": time.time(),
            "type": memory_type,
            "content": content,
            "tags": tags or [],
            "vector": vector
        }]
        
        table_name = "memory_stream"
        
        if table_name not in self.db.table_names():
            self.db.create_table(table_name, data)
            print(f"✨ Created Neural Pathway: {table_name}", file=sys.stderr)
        else:
            self.db.open_table(table_name).add(data)
            
        print(f"💾 Memory Stored: [{memory_type}] {content[:50]}...", file=sys.stderr)

    def recall(self, query, limit=3, memory_type=None):
        """Retrieve relevant memories."""
        if "memory_stream" not in self.db.table_names():
            return []
            
        vector = self._embed(query)
        table = self.db.open_table("memory_stream")
        
        # Search
        # Note: 'metric' default is L2 (Euclidean). 'cosine' is good too.
        # LanceDB search API: .search(vector).limit(limit).to_list()
        
        # Filter (optional) - LanceDB SQL support is basic right now in some versions
        # Filtering is usually done pre/post or via .where() if supported.
        # Assuming latest version supports .where()
        
        search_result = table.search(vector).limit(limit).to_list()
        
        results = []
        for r in search_result:
            results.append({
                "content": r["content"],
                "type": r["type"],
                "timestamp": r["timestamp"],
                "score": 1 - r["_distance"] # approximation
            })
            
        return results

    def introspect(self):
        """Dump recent short-term memory."""
        if "memory_stream" not in self.db.table_names():
            return "Mind is empty."
            
        table = self.db.open_table("memory_stream")
        # Get last 5
        # LanceDB doesn't have easy 'tail', so we query all or search dummy.
        # Efficient way: Just return stats for now.
        return f"Total Memories: {len(table)}"

# 4. CLI Interface for PowerShell
# -----------------------------------------------------
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: om_memory.py [store|recall] [content]")
        sys.exit(1)
        
    command = sys.argv[1]
    
    brain = MemoryCore()
    
    if command == "store":
        content = sys.argv[2]
        m_type = sys.argv[3] if len(sys.argv) > 3 else "thought"
        brain.remember(content, m_type)
        print("OK")
        
    elif command == "recall":
        query = sys.argv[2]
        memories = brain.recall(query)
        import json
        print(json.dumps(memories, indent=2))
        
    elif command == "stats":
        print(brain.introspect())

    else:
        print("Unknown command")

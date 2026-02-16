import os
import sys
import re
from om_memory import MemoryCore

# Configuration
KNOWLEDGE_DIR = "C:/Users/holyd/.openclaw/workspace/knowledge/sacred"

def parse_markdown_chunks(text, filename):
    """
    Splits markdown into logical chunks based on headers.
    Returns a list of (content, tags) tuples.
    """
    chunks = []
    current_chunk = []
    current_header = "Intro"
    
    lines = text.split('\n')
    
    for line in lines:
        if line.strip().startswith('#'):
            # Save previous chunk if exists
            if current_chunk:
                content = '\n'.join(current_chunk).strip()
                if content:
                    chunks.append({
                        "content": content,
                        "tags": [filename, current_header]
                    })
            
            # Start new chunk
            current_header = line.strip().lstrip('#').strip()
            current_chunk = [line]  # Include header in chunk for context
        else:
            current_chunk.append(line)
            
    # Save last chunk
    if current_chunk:
        content = '\n'.join(current_chunk).strip()
        if content:
            chunks.append({
                "content": content,
                "tags": [filename, current_header]
            })
            
    return chunks

def ingest_all():
    print(f"📚 Opening Sacred Library at: {KNOWLEDGE_DIR}")
    
    if not os.path.exists(KNOWLEDGE_DIR):
        print(f"❌ Error: Directory not found: {KNOWLEDGE_DIR}")
        return

    brain = MemoryCore()
    
    files = [f for f in os.listdir(KNOWLEDGE_DIR) if f.endswith('.md')]
    total_chunks = 0
    
    print(f"found {len(files)} scrolls.")
    
    for file in files:
        filepath = os.path.join(KNOWLEDGE_DIR, file)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                text = f.read()
                
            chunks = parse_markdown_chunks(text, file)
            print(f"   - {file}: {len(chunks)} chunks")
            
            for chunk in chunks:
                # Store in semantic memory
                # content, type="semantic", tags=[file, header]
                brain.remember(chunk["content"], "semantic", chunk["tags"])
                total_chunks += 1
                
        except Exception as e:
            print(f"❌ Failed to read {file}: {e}")

    print(f"\n✨ Ingestion Complete. {total_chunks} wisdom fragments stored in the Neural Core.")

if __name__ == "__main__":
    ingest_all()

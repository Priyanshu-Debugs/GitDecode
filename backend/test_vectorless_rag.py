import asyncio
import logging
import uuid
from dotenv import load_dotenv
load_dotenv()

from langchain_core.messages import HumanMessage
from app.core.config import get_settings
from app.db.pg_client import SupabasePGClient
from app.api.dependencies import set_pg_client
from app.services.parsers.python_parser import parse_python_file
from app.services.ast_router import ASTRouter
from app.agents.nodes.code_qa import code_qa_node

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def main():
    settings = get_settings()
    print("Testing settings loading: SUCCESS")
    print(f"Project Name: {settings.PROJECT_NAME}")
    
    # 1. Initialize Supabase Client
    pg_client = SupabasePGClient(
        supabase_url=settings.SUPABASE_URL,
        service_role_key=settings.SUPABASE_SERVICE_ROLE_KEY,
    )
    set_pg_client(pg_client)
    print("Supabase client initialized successfully.")
    
    # 2. Test Parser
    print("\n--- Testing Parser ---")
    test_code = """
def hello_world():
    print("Hello from test python file!")

class Calculator:
    def add(self, a, b):
        return a + b
"""
    repo_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4()) # fake UUIDs for isolation
    
    graph_data = parse_python_file(test_code, "test_file.py", repo_id, user_id)
    print("Parser output graph_data nodes:")
    for n in graph_data["nodes"]:
        print(f"  Node: {n}")
        
    # 3. Test AST Router
    print("\n--- Testing AST Router ---")
    router = ASTRouter()
    # Mock database files
    files_list = [
        "test_file.py",
        "app/main.py",
        "app/services/parser.py"
    ]
    
    mock_graph_data = {
        "nodes": [
            {"id": "test_file.py", "type": "file", "label": "test_file.py", "language": "python", "size_bytes": 100, "symbols": []},
            {"id": "app/main.py", "type": "file", "label": "app/main.py", "language": "python", "size_bytes": 500, "symbols": []},
            {"id": "app/services/parser.py", "type": "file", "label": "parser.py", "language": "python", "size_bytes": 300, "symbols": []}
        ],
        "edges": [
            {"source": "app/main.py", "target": "test_file.py", "type": "IMPORTS"},
            {"source": "app/main.py", "target": "app/services/parser.py", "type": "IMPORTS"}
        ]
    }
    
    print("Routing query: 'How does hello_world function work?'")
    routing_res = await router.route_query("How does hello_world function work?", mock_graph_data, files_list)
    print(f"Router Selected target files: {routing_res['files']}")
    
    depth_1, depth_2 = router.walk_graph(routing_res["files"], mock_graph_data)
    print(f"BFS Walk results:")
    print(f"  Depth 1 (Full content): {depth_1}")
    print(f"  Depth 2 (Outlines only): {depth_2}")
    
    print("\nVectorless RAG pivot test completed successfully in isolation.")

if __name__ == "__main__":
    asyncio.run(main())

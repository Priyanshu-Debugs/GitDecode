import asyncio
import logging
from dotenv import load_dotenv
load_dotenv()

from langchain_core.messages import HumanMessage
from app.core.config import get_settings
from app.db.neo4j_client import Neo4jClient
from app.db.pg_client import SupabasePGClient
from app.api.dependencies import set_neo4j_client, set_pg_client
from app.agents.graph import graph

logging.getLogger("httpx").setLevel(logging.WARNING)

async def main():
    settings = get_settings()
    
    print("Setting up dependencies...")
    neo4j_client = Neo4jClient(
        uri=settings.NEO4J_URI,
        username=settings.NEO4J_USERNAME,
        password=settings.NEO4J_PASSWORD,
    )
    
    pg_client = SupabasePGClient(
        supabase_url=settings.SUPABASE_URL,
        service_role_key=settings.SUPABASE_SERVICE_ROLE_KEY,
    )
    
    set_neo4j_client(neo4j_client)
    set_pg_client(pg_client)
    
    queries = [
        "Hi there!", 
        "Show me a diagram of the backend architecture",
        "Where is the embeddings logic implemented?",
        "What happens if I change the visualizer_node function?"
    ]
    
    # Replace with a real repo_id and user_id if you have them in your DB
    repo_id = "00000000-0000-0000-0000-000000000000" 
    user_id = "00000000-0000-0000-0000-000000000000"
    
    for query in queries:
        print(f"\n====================================")
        print(f"Query: {query}")
        print(f"====================================")
        state = {
            "messages": [HumanMessage(content=query)],
            "user_query": query,
            "repo_id": repo_id,
            "user_id": user_id,
        }
        
        try:
            # ainvoke streams state updates through the nodes
            result = await graph.ainvoke(state)
            
            decision = result.get("routing_decision", "UNKNOWN")
            print(f"Routed To: {decision}")
            
            if "messages" in result and len(result["messages"]) > 0:
                final_msg = result["messages"][-1].content
                print(f"Response (truncated): \n{final_msg[:300]}...\n")
        except Exception as e:
            print(f"Error executing graph: {e}")
            
    await neo4j_client.close()

if __name__ == "__main__":
    asyncio.run(main())

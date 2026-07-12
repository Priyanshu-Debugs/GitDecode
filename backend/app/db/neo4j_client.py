"""
GitMesh — Neo4j / AuraDB Client
=================================
Manages the Neo4j async driver lifecycle and exposes Cypher operations
for the code knowledge graph.

Graph Data Model
-----------------
Nodes:  File, Class, Function, Route
Edges:  CONTAINS, IMPORTS, HAS_METHOD, CALLS, HANDLED_BY

All mutations use MERGE (not CREATE) to guarantee idempotency — re-running
the ingestion pipeline on the same repo will never produce duplicate nodes.
"""

from __future__ import annotations

import logging
from typing import Any

from neo4j import AsyncGraphDatabase, AsyncDriver

logger = logging.getLogger(__name__)


class Neo4jClient:
    """Async Neo4j driver wrapper for the GitMesh code knowledge graph.

    Args:
        uri: AuraDB bolt URI (``neo4j+s://...``).
        username: AuraDB username.
        password: AuraDB password.
    """

    def __init__(self, uri: str, username: str, password: str) -> None:
        self._driver: AsyncDriver = AsyncGraphDatabase.driver(
            uri,
            auth=(username, password),
        )
        logger.info("Neo4j driver created for %s", uri)

    # ── Lifecycle ────────────────────────────────────────────────────────

    async def verify_connectivity(self) -> None:
        """Verify that the driver can reach the Neo4j server."""
        await self._driver.verify_connectivity()
        logger.info("Neo4j connectivity verified")

    async def close(self) -> None:
        """Gracefully close the driver and release all connections."""
        await self._driver.close()
        logger.info("Neo4j driver closed")

    # ── Constraint Setup (run once on startup) ───────────────────────────

    async def ensure_constraints(self) -> None:
        """Create uniqueness constraints if they don't already exist.

        These constraints enforce data integrity at the database level and
        also create implicit indexes for fast MERGE lookups.
        """
        constraints = [
            # File: unique on (repo_id, path)
            (
                "constraint_file_unique",
                "CREATE CONSTRAINT constraint_file_unique IF NOT EXISTS "
                "FOR (f:File) REQUIRE (f.repo_id, f.path) IS UNIQUE",
            ),
            # Class: unique on (repo_id, file_path, name)
            (
                "constraint_class_unique",
                "CREATE CONSTRAINT constraint_class_unique IF NOT EXISTS "
                "FOR (c:Class) REQUIRE (c.repo_id, c.file_path, c.name) IS UNIQUE",
            ),
            # Function: unique on (repo_id, file_path, name, start_line)
            (
                "constraint_function_unique",
                "CREATE CONSTRAINT constraint_function_unique IF NOT EXISTS "
                "FOR (fn:Function) REQUIRE (fn.repo_id, fn.file_path, fn.name, fn.start_line) IS UNIQUE",
            ),
            # Route: unique on (repo_id, method, path_pattern)
            (
                "constraint_route_unique",
                "CREATE CONSTRAINT constraint_route_unique IF NOT EXISTS "
                "FOR (r:Route) REQUIRE (r.repo_id, r.method, r.path_pattern) IS UNIQUE",
            ),
        ]

        async with self._driver.session() as session:
            for name, cypher in constraints:
                await session.run(cypher)
                logger.debug("Ensured constraint: %s", name)

        logger.info("All Neo4j constraints ensured")

    # ── Node Creation (MERGE-based, idempotent) ─────────────────────────

    async def upsert_file_node(
        self,
        repo_id: str,
        *,
        path: str,
        language: str,
        size_bytes: int,
        checksum: str,
    ) -> str:
        """Create or update a File node.

        Returns:
            The Neo4j ``elementId`` of the merged node.
        """
        cypher = """
        MERGE (f:File {repo_id: $repo_id, path: $path})
        SET f.language   = $language,
            f.size_bytes = $size_bytes,
            f.checksum   = $checksum
        RETURN elementId(f) AS eid
        """
        return await self._execute_write_single(
            cypher,
            repo_id=repo_id,
            path=path,
            language=language,
            size_bytes=size_bytes,
            checksum=checksum,
        )

    async def upsert_class_node(
        self,
        repo_id: str,
        *,
        name: str,
        file_path: str,
        start_line: int,
        end_line: int,
        docstring: str | None = None,
    ) -> str:
        """Create or update a Class node.

        Returns:
            The Neo4j ``elementId`` of the merged node.
        """
        cypher = """
        MERGE (c:Class {repo_id: $repo_id, file_path: $file_path, name: $name})
        SET c.start_line = $start_line,
            c.end_line   = $end_line,
            c.docstring  = $docstring
        RETURN elementId(c) AS eid
        """
        return await self._execute_write_single(
            cypher,
            repo_id=repo_id,
            name=name,
            file_path=file_path,
            start_line=start_line,
            end_line=end_line,
            docstring=docstring,
        )

    async def upsert_function_node(
        self,
        repo_id: str,
        *,
        name: str,
        file_path: str,
        start_line: int,
        end_line: int,
        signature: str,
        is_async: bool = False,
        docstring: str | None = None,
    ) -> str:
        """Create or update a Function node.

        Returns:
            The Neo4j ``elementId`` of the merged node.
        """
        cypher = """
        MERGE (fn:Function {repo_id: $repo_id, file_path: $file_path,
                            name: $name, start_line: $start_line})
        SET fn.end_line  = $end_line,
            fn.signature = $signature,
            fn.is_async  = $is_async,
            fn.docstring = $docstring
        RETURN elementId(fn) AS eid
        """
        return await self._execute_write_single(
            cypher,
            repo_id=repo_id,
            name=name,
            file_path=file_path,
            start_line=start_line,
            end_line=end_line,
            signature=signature,
            is_async=is_async,
            docstring=docstring,
        )

    async def upsert_route_node(
        self,
        repo_id: str,
        *,
        method: str,
        path_pattern: str,
        file_path: str,
        start_line: int,
    ) -> str:
        """Create or update a Route node.

        Returns:
            The Neo4j ``elementId`` of the merged node.
        """
        cypher = """
        MERGE (r:Route {repo_id: $repo_id, method: $method,
                        path_pattern: $path_pattern})
        SET r.file_path  = $file_path,
            r.start_line = $start_line
        RETURN elementId(r) AS eid
        """
        return await self._execute_write_single(
            cypher,
            repo_id=repo_id,
            method=method,
            path_pattern=path_pattern,
            file_path=file_path,
            start_line=start_line,
        )

    # ── Edge Creation (MERGE-based, idempotent) ─────────────────────────

    async def create_contains_edge(
        self,
        repo_id: str,
        file_path: str,
        child_type: str,
        child_identifier: dict[str, Any],
    ) -> None:
        """Create a CONTAINS edge from a File to a child node (Class/Function/Route).

        Args:
            repo_id: Repository identifier.
            file_path: The file's path (used to match the File node).
            child_type: One of ``"Class"``, ``"Function"``, ``"Route"``.
            child_identifier: Dict of properties that uniquely identify the child
                node (must match the MERGE keys of the child's label).
        """
        # Build the child MATCH clause dynamically based on the identifier keys
        match_props = " AND ".join(
            f"child.{k} = ${k}" for k in child_identifier.keys()
        )
        cypher = f"""
        MATCH (f:File {{repo_id: $repo_id, path: $file_path}})
        MATCH (child:{child_type} {{repo_id: $repo_id}})
        WHERE {match_props}
        MERGE (f)-[:CONTAINS]->(child)
        """
        params = {"repo_id": repo_id, "file_path": file_path, **child_identifier}
        await self._execute_write(cypher, **params)

    async def create_imports_edge(
        self,
        repo_id: str,
        source_path: str,
        target_path: str,
        alias: str | None = None,
    ) -> None:
        """Create an IMPORTS edge between two File nodes.

        Args:
            repo_id: Repository identifier.
            source_path: Path of the file doing the importing.
            target_path: Path of the file being imported.
            alias: Optional import alias (e.g., ``import foo as bar``).
        """
        cypher = """
        MATCH (src:File {repo_id: $repo_id, path: $source_path})
        MATCH (tgt:File {repo_id: $repo_id, path: $target_path})
        MERGE (src)-[r:IMPORTS]->(tgt)
        SET r.alias = $alias
        """
        await self._execute_write(
            cypher,
            repo_id=repo_id,
            source_path=source_path,
            target_path=target_path,
            alias=alias,
        )

    async def create_has_method_edge(
        self,
        repo_id: str,
        class_name: str,
        method_name: str,
        file_path: str,
    ) -> None:
        """Create a HAS_METHOD edge from a Class to a Function.

        Args:
            repo_id: Repository identifier.
            class_name: Name of the class.
            method_name: Name of the method/function.
            file_path: File containing both the class and method.
        """
        cypher = """
        MATCH (c:Class {repo_id: $repo_id, file_path: $file_path, name: $class_name})
        MATCH (fn:Function {repo_id: $repo_id, file_path: $file_path, name: $method_name})
        MERGE (c)-[:HAS_METHOD]->(fn)
        """
        await self._execute_write(
            cypher,
            repo_id=repo_id,
            class_name=class_name,
            method_name=method_name,
            file_path=file_path,
        )

    async def create_calls_edge(
        self,
        repo_id: str,
        caller_name: str,
        callee_name: str,
        caller_file: str,
        callee_file: str,
        line: int | None = None,
    ) -> None:
        """Create a CALLS edge between two Function nodes.

        Args:
            repo_id: Repository identifier.
            caller_name: Name of the calling function.
            callee_name: Name of the called function.
            caller_file: File path of the caller.
            callee_file: File path of the callee.
            line: Optional line number where the call occurs.
        """
        cypher = """
        MATCH (caller:Function {repo_id: $repo_id, file_path: $caller_file, name: $caller_name})
        MATCH (callee:Function {repo_id: $repo_id, file_path: $callee_file, name: $callee_name})
        MERGE (caller)-[r:CALLS]->(callee)
        SET r.line = $line
        """
        await self._execute_write(
            cypher,
            repo_id=repo_id,
            caller_name=caller_name,
            callee_name=callee_name,
            caller_file=caller_file,
            callee_file=callee_file,
            line=line,
        )

    async def create_handled_by_edge(
        self,
        repo_id: str,
        method: str,
        path_pattern: str,
        function_name: str,
        file_path: str,
    ) -> None:
        """Create a HANDLED_BY edge from a Route to a Function.

        Args:
            repo_id: Repository identifier.
            method: HTTP method (GET, POST, etc.).
            path_pattern: The route's URL pattern.
            function_name: Name of the handler function.
            file_path: File containing the handler function.
        """
        cypher = """
        MATCH (r:Route {repo_id: $repo_id, method: $method, path_pattern: $path_pattern})
        MATCH (fn:Function {repo_id: $repo_id, file_path: $file_path, name: $function_name})
        MERGE (r)-[:HANDLED_BY]->(fn)
        """
        await self._execute_write(
            cypher,
            repo_id=repo_id,
            method=method,
            path_pattern=path_pattern,
            function_name=function_name,
            file_path=file_path,
        )

    # ── Bulk Operations ──────────────────────────────────────────────────

    async def delete_repo_graph(self, repo_id: str) -> int:
        """Delete all nodes and relationships for a repository.

        Uses batched deletion to avoid memory issues on large graphs.

        Args:
            repo_id: The repository identifier whose graph will be purged.

        Returns:
            Total number of nodes deleted.
        """
        cypher = """
        MATCH (n {repo_id: $repo_id})
        WITH n LIMIT 1000
        DETACH DELETE n
        RETURN count(*) AS deleted
        """
        total_deleted = 0
        while True:
            async def work(tx):
                res = await tx.run(cypher, repo_id=repo_id)
                return await res.single()
                
            async with self._driver.session() as session:
                record = await session.execute_write(work)
                batch_deleted = record["deleted"] if record else 0
                total_deleted += batch_deleted

                if batch_deleted < 1000:
                    break

        logger.info(
            "Deleted %d nodes for repo_id=%s", total_deleted, repo_id
        )
        return total_deleted

    # ── Query Operations ─────────────────────────────────────────────────

    async def get_file_tree(self, repo_id: str) -> list[dict[str, Any]]:
        """Retrieve all File nodes for a repository, ordered by path.

        Args:
            repo_id: The repository identifier.

        Returns:
            List of dicts with ``path``, ``language``, ``size_bytes`` keys.
        """
        cypher = """
        MATCH (f:File {repo_id: $repo_id})
        RETURN f.path AS path, f.language AS language, f.size_bytes AS size_bytes
        ORDER BY f.path
        """
        async def work(tx):
            res = await tx.run(cypher, repo_id=repo_id)
            return [record.data() async for record in res]
            
        async with self._driver.session() as session:
            return await session.execute_read(work)

    async def get_function_callees(
        self,
        repo_id: str,
        function_name: str,
        file_path: str,
    ) -> list[dict[str, Any]]:
        """Get all functions called by a specific function.

        Args:
            repo_id: The repository identifier.
            function_name: Name of the caller function.
            file_path: File path of the caller function.

        Returns:
            List of dicts with callee ``name``, ``file_path``, ``signature``.
        """
        cypher = """
        MATCH (caller:Function {repo_id: $repo_id, file_path: $file_path,
                                name: $function_name})
              -[:CALLS]->(callee:Function)
        RETURN callee.name AS name, callee.file_path AS file_path,
               callee.signature AS signature
        """
        async def work(tx):
            res = await tx.run(
                cypher,
                repo_id=repo_id,
                function_name=function_name,
                file_path=file_path,
            )
            return [record.data() async for record in res]
            
        async with self._driver.session() as session:
            return await session.execute_read(work)

    # ── Internal Helpers ─────────────────────────────────────────────────

    # ── Dashboard Query Operations ───────────────────────────────────────

    async def get_graph_stats(self, repo_id: str) -> dict[str, Any]:
        """Get aggregate counts of all node types and edges for a repository.

        Args:
            repo_id: The repository identifier.

        Returns:
            Dict with keys: files, classes, functions, routes, edges.
        """
        cypher = """
        MATCH (n {repo_id: $repo_id})
        WITH
          count(CASE WHEN 'File' IN labels(n) THEN 1 END) AS files,
          count(CASE WHEN 'Class' IN labels(n) THEN 1 END) AS classes,
          count(CASE WHEN 'Function' IN labels(n) THEN 1 END) AS functions,
          count(CASE WHEN 'Route' IN labels(n) THEN 1 END) AS routes
        OPTIONAL MATCH ()-[r]->() WHERE exists { MATCH (s {repo_id: $repo_id})-[r]->() }
        RETURN files, classes, functions, routes, count(r) AS edges
        """
        # Simpler approach with two queries for reliability
        node_cypher = """
        MATCH (n {repo_id: $repo_id})
        RETURN
          count(CASE WHEN 'File' IN labels(n) THEN 1 END) AS files,
          count(CASE WHEN 'Class' IN labels(n) THEN 1 END) AS classes,
          count(CASE WHEN 'Function' IN labels(n) THEN 1 END) AS functions,
          count(CASE WHEN 'Route' IN labels(n) THEN 1 END) AS routes
        """
        edge_cypher = """
        MATCH (a {repo_id: $repo_id})-[r]->(b {repo_id: $repo_id})
        RETURN count(r) AS edges
        """

        async def work(tx):
            res = await tx.run(node_cypher, repo_id=repo_id)
            record = await res.single()
            node_stats = record.data() if record else {"files": 0, "classes": 0, "functions": 0, "routes": 0}

            res2 = await tx.run(edge_cypher, repo_id=repo_id)
            record2 = await res2.single()
            edge_count = record2["edges"] if record2 else 0

            return {**node_stats, "edges": edge_count}

        async with self._driver.session() as session:
            return await session.execute_read(work)

    async def get_dependency_graph(
        self, repo_id: str
    ) -> dict[str, Any]:
        """Get File nodes and IMPORTS edges for the dependency graph visualization.

        Args:
            repo_id: The repository identifier.

        Returns:
            Dict with ``nodes`` (list of file dicts) and ``edges``
            (list of {source, target} dicts).
        """
        nodes_cypher = """
        MATCH (f:File {repo_id: $repo_id})
        RETURN f.path AS id, f.path AS label, f.language AS language,
               f.size_bytes AS size_bytes, 'file' AS type
        ORDER BY f.path
        """
        edges_cypher = """
        MATCH (a:File {repo_id: $repo_id})-[r:IMPORTS]->(b:File {repo_id: $repo_id})
        RETURN a.path AS source, b.path AS target, type(r) AS type
        """

        async def work(tx):
            res = await tx.run(nodes_cypher, repo_id=repo_id)
            nodes = [record.data() async for record in res]

            res2 = await tx.run(edges_cypher, repo_id=repo_id)
            edges = [record.data() async for record in res2]

            return {"nodes": nodes, "edges": edges}

        async with self._driver.session() as session:
            return await session.execute_read(work)

    async def get_blast_radius(
        self,
        repo_id: str,
        file_path: str,
        max_depth: int = 3,
    ) -> dict[str, Any]:
        """Traverse the graph to find all downstream-affected nodes when a file changes.

        Uses multi-hop traversal across IMPORTS, CONTAINS, CALLS, and HAS_METHOD edges.

        Args:
            repo_id: The repository identifier.
            file_path: Path of the file being changed.
            max_depth: Maximum traversal depth (default 3).

        Returns:
            Dict with ``target`` (the source file), ``affected_files``
            (list of file paths), and ``affected_nodes`` (list of
            {type, name, file_path} dicts).
        """
        cypher = """
        MATCH (source:File {repo_id: $repo_id, path: $file_path})
        CALL apoc.path.subgraphNodes(source, {
            relationshipFilter: "IMPORTS>|CONTAINS>|CALLS>|HAS_METHOD>",
            minLevel: 1,
            maxLevel: $max_depth,
            labelFilter: "+File|+Class|+Function|+Route"
        }) YIELD node
        RETURN labels(node) AS labels, node.path AS path,
               node.name AS name, node.file_path AS file_path
        """
        # Fallback: simpler multi-hop query if APOC is not available
        fallback_cypher = """
        MATCH (source:File {repo_id: $repo_id, path: $file_path})
              <-[:IMPORTS*1..3]-(dependent:File {repo_id: $repo_id})
        RETURN DISTINCT dependent.path AS path, 'File' AS type, null AS name,
               dependent.path AS file_path
        """

        async def work(tx):
            try:
                res = await tx.run(cypher, repo_id=repo_id,
                                   file_path=file_path, max_depth=max_depth)
                records = [record.data() async for record in res]
            except Exception:
                # Fallback if APOC not installed
                res = await tx.run(fallback_cypher, repo_id=repo_id,
                                   file_path=file_path)
                records = [record.data() async for record in res]

            affected_files = set()
            affected_nodes = []
            for r in records:
                fp = r.get("path") or r.get("file_path")
                if fp:
                    affected_files.add(fp)
                node_type = r.get("type") or (r["labels"][0] if r.get("labels") else "unknown")
                affected_nodes.append({
                    "type": node_type,
                    "name": r.get("name"),
                    "file_path": fp,
                })

            return {
                "target": file_path,
                "affected_files": sorted(affected_files),
                "affected_nodes": affected_nodes,
                "depth": max_depth,
            }

        async with self._driver.session() as session:
            return await session.execute_read(work)

    async def get_repo_summary(self, repo_id: str) -> dict[str, Any]:
        """Fetch a high-level summary of the repository structure from Neo4j."""
        cypher = """
        MATCH (f:File {repo_id: $repo_id})
        WITH f, f.language AS language
        ORDER BY f.path ASC
        
        WITH language, count(f) AS file_count, collect(f.path)[0..25] AS sample_files
        WITH collect({language: language, count: file_count, sample_files: sample_files}) AS languages
        
        OPTIONAL MATCH (c:Class {repo_id: $repo_id})
        WITH languages, count(c) AS total_classes
        
        OPTIONAL MATCH (fn:Function {repo_id: $repo_id})
        WITH languages, total_classes, count(fn) AS total_functions
        
        RETURN {
            languages: languages,
            total_classes: total_classes,
            total_functions: total_functions
        } AS summary
        """
        async def work(tx):
            res = await tx.run(cypher, repo_id=repo_id)
            record = await res.single()
            if record:
                return record["summary"]
            return {"languages": [], "total_classes": 0, "total_functions": 0}

        async with self._driver.session() as session:
            return await session.execute_read(work)

    async def get_call_graph(self, repo_id: str) -> dict[str, Any]:
        """Get Function nodes and CALLS relationships for call graph visualization."""
        nodes_cypher = """
        MATCH (fn:Function {repo_id: $repo_id})
        RETURN elementId(fn) AS id, fn.name AS label, fn.file_path AS file_path, fn.signature AS signature
        ORDER BY fn.name
        """
        edges_cypher = """
        MATCH (caller:Function {repo_id: $repo_id})-[r:CALLS]->(callee:Function {repo_id: $repo_id})
        RETURN elementId(caller) AS source, elementId(callee) AS target, type(r) AS type
        """

        async def work(tx):
            res = await tx.run(nodes_cypher, repo_id=repo_id)
            nodes = [record.data() async for record in res]
            for n in nodes:
                n["type"] = "function"

            res2 = await tx.run(edges_cypher, repo_id=repo_id)
            edges = [record.data() async for record in res2]

            return {"nodes": nodes, "edges": edges}

        async with self._driver.session() as session:
            return await session.execute_read(work)

    async def get_class_graph(self, repo_id: str) -> dict[str, Any]:
        """Get Class nodes, Method nodes, and HAS_METHOD relationships for visualization."""
        class_cypher = """
        MATCH (c:Class {repo_id: $repo_id})
        RETURN elementId(c) AS id, c.name AS label, 'class' AS type, c.file_path AS file_path
        ORDER BY c.name
        """
        method_cypher = """
        MATCH (c:Class {repo_id: $repo_id})-[:HAS_METHOD]->(m:Function {repo_id: $repo_id})
        RETURN elementId(m) AS id, m.name AS label, 'method' AS type, m.file_path AS file_path
        """
        edges_cypher = """
        MATCH (c:Class {repo_id: $repo_id})-[r:HAS_METHOD]->(m:Function {repo_id: $repo_id})
        RETURN elementId(c) AS source, elementId(m) AS target, type(r) AS type
        """

        async def work(tx):
            res = await tx.run(class_cypher, repo_id=repo_id)
            classes = [record.data() async for record in res]

            res2 = await tx.run(method_cypher, repo_id=repo_id)
            methods = [record.data() async for record in res2]

            seen_nodes = set()
            nodes = []
            for node in classes:
                if node["id"] not in seen_nodes:
                    seen_nodes.add(node["id"])
                    nodes.append(node)
            for node in methods:
                if node["id"] not in seen_nodes:
                    seen_nodes.add(node["id"])
                    nodes.append(node)

            res3 = await tx.run(edges_cypher, repo_id=repo_id)
            edges = [record.data() async for record in res3]

            return {"nodes": nodes, "edges": edges}

        async with self._driver.session() as session:
            return await session.execute_read(work)

    async def get_full_graph(self, repo_id: str) -> dict[str, Any]:
        """Get all nodes and edges (all types) for the repository full graph view.

        Args:
            repo_id: The repository identifier.

        Returns:
            Dict with ``nodes`` and ``edges``.
        """
        nodes_cypher = """
        MATCH (n {repo_id: $repo_id})
        WHERE n:File OR n:Class OR n:Function OR n:Route
        RETURN elementId(n) AS id,
               coalesce(n.name, n.path, n.path_pattern) AS label,
               toLower(labels(n)[0]) AS type,
               n.file_path AS file_path,
               n.path AS path,
               n.language AS language,
               n.size_bytes AS size_bytes,
               n.signature AS signature,
               n.start_line AS start_line,
               n.end_line AS end_line,
               n.docstring AS docstring,
               n.method AS method
        """
        edges_cypher = """
        MATCH (a {repo_id: $repo_id})-[r]->(b {repo_id: $repo_id})
        WHERE type(r) IN ['IMPORTS', 'CALLS', 'HAS_METHOD', 'CONTAINS']
        RETURN elementId(a) AS source, elementId(b) AS target, type(r) AS type
        """

        async def work(tx):
            res = await tx.run(nodes_cypher, repo_id=repo_id)
            nodes = [record.data() async for record in res]

            res2 = await tx.run(edges_cypher, repo_id=repo_id)
            edges = [record.data() async for record in res2]

            return {"nodes": nodes, "edges": edges}

        async with self._driver.session() as session:
            return await session.execute_read(work)

    # ── Internal Helpers ─────────────────────────────────────────────────

    async def _execute_write_single(self, cypher: str, **params: Any) -> str:
        """Execute a write query and return the ``eid`` from the first record."""
        async def work(tx):
            res = await tx.run(cypher, **params)
            return await res.single()
            
        async with self._driver.session() as session:
            record = await session.execute_write(work)
            return record["eid"] if record else ""

    async def _execute_write(self, cypher: str, **params: Any) -> None:
        """Execute a write query with no return value."""
        async def work(tx):
            await tx.run(cypher, **params)
            
        async with self._driver.session() as session:
            await session.execute_write(work)

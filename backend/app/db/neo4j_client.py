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
        match_props = ", ".join(
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
            async with self._driver.session() as session:
                result = await session.execute_write(
                    lambda tx: tx.run(cypher, repo_id=repo_id)
                )
                record = await result.single()
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
        async with self._driver.session() as session:
            result = await session.execute_read(
                lambda tx: tx.run(cypher, repo_id=repo_id)
            )
            return [record.data() async for record in result]

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
        async with self._driver.session() as session:
            result = await session.execute_read(
                lambda tx: tx.run(
                    cypher,
                    repo_id=repo_id,
                    function_name=function_name,
                    file_path=file_path,
                )
            )
            return [record.data() async for record in result]

    # ── Internal Helpers ─────────────────────────────────────────────────

    async def _execute_write_single(self, cypher: str, **params: Any) -> str:
        """Execute a write query and return the ``eid`` from the first record."""
        async with self._driver.session() as session:
            result = await session.execute_write(
                lambda tx: tx.run(cypher, **params)
            )
            record = await result.single()
            return record["eid"] if record else ""

    async def _execute_write(self, cypher: str, **params: Any) -> None:
        """Execute a write query with no return value."""
        async with self._driver.session() as session:
            await session.execute_write(
                lambda tx: tx.run(cypher, **params)
            )

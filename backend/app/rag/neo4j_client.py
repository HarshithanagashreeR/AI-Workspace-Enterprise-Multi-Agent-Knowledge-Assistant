import os
import logging
from typing import List, Dict, Any

logger = logging.getLogger("app.rag.neo4j")

class Neo4jClient:
    """
    Neo4j Database Client.
    Executes Cypher ingestion and retrieval.
    Falls back to Mock Graph Mode if connections fail or credentials are omitted.
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(Neo4jClient, cls).__new__(cls)
            cls._instance._init_client()
        return cls._instance

    def _init_client(self):
        self.uri = os.getenv("NEO4J_URI", "")
        self.user = os.getenv("NEO4J_USER", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD", "")
        
        self.driver = None
        self.mock_mode = True
        
        if self.uri and self.password:
            try:
                from neo4j import GraphDatabase
                self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
                # Quick ping
                self.driver.verify_connectivity()
                self.mock_mode = False
                logger.info(f"Successfully connected to live Neo4j database at {self.uri}")
            except Exception as e:
                logger.warning(f"Failed to connect to Neo4j database at {self.uri}. Falling back to MOCK graph mode. Error: {e}")
        else:
            logger.info("Neo4j environment variables missing. Operating in MOCK graph mode.")

    def add_relationship(self, source: str, source_type: str, relation: str, target: str, target_type: str):
        """
        Ingests an entity relationship link (Cypher query).
        """
        if self.mock_mode:
            logger.info(f"[Mock Graph Ingest] ({source}:{source_type}) -[{relation}]-> ({target}:{target_type})")
            return
            
        cypher = (
            "MERGE (e1:Entity {name: $source, type: $source_type}) "
            "MERGE (e2:Entity {name: $target, type: $target_type}) "
            "MERGE (e1)-[r:RELATION {type: $relation}]->(e2)"
        )
        try:
            with self.driver.session() as session:
                session.run(cypher, source=source, source_type=source_type, relation=relation, target=target, target_type=target_type)
        except Exception as e:
            logger.error(f"Failed to write to Neo4j: {e}", exc_info=True)

    def query_relationships(self, entity_names: List[str]) -> List[Dict[str, Any]]:
        """
        Queries Neo4j for 1-hop connections matching the extracted query entities.
        """
        if self.mock_mode:
            # Seeded demo facts disabled in production/mock mode to avoid polluting search results
            logger.info(f"[Mock Graph Query] Querying relationships for: {entity_names} (seeded facts disabled)")
            return []

        cypher = (
            "MATCH (e:Entity) WHERE toLower(e.name) IN $names "
            "MATCH (e)-[r:RELATION]->(neighbor:Entity) "
            "RETURN e.name AS source, r.type AS relation, neighbor.name AS target"
        )
        try:
            names_lower = [n.lower() for n in entity_names]
            with self.driver.session() as session:
                result = session.run(cypher, names=names_lower)
                return [{"source": record["source"], "relation": record["relation"], "target": record["target"]} for record in result]
        except Exception as e:
            logger.error(f"Failed to query Neo4j: {e}", exc_info=True)
            return []

    def close(self):
        if self.driver:
            self.driver.close()
            logger.info("Neo4j driver session closed.")

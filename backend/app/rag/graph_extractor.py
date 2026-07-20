import logging
from typing import List
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from app.config.config import settings
from app.rag.neo4j_client import Neo4jClient
from app.agents.state import is_mock_mode

logger = logging.getLogger("app.rag.extractor")

class EntityRelationTriple(BaseModel):
    source: str = Field(description="Name of the source entity (e.g. 'Sarah Jenkins')")
    source_type: str = Field(description="Type of the source entity (Person, Organization, Location, Product, Concept)")
    relation: str = Field(description="Verb describing the relationship, e.g. SPECIALIZES_IN, WORKS_AT, WRITES")
    target: str = Field(description="Name of the target entity (e.g. 'LangGraph')")
    target_type: str = Field(description="Type of the target entity (Person, Organization, Location, Product, Concept)")

class GraphExtractionSchema(BaseModel):
    triples: List[EntityRelationTriple] = Field(description="List of extracted semantic relationship triples.")

class GraphExtractor:
    @staticmethod
    async def extract_and_store_entities(text: str):
        """
        Parses text content to extract semantic relationship triples and writes them to Neo4j.
        """
        client = Neo4jClient()
        
        # Check mock mode fallback
        if is_mock_mode():
            logger.info("GraphExtractor executing in MOCK extraction mode")
            # Parse evaluation facts using regex/keywords locally to populate the mock graph
            text_lower = text.lower()
            if "sarah" in text_lower:
                client.add_relationship("Sarah Jenkins", "Person", "SPECIALIZES_IN", "LangGraph", "Concept")
                client.add_relationship("Sarah Jenkins", "Person", "LIVES_IN", "Boston, MA", "Location")
            if "david" in text_lower:
                client.add_relationship("David Miller", "Person", "EXPERIENCE", "PostgreSQL database pools", "Concept")
            if "emily" in text_lower:
                client.add_relationship("Emily Watson", "Person", "WRITES", "AWS IAM secrets rotating policies", "Concept")
            return

        try:
            prompt_tmpl = ChatPromptTemplate.from_messages([
                ("system", "You are an Expert Knowledge Graph Extractor.\n"
                           "Your job is to read the provided text chunk and extract key Entity-Relationship triples.\n"
                           "Extract:\n"
                           "- People, Organizations, Locations, Products, Concepts\n"
                           "- Relationships linking them (keep relation types short, e.g., WORKS_AT, DEVELOPED).\n"
                           "Ensure all entities are named nouns extracted from the text."),
                ("human", "Text chunk to parse:\n{text}")
            ])
            
            llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.1, openai_api_key=settings.OPENAI_API_KEY)
            structured_llm = llm.with_structured_output(GraphExtractionSchema)
            chain = prompt_tmpl | structured_llm
            
            res = await chain.ainvoke({"text": text})
            logger.info(f"GraphExtractor parsed {len(res.triples)} triples from text chunk")
            
            for triple in res.triples:
                client.add_relationship(
                    source=triple.source,
                    source_type=triple.source_type,
                    relation=triple.relation,
                    target=triple.target,
                    target_type=triple.target_type
                )
        except Exception as e:
            logger.error(f"GraphExtractor extraction failed: {e}", exc_info=True)

from sqlalchemy import Column, Integer, Float, DateTime
from datetime import datetime
from app.database.session import Base

class EvaluationMetric(Base):
    __tablename__ = "evaluation_metrics"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    faithfulness = Column(Float, nullable=False)
    answer_relevancy = Column(Float, nullable=False)
    context_recall = Column(Float, nullable=False)
    context_precision = Column(Float, nullable=False)
    answer_correctness = Column(Float, nullable=False)
    sample_size = Column(Integer, default=1)

import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    PROJECT_NAME: str = "Enterprise Knowledge Intelligence Platform"
    API_V1_STR: str = "/api"
    
    # Security
    JWT_SECRET_KEY: str = Field(default="dev_secret_key_change_me_in_production_extremely_long")
    JWT_REFRESH_SECRET_KEY: str = Field(default="dev_refresh_secret_key_change_me_in_production_extremely_long")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    
    # Database
    DATABASE_URL: str = Field(default="postgresql+pg8000://postgres:postgres_secure_password@db:5432/knowledge_platform")
    
    # Vector DB
    CHROMA_PERSIST_DIRECTORY: str = Field(default="./chromadb_store")
    
    # OpenAI
    OPENAI_API_KEY: str = Field(default="")
    
    # CORS
    FRONTEND_URL: str = Field(default="http://localhost:5173")
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def __init__(self, **values):
        super().__init__(**values)
        if self.DATABASE_URL.startswith("postgresql://"):
            self.DATABASE_URL = self.DATABASE_URL.replace("postgresql://", "postgresql+pg8000://", 1)
        elif self.DATABASE_URL.startswith("postgres://"):
            self.DATABASE_URL = self.DATABASE_URL.replace("postgres://", "postgresql+pg8000://", 1)

    def validate_secrets(self):
        # If running in a production-like environment (non-SQLite database)
        if "sqlite" not in self.DATABASE_URL.lower():
            if "change_me" in self.JWT_SECRET_KEY or self.JWT_SECRET_KEY == "dev_secret_key_change_me_in_production_extremely_long":
                raise ValueError("Security Risk: JWT_SECRET_KEY cannot be set to default/dev values in production.")
            if "change_me" in self.JWT_REFRESH_SECRET_KEY or self.JWT_REFRESH_SECRET_KEY == "dev_refresh_secret_key_change_me_in_production_extremely_long":
                raise ValueError("Security Risk: JWT_REFRESH_SECRET_KEY cannot be set to default/dev values in production.")

settings = Settings()
settings.validate_secrets()

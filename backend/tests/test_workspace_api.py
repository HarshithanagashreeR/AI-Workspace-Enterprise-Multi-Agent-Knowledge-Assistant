import pytest
import asyncio
from httpx import AsyncClient
from app.main import app
from app.core import security
from app.database.session import Base, get_db
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_workspace.db"
test_engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()

@pytest.fixture
async def async_client():
    async with AsyncClient(app=app, base_url="http://testserver") as client:
        yield client

@pytest.fixture
async def auth_token(async_client: AsyncClient):
    import uuid
    email = f"test_user_{uuid.uuid4().hex[:8]}@example.com"
    # Register a test user (ignore if already exists)
    register_payload = {
        "email": email,
        "password": "TestPass123!",
        "full_name": "Test User"
    }
    await async_client.post("/api/auth/register", json=register_payload)
    # Login to obtain JWT token
    login_payload = {"email": email, "password": register_payload["password"]}
    resp = await async_client.post("/api/auth/login", json=login_payload)
    assert resp.status_code == 200
    return resp.json()["access_token"]

@pytest.mark.anyio
async def test_workspace_conversation_flow(async_client: AsyncClient, auth_token: str):
    headers = {"Authorization": f"Bearer {auth_token}"}
    # 1. Create a workspace
    workspace_data = {"name": "Automated Test WS", "description": "Workspace for CI test"}
    ws_resp = await async_client.post("/api/workspaces", json=workspace_data, headers=headers)
    assert ws_resp.status_code == 201
    workspace_id = ws_resp.json()["id"]

    # 2. Create a conversation scoped to that workspace
    conv_resp = await async_client.post(f"/api/chat/conversations?workspace_id={workspace_id}", headers=headers)
    assert conv_resp.status_code == 200
    conv_id = conv_resp.json()["id"]

    # 3. List all conversations → should contain the new one
    all_conv_resp = await async_client.get("/api/chat/conversations", headers=headers)
    assert all_conv_resp.status_code == 200
    assert any(c["id"] == conv_id for c in all_conv_resp.json())

    # 4. List conversations filtered by workspace_id → should ONLY return the scoped one
    filtered_resp = await async_client.get(f"/api/chat/conversations?workspace_id={workspace_id}", headers=headers)
    assert filtered_resp.status_code == 200
    filtered = filtered_resp.json()
    assert len(filtered) == 1
    assert filtered[0]["id"] == conv_id
    assert filtered[0]["workspace_id"] == workspace_id

@pytest.mark.anyio
async def test_upload_multiple_and_document_filtering(async_client: AsyncClient, auth_token: str):
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # Define files to upload
    files = [
        ("files", ("test1.txt", b"First test file content for document scoping")),
        ("files", ("test2.txt", b"Second separate content file for testing"))
    ]
    
    # Upload multiple documents
    resp = await async_client.post("/api/documents/upload-multiple", files=files, headers=headers)
    assert resp.status_code == 202
    data = resp.json()
    assert len(data) == 2
    assert data[0]["filename"] == "test1.txt"
    assert data[1]["filename"] == "test2.txt"

    # Create conversation
    conv_resp = await async_client.post("/api/chat/conversations", headers=headers)
    assert conv_resp.status_code == 200
    conv_id = conv_resp.json()["id"]

    # Send a query scoped to the first document
    doc_id = data[0]["id"]
    query_payload = {
        "content": "What is in test1.txt?",
        "mode": "chat",
        "document_id": doc_id
    }
    query_resp = await async_client.post(f"/api/chat/conversations/{conv_id}/query", json=query_payload, headers=headers)
    assert query_resp.status_code == 200

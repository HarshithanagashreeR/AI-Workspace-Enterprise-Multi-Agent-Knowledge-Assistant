import pytest
import io
import uuid
import asyncio
from httpx import AsyncClient
from app.main import app
from app.database.session import Base, get_db
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Setup test database engine (SQLite memory-based for fast unit testing)
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_e2e.db"
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

def generate_pdf_bytes(text_content: str) -> bytes:
    from reportlab.pdfgen import canvas
    pdf_io = io.BytesIO()
    c = canvas.Canvas(pdf_io)
    c.drawString(100, 750, text_content)
    c.showPage()
    c.save()
    return pdf_io.getvalue()

def generate_docx_bytes(text_content: str) -> bytes:
    from docx import Document
    doc = Document()
    doc.add_paragraph(text_content)
    docx_io = io.BytesIO()
    doc.save(docx_io)
    return docx_io.getvalue()

@pytest.mark.anyio
async def test_end_to_end_flow(async_client: AsyncClient):
    # ==========================================
    # 1. USER REGISTRATION AND LOGIN (E2E #1)
    # ==========================================
    user1_email = f"user1_{uuid.uuid4().hex[:6]}@example.com"
    user2_email = f"user2_{uuid.uuid4().hex[:6]}@example.com"
    password = "SecurePassword123!"

    # Register User 1
    u1_reg = await async_client.post("/api/auth/register", json={
        "email": user1_email,
        "password": password,
        "full_name": "User One"
    })
    assert u1_reg.status_code == 201

    # Register User 2
    u2_reg = await async_client.post("/api/auth/register", json={
        "email": user2_email,
        "password": password,
        "full_name": "User Two"
    })
    assert u2_reg.status_code == 201

    # Login User 1
    u1_login = await async_client.post("/api/auth/login", json={
        "email": user1_email,
        "password": password
    })
    assert u1_login.status_code == 200
    token1 = u1_login.json()["access_token"]
    headers1 = {"Authorization": f"Bearer {token1}"}

    # Login User 2
    u2_login = await async_client.post("/api/auth/login", json={
        "email": user2_email,
        "password": password
    })
    assert u2_login.status_code == 200
    token2 = u2_login.json()["access_token"]
    headers2 = {"Authorization": f"Bearer {token2}"}

    # Invalid login credentials test (E2E #7)
    u1_login_bad = await async_client.post("/api/auth/login", json={
        "email": user1_email,
        "password": "wrong_password"
    })
    assert u1_login_bad.status_code == 401

    # ==========================================
    # 2. CREATE MULTIPLE WORKSPACES (E2E #2)
    # ==========================================
    # User 1 creates Workspace A and Workspace B
    ws_a_resp = await async_client.post("/api/workspaces", json={
        "name": "Workspace A",
        "description": "User 1 Primary Workspace"
    }, headers=headers1)
    assert ws_a_resp.status_code == 201
    ws_a_id = ws_a_resp.json()["id"]

    ws_b_resp = await async_client.post("/api/workspaces", json={
        "name": "Workspace B",
        "description": "User 1 Secondary Workspace"
    }, headers=headers1)
    assert ws_b_resp.status_code == 201
    ws_b_id = ws_b_resp.json()["id"]

    # ==========================================
    # 3. UPLOAD PDF/DOCX FILES (E2E #3)
    # ==========================================
    pdf_content = "This is a critical system code snippet containing the access keys to the vault."
    docx_content = "This is general public documentation detailing standard procedures."

    pdf_bytes = generate_pdf_bytes(pdf_content)
    docx_bytes = generate_docx_bytes(docx_content)

    # Upload PDF and DOCX files for User 1
    files = [
        ("files", ("vault_keys.pdf", pdf_bytes, "application/pdf")),
        ("files", ("public_procedures.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
    ]
    upload_resp = await async_client.post("/api/documents/upload-multiple", files=files, headers=headers1)
    assert upload_resp.status_code == 202
    uploaded_docs = upload_resp.json()
    assert len(uploaded_docs) == 2
    
    doc_pdf_id = uploaded_docs[0]["id"]
    doc_docx_id = uploaded_docs[1]["id"]

    # Test uploading invalid file extensions (E2E #7)
    invalid_file = [("files", ("malicious.exe", b"malicious executable bytes", "application/octet-stream"))]
    upload_invalid = await async_client.post("/api/documents/upload-multiple", files=invalid_file, headers=headers1)
    assert upload_invalid.status_code == 400

    # ==========================================
    # 4. ASSOCIATE DOCUMENTS TO WORKSPACE A ONLY
    # ==========================================
    # Bind vault_keys.pdf and public_procedures.docx to Workspace A
    bind_resp = await async_client.post(f"/api/workspaces/{ws_a_id}/documents", json={"document_ids": [doc_pdf_id, doc_docx_id]}, headers=headers1)
    assert bind_resp.status_code == 200

    # ==========================================
    # 5. TEST CONVERSATIONS & SCOPED QUERIES (E2E #4, #5, #6)
    # ==========================================
    # Start conversation under Workspace A
    conv_a_resp = await async_client.post("/api/chat/conversations", json={
        "title": "Querying Workspace A",
        "workspace_id": ws_a_id
    }, headers=headers1)
    assert conv_a_resp.status_code == 200
    conv_a_id = conv_a_resp.json()["id"]

    # Start conversation under Workspace B (empty workspace, no documents bound)
    conv_b_resp = await async_client.post("/api/chat/conversations", json={
        "title": "Querying Workspace B",
        "workspace_id": ws_b_id
    }, headers=headers1)
    assert conv_b_resp.status_code == 200
    conv_b_id = conv_b_resp.json()["id"]

    # Query Workspace A conversation for general public documentation
    # (Should return response and link docx citation)
    query_payload_docx = {
        "content": "Tell me about public procedures.",
        "mode": "chat"
    }
    q_docx_resp = await async_client.post(f"/api/chat/conversations/{conv_a_id}/query", json=query_payload_docx, headers=headers1)
    assert q_docx_resp.status_code == 200

    # Query Workspace A conversation scoped strictly to PDF document_id
    # (Should match the pdf keys query)
    query_payload_pdf = {
        "content": "What are the access keys to the vault?",
        "mode": "chat",
        "document_id": doc_pdf_id
    }
    q_pdf_resp = await async_client.post(f"/api/chat/conversations/{conv_a_id}/query", json=query_payload_pdf, headers=headers1)
    assert q_pdf_resp.status_code == 200

    # ==========================================
    # 6. VERIFY WORKSPACE ISOLATION (E2E #5)
    # ==========================================
    # User 2 tries to access Workspace A or its documents -> should fail
    ws_u2_resp = await async_client.get(f"/api/workspaces", headers=headers2)
    assert ws_u2_resp.status_code == 200
    # User 2 shouldn't see Workspace A
    assert ws_a_id not in [ws["id"] for ws in ws_u2_resp.json()]

    # User 2 tries to query User 1's conversation -> should fail
    q_bad_user = await async_client.post(f"/api/chat/conversations/{conv_a_id}/query", json={"content": "hacking"}, headers=headers2)
    assert q_bad_user.status_code == 403

    # ==========================================
    # 7. TEST LARGE DOCUMENT HANDLING (E2E #8)
    # ==========================================
    # Generate a large document with 100 repeated blocks
    large_text = "\n\n".join([f"Block number {i} contains key data information segment." for i in range(100)])
    large_pdf_bytes = generate_pdf_bytes(large_text)
    
    large_file = [("files", ("large_compliance_report.pdf", large_pdf_bytes, "application/pdf"))]
    upload_large = await async_client.post("/api/documents/upload-multiple", files=large_file, headers=headers1)
    assert upload_large.status_code == 202
    large_doc_id = upload_large.json()[0]["id"]
    
    # Check document list to ensure large document exists
    docs_list = await async_client.get("/api/documents/", headers=headers1)
    assert docs_list.status_code == 200
    assert any(d["id"] == large_doc_id for d in docs_list.json())

    # ==========================================
    # 8. TEST GENERAL ERROR HANDLING BOUNDARIES
    # ==========================================
    # Query non-existent conversation -> should return 404
    bad_conv_resp = await async_client.post("/api/chat/conversations/999999/query", json={"content": "hello"}, headers=headers1)
    assert bad_conv_resp.status_code == 404

    # Delete non-existent document -> should return 404
    bad_del_resp = await async_client.delete("/api/documents/999999", headers=headers1)
    assert bad_del_resp.status_code == 404

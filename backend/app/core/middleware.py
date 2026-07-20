from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import time
from collections import defaultdict
from typing import Dict, List
from app.config.config import settings

# Memory storage for rate limiting: ip_or_user -> list of request timestamps
_rate_limit_store: Dict[str, List[float]] = defaultdict(list)

class RateLimitingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # We can identify clients by their host IP, or by user ID if logged in (check Auth header)
        client_ip = request.client.host if request.client else "unknown"
        
        # Check authentication token if present to limit by user rather than IP
        auth_header = request.headers.get("Authorization")
        identifier = client_ip
        if auth_header and auth_header.startswith("Bearer "):
            # Quick decode to get sub without DB hit for rate limit speed
            try:
                from jose import jwt
                token = auth_header.split(" ")[1]
                payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.ALGORITHM])
                user_id = payload.get("sub")
                if user_id:
                    identifier = f"user_{user_id}"
            except Exception:
                pass  # Fall back to IP-based limiting if invalid or expired token

        now = time.time()
        window_size = 60.0  # 1 minute sliding window
        max_requests = settings.RATE_LIMIT_PER_MINUTE

        # Filter out timestamps older than the window
        _rate_limit_store[identifier] = [
            ts for ts in _rate_limit_store[identifier] if now - ts < window_size
        ]

        # Periodically prune empty keys to prevent memory leak
        if len(_rate_limit_store) > 1000:
            inactive_keys = [k for k, ts_list in _rate_limit_store.items() if not ts_list]
            for k in inactive_keys:
                _rate_limit_store.pop(k, None)

        if len(_rate_limit_store[identifier]) >= max_requests:
            # Audit log hit rate limit
            # return HTTP 429
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Too many requests. Please try again in a minute."}
            )

        # Record this request
        _rate_limit_store[identifier].append(now)
        
        response = await call_next(request)
        return response

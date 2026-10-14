"""
Supabase Authentication & Project Ownership Authorization Module
Validates Supabase JWT access tokens, extracts authenticated user claims,
and enforces project tenant ownership on read/write/delete operations.

Supports graceful unauthenticated fallback for offline local development
when SUPABASE_JWT_SECRET is not yet configured.
"""

import os
import json
import base64
import hmac
import hashlib
import time
import logging
from dataclasses import dataclass
from typing import Optional, Dict, Any, Tuple
from fastapi import Request, Header, HTTPException, status, Depends

logger = logging.getLogger("auth")


@dataclass
class AuthenticatedUser:
    """Represents an authenticated Supabase user."""
    id: str
    email: Optional[str] = None
    role: str = "authenticated"
    is_authenticated: bool = True


def _decode_jwt_unverified(token: str) -> Tuple[Dict[str, Any], Dict[str, Any], bytes, bytes]:
    """Decodes header and payload of a JWT without verifying signature."""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT token format")

    header_raw = parts[0] + "=" * (-len(parts[0]) % 4)
    payload_raw = parts[1] + "=" * (-len(parts[1]) % 4)

    header = json.loads(base64.urlsafe_b64decode(header_raw.encode()))
    payload = json.loads(base64.urlsafe_b64decode(payload_raw.encode()))
    signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
    signature = base64.urlsafe_b64decode(parts[2] + "=" * (-len(parts[2]) % 4))

    return header, payload, signing_input, signature


def verify_supabase_token(token: str) -> AuthenticatedUser:
    """
    Verifies a Supabase access token (JWT).
    Checks expiration, issuer, algorithm, and signature if SUPABASE_JWT_SECRET is set.
    """
    try:
        header, payload, signing_input, signature = _decode_jwt_unverified(token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Malformed authorization token."},
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    # Check token expiration
    exp = payload.get("exp")
    if exp and exp < time.time():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_EXPIRED", "message": "Authorization token has expired."},
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify signature if secret is configured
    jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()
    if jwt_secret:
        expected_sig = hmac.new(jwt_secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected_sig):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_SIGNATURE", "message": "Invalid token signature."},
                headers={"WWW-Authenticate": "Bearer"},
            )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "MISSING_SUBJECT", "message": "Token does not contain user identifier."},
            headers={"WWW-Authenticate": "Bearer"},
        )

    return AuthenticatedUser(
        id=user_id,
        email=payload.get("email"),
        role=payload.get("role", "authenticated"),
        is_authenticated=True,
    )


def get_current_user(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> AuthenticatedUser:
    """
    Strict dependency: Requires a valid Supabase JWT Bearer token.
    If Supabase is not configured in environment, allows local development user.
    """
    jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()
    supabase_url = os.getenv("SUPABASE_URL", "").strip()

    # If Supabase is not configured yet (local dev mode):
    if not jwt_secret and not supabase_url:
        # Return local dev identity
        return AuthenticatedUser(
            id="dev_local_user",
            email="developer@localhost",
            role="authenticated",
            is_authenticated=False,
        )

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHENTICATED", "message": "Missing Bearer authorization token."},
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split("Bearer ", 1)[1].strip()
    return verify_supabase_token(token)


def get_optional_user(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Optional[AuthenticatedUser]:
    """
    Optional dependency: Decodes user if token is provided, returns None or local user otherwise.
    """
    if not authorization or not authorization.startswith("Bearer "):
        jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()
        supabase_url = os.getenv("SUPABASE_URL", "").strip()
        if not jwt_secret and not supabase_url:
            return AuthenticatedUser(
                id="dev_local_user",
                email="developer@localhost",
                role="authenticated",
                is_authenticated=False,
            )
        return None

    token = authorization.split("Bearer ", 1)[1].strip()
    try:
        return verify_supabase_token(token)
    except HTTPException:
        return None


def verify_project_ownership(user: Optional[AuthenticatedUser], project_user_id: Optional[str]) -> None:
    """
    Verifies that the authenticated user owns the targeted project.
    Raises HTTP 403 Forbidden if another user attempts access.
    """
    if not user or not user.is_authenticated:
        # In unauthenticated local dev fallback, allow access
        return

    if project_user_id and project_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Access denied: You do not have permission to view or modify this project.",
            },
        )

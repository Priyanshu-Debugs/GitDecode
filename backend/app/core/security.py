"""
GitMesh — Authentication & Security
=====================================
Supabase JWT (HS256) validation and authenticated user extraction.

Supabase issues JWTs signed with HS256 using the project's JWT_SECRET.
The payload contains: sub (user UUID), email, role, exp, iat, aud.
We validate by decoding with the shared secret and checking aud="authenticated".
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import jwt

from app.core.config import get_settings

# OAuth2 scheme — extracts the Bearer token from the Authorization header.
# tokenUrl is set to a placeholder; actual token issuance is handled by Supabase.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


class AuthenticatedUser(BaseModel):
    """Lightweight representation of the authenticated user from the JWT payload.

    Attributes:
        id: The Supabase user UUID (from the ``sub`` claim).
        email: The user's email address.
        role: The Supabase role (typically ``"authenticated"``).
    """

    id: str
    email: str
    role: str


def verify_supabase_token(token: str) -> dict:
    """Decode and validate a Supabase-issued JWT.

    Args:
        token: The raw JWT string (without the ``Bearer`` prefix).

    Returns:
        The full decoded payload as a dictionary.

    Raises:
        HTTPException: 401 if the token is expired, malformed, or has an
            invalid signature/audience.
    """
    settings = get_settings()

    try:
        payload: dict = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidAudienceError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token audience",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    token: str = Depends(oauth2_scheme),
) -> AuthenticatedUser:
    """FastAPI dependency that extracts the authenticated user from a JWT.

    Usage in route handlers::

        @router.post("/example")
        async def example(user: AuthenticatedUser = Depends(get_current_user)):
            print(user.id, user.email)

    Args:
        token: Automatically extracted from the ``Authorization: Bearer <token>``
            header by the ``oauth2_scheme`` dependency.

    Returns:
        An ``AuthenticatedUser`` populated from the JWT claims.

    Raises:
        HTTPException: 401 if the token is invalid or missing required claims.
    """
    payload = verify_supabase_token(token)

    # Extract required claims — raise 401 if any are missing
    user_id = payload.get("sub")
    email = payload.get("email")
    role = payload.get("role")

    if not user_id or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing required claims (sub, email)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return AuthenticatedUser(
        id=user_id,
        email=email,
        role=role or "authenticated",
    )

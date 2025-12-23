from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database.database import get_db, get_settings
from models.user import User
from schemas.user import TokenData

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def create_password_reset_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a short‑lived JWT specifically for password reset.
    Uses the same signing key as access tokens but a different scope.
    """
    if expires_delta is None:
        expires_delta = timedelta(hours=1)

    expire = datetime.utcnow() + expires_delta
    to_encode = {"sub": str(user_id), "scope": "password_reset", "exp": expire}
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def verify_password_reset_token(token: str) -> int:
    """
    Validate a password reset token and return the associated user ID.
    Raises HTTPException on any validation error so routes can surface a safe error.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        scope = payload.get("scope")
        if scope != "password_reset":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid password reset token",
            )

        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid password reset token",
            )

        return int(user_id)
    except JWTError:
        # This covers expired tokens as well
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token",
        )
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid password reset token",
        )


async def _get_token_with_logging(request: Request) -> str:
    """
    Wrapper around OAuth2PasswordBearer that logs why authentication failed
    before raising the usual HTTPException.
    """
    try:
        return await oauth2_scheme(request)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            # Missing or malformed Authorization header.
            client_host = request.client.host if request.client else "unknown"
            print(
                f"🔒 Auth: 401 from oauth2_scheme "
                f"(path={request.url.path}, client={client_host}, detail={exc.detail})"
            )
        raise


async def get_current_user(
    token: str = Depends(_get_token_with_logging),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id: int = payload.get("sub")
        if user_id is None:
            print("🔒 Auth: JWT missing 'sub' claim when validating token.")
            # #region agent log - write to debug log file
            import json
            import os
            log_path = "/Users/khoi/Desktop/TEMP/_Personal/_Cursor/_DandDy/.cursor/debug.log"
            try:
                with open(log_path, 'a') as f:
                    f.write(json.dumps({
                        "id": f"log_{int(__import__('time').time() * 1000)}_backend",
                        "timestamp": int(__import__('time').time() * 1000),
                        "location": "backend/utils/auth.py:get_current_user",
                        "message": "JWT missing sub claim",
                        "data": {"token_length": len(token)},
                        "sessionId": "debug-session",
                        "hypothesisId": "backend_token_validation",
                        "runId": "backend_validation"
                    }) + '\n')
            except:
                pass
            # #endregion
            raise credentials_exception

        # #region agent log - successful token decode
        import json
        import os
        log_path = "/Users/khoi/Desktop/TEMP/_Personal/_Cursor/_DandDy/.cursor/debug.log"
        try:
            exp_time = payload.get("exp")
            current_time = __import__('time').time()
            time_to_expiry = exp_time - current_time if exp_time else None
            with open(log_path, 'a') as f:
                f.write(json.dumps({
                    "id": f"log_{int(__import__('time').time() * 1000)}_backend",
                    "timestamp": int(__import__('time').time() * 1000),
                    "location": "backend/utils/auth.py:get_current_user",
                    "message": "Token decoded successfully",
                    "data": {"user_id": user_id, "exp": exp_time, "time_to_expiry_seconds": time_to_expiry},
                    "sessionId": "debug-session",
                    "hypothesisId": "backend_token_validation",
                    "runId": "backend_validation"
                }) + '\n')
        except:
            pass
        # #endregion

        token_data = TokenData(user_id=user_id)
    except ExpiredSignatureError:
        # Access token is well‑formed but has expired.
        print("🔒 Auth: Access token has expired during get_current_user.")
        # #region agent log - expired token
        import json
        import os
        log_path = "/Users/khoi/Desktop/TEMP/_Personal/_Cursor/_DandDy/.cursor/debug.log"
        try:
            with open(log_path, 'a') as f:
                f.write(json.dumps({
                    "id": f"log_{int(__import__('time').time() * 1000)}_backend",
                    "timestamp": int(__import__('time').time() * 1000),
                    "location": "backend/utils/auth.py:get_current_user",
                    "message": "Token expired",
                    "data": {"token_length": len(token)},
                    "sessionId": "debug-session",
                    "hypothesisId": "backend_token_validation",
                    "runId": "backend_validation"
                }) + '\n')
        except:
            pass
        # #endregion
        raise credentials_exception
    except JWTError as e:
        # Any other JWT parsing/validation error.
        print(f"🔒 Auth: Invalid access token during get_current_user: {e}")
        # #region agent log - JWT error
        import json
        import os
        log_path = "/Users/khoi/Desktop/TEMP/_Personal/_Cursor/_DandDy/.cursor/debug.log"
        try:
            with open(log_path, 'a') as f:
                f.write(json.dumps({
                    "id": f"log_{int(__import__('time').time() * 1000)}_backend",
                    "timestamp": int(__import__('time').time() * 1000),
                    "location": "backend/utils/auth.py:get_current_user",
                    "message": "JWT validation error",
                    "data": {"error": str(e), "token_length": len(token)},
                    "sessionId": "debug-session",
                    "hypothesisId": "backend_token_validation",
                    "runId": "backend_validation"
                }) + '\n')
        except:
            pass
        # #endregion
        raise credentials_exception

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None:
        print(f"🔒 Auth: User not found for token subject id={token_data.user_id}.")
        # #region agent log - user not found
        import json
        import os
        log_path = "/Users/khoi/Desktop/TEMP/_Personal/_Cursor/_DandDy/.cursor/debug.log"
        try:
            with open(log_path, 'a') as f:
                f.write(json.dumps({
                    "id": f"log_{int(__import__('time').time() * 1000)}_backend",
                    "timestamp": int(__import__('time').time() * 1000),
                    "location": "backend/utils/auth.py:get_current_user",
                    "message": "User not found for token",
                    "data": {"user_id": token_data.user_id},
                    "sessionId": "debug-session",
                    "hypothesisId": "backend_token_validation",
                    "runId": "backend_validation"
                }) + '\n')
        except:
            pass
        # #endregion
        raise credentials_exception
    return user


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


async def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Get current user from token if present, otherwise return None.
    This allows endpoints to work for both authenticated and unauthenticated users.
    """
    try:
        # Try to extract the token from the Authorization header
        authorization = request.headers.get("Authorization")
        if not authorization or not authorization.startswith("Bearer "):
            print(f"🔓 get_current_user_optional: No auth header (path={request.url.path})")
            return None
        
        token = authorization.replace("Bearer ", "")
        
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id: int = payload.get("sub")
        if user_id is None:
            print(f"🔓 get_current_user_optional: Token has no 'sub' claim")
            return None
        
        user = db.query(User).filter(User.id == int(user_id)).first()
        if user:
            print(f"🔓 get_current_user_optional: Found user {user.email} (role={user.role.value})")
        else:
            print(f"🔓 get_current_user_optional: User ID {user_id} not found in database")
        return user
    except ExpiredSignatureError:
        print(f"🔓 get_current_user_optional: Token EXPIRED")
        return None
    except JWTError as e:
        print(f"🔓 get_current_user_optional: JWT error: {e}")
        return None
    except (ValueError, AttributeError) as e:
        # Invalid/expired token or parsing error - treat as unauthenticated
        print(f"🔓 get_current_user_optional: Parse error: {e}")
        return None



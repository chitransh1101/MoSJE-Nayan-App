from pydantic import BaseModel, EmailStr, Field

from app.db.models.user import ROLES


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)  # full policy checked in the route
    role: str
    phone_number: str | None = Field(default=None, max_length=20)
    institute_id: str | None = None

    def validate_role(self):
        if self.role not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=256)


class MfaVerifyRequest(BaseModel):
    mfa_token: str = Field(max_length=2000)
    code: str = Field(min_length=6, max_length=20)


class PasswordOnly(BaseModel):
    password: str = Field(max_length=256)


class MfaCode(BaseModel):
    code: str = Field(min_length=6, max_length=20)


class MfaDisableRequest(BaseModel):
    password: str = Field(max_length=256)
    code: str = Field(min_length=6, max_length=20)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=256)
    new_password: str = Field(max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 900  # seconds until this access token expires
    idle_timeout: int = 1800  # server drops a session unused this many seconds
    session_id: str | None = None
    role: str
    user_id: str
    name: str
    institute_id: str | None = None
    designation: str | None = None
    employee_id: str | None = None
    district: str | None = None
    state: str | None = None
    mfa_enabled: bool = False
    last_login_at: str | None = None  # the PREVIOUS successful sign-in
    last_login_ip: str | None = None


class MeOut(BaseModel):
    user_id: str
    name: str
    email: str
    role: str
    institute_id: str | None = None
    designation: str | None = None
    employee_id: str | None = None
    district: str | None = None
    state: str | None = None
    mfa_enabled: bool = False
    last_login_at: str | None = None
    last_login_ip: str | None = None
    password_changed_at: str | None = None
    session_expires_at: str | None = None


class SessionOut(BaseModel):
    id: str
    created_at: str
    last_seen_at: str
    expires_at: str
    ip: str | None = None
    device: str | None = None
    current: bool = False

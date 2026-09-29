from datetime import datetime
from typing import Optional

from django.http import HttpRequest
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError
from pydantic import field_validator

from desk.auth_utils import bearer_auth, create_access_token, verify_password
from desk.models import OffsetSubmission, User

api = NinjaAPI(title="数控刀补复核台", version="1.0")

# 缺主轴温度的唯一挡回文案：页面提交与绕过页面直连接口共用此口径
MISSING_TEMP_MESSAGE = "送检刀补必须填写主轴温度"


class HealthOut(Schema):
    status: str


class LoginIn(Schema):
    username: str
    password: str


class LoginOut(Schema):
    token: str
    username: str
    role: str
    can_write: bool


class SubmissionIn(Schema):
    tool_code: str
    offset_um: int
    # 送检必填；保持可选以便缺字段/显式 null 都走进同一条挡回分支
    spindle_temp_c: Optional[int] = None

    @field_validator("spindle_temp_c", mode="before")
    @classmethod
    def _empty_temp_is_missing(cls, value):
        # 空串/纯空白一律视为缺温，交由统一挡回分支回同一文案
        if isinstance(value, str) and not value.strip():
            return None
        return value


class SubmissionOut(Schema):
    id: int
    tool_code: str
    offset_um: int
    spindle_temp_c: Optional[int]
    status: str
    verdict: str
    created_at: datetime
    reviewed_at: Optional[datetime]


class LockedTempOut(Schema):
    id: int
    tool_code: str
    spindle_temp_c: int
    created_at: datetime
    submitted_by: Optional[str]


def _to_out(row: OffsetSubmission) -> SubmissionOut:
    return SubmissionOut(
        id=row.id,
        tool_code=row.tool_code,
        offset_um=row.offset_um,
        spindle_temp_c=row.spindle_temp_c,
        status=row.status,
        verdict=row.verdict or "",
        created_at=row.created_at,
        reviewed_at=row.reviewed_at,
    )


def _to_locked_temp(row: OffsetSubmission) -> LockedTempOut:
    return LockedTempOut(
        id=row.id,
        tool_code=row.tool_code,
        spindle_temp_c=row.spindle_temp_c,
        created_at=row.created_at,
        submitted_by=row.submitted_by.username if row.submitted_by else None,
    )



@api.get("/health", response=HealthOut)
def health(request: HttpRequest):
    return {"status": "ok"}


@api.post("/auth/login", response=LoginOut)
def login(request: HttpRequest, body: LoginIn):
    try:
        user = User.objects.get(username=body.username)
    except User.DoesNotExist:
        raise HttpError(401, "用户名或密码错误")
    if not verify_password(body.password, user.password):
        raise HttpError(401, "用户名或密码错误")
    token = create_access_token(user)
    return {
        "token": token,
        "username": user.username,
        "role": user.role,
        "can_write": user.can_write,
    }


@api.get("/submissions", response=list[SubmissionOut], auth=bearer_auth)
def list_submissions(request: HttpRequest):
    rows = OffsetSubmission.objects.all()[:200]
    return [_to_out(r) for r in rows]


@api.get("/submissions/{submission_id}", response=SubmissionOut, auth=bearer_auth)
def get_submission(request: HttpRequest, submission_id: int):
    try:
        row = OffsetSubmission.objects.get(pk=submission_id)
    except OffsetSubmission.DoesNotExist:
        raise HttpError(404, "刀补记录不存在")
    return _to_out(row)


@api.post("/submissions", response=SubmissionOut, auth=bearer_auth)
def create_submission(request: HttpRequest, body: SubmissionIn):
    user: User = request.auth
    if not user.can_write:
        raise HttpError(403, "当前账号只读，不能提交刀补")
    # 缺温整笔挡回：不落任何库；页面表单与绕过页面的直连接口共用同一文案
    if body.spindle_temp_c is None:
        raise HttpError(400, MISSING_TEMP_MESSAGE)
    tool_code = body.tool_code.strip()
    if not tool_code:
        raise HttpError(400, "刀具编号不能为空")
    row = OffsetSubmission.objects.create(
        tool_code=tool_code,
        offset_um=body.offset_um,
        spindle_temp_c=body.spindle_temp_c,
        submitted_by=user,
        status=OffsetSubmission.Status.PENDING,
    )
    return _to_out(row)


@api.get("/temperature/locked", response=list[LockedTempOut], auth=bearer_auth)
def list_locked_temps(request: HttpRequest):
    """温感台·已锁定温度清单：温度随单落库即锁死，只读出不可改。"""
    rows = (
        OffsetSubmission.objects.filter(spindle_temp_c__isnull=False)
        .select_related("submitted_by")[:200]
    )
    return [_to_locked_temp(r) for r in rows]

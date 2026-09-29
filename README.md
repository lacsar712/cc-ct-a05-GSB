# 数控刀补复核台

操作员提交刀具编号与刀补微米值；后台 worker 用 PostgreSQL 行锁（`select_for_update(skip_locked=True)`）认领待复核记录，按绝对值是否不超过 12 微米给出「合格」或「超差」。

## 技术栈

| 层 | 选型 |
|----|------|
| 后端 | Django 5 + django-ninja（ASGI / uvicorn） |
| 前端 | SolidJS + Vite，nginx 反代 `/api` |
| 数据库 | PostgreSQL 16 |
| 鉴权 | JWT（python-jose），令牌存浏览器 localStorage |

## 端口

| 服务 | 地址 |
|------|------|
| 页面 | http://localhost:3196 |
| 接口 | http://localhost:8196 |
| PostgreSQL | localhost:54396（库名 `cncoffset`） |

## 账号

| 用户 | 密码 | 权限 |
|------|------|------|
| machinist | machine123456 | 可提交刀补 |
| auditor | audit123456 | 只读列表 |

## 启动

```bash
cd projects/17-cnc-tool-offset-desk
docker compose up --build
```

健康检查：`GET http://localhost:8196/api/health` → `{"status":"ok"}`

## 验收

1. machinist 登录后，种子数据应显示刀具 T01 合格（刀补 5 µm）、T09 超差（刀补 20 µm），两单温度快照均为 36℃。
2. 温感台初始为空：未录入主轴温度时送检（页面或直连 `POST /api/submissions`）一律 400 整笔挡回，文案「送检刀补必须填写主轴温度，请先到温感台录入主轴温度后再送检。」两条路径口径一致。
3. 在「温感台」录入 36℃ 后温度写入即锁定（无修改/删除入口）；再送检被收下，总览温度列、单据详情、温感台清单三处温度同为 36。
4. 之后再写入新温度只追加、不覆盖；旧送检单温度快照不变。新送检取温感台最新已锁定读数。
5. auditor 登录后可在总览、详情、温感台三处看到温度，但没有录温表单与送检表单（接口直连返回 403）。

## 目录

```text
backend/          Django 工程（config/、desk/、worker.py）
frontend/         SolidJS 单页
docker-compose.yml
PRD.md
```

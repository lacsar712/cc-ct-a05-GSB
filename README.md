# 数控刀补复核台

操作员提交刀具编号、刀补微米值与主轴温度；后台 worker 用 PostgreSQL 行锁（`select_for_update(skip_locked=True)`）认领待复核记录，按绝对值是否不超过 12 微米给出「合格」或「超差」。

## 主轴温度规则

- **送检必填**：创建刀补单必须带主轴温度（℃）。缺温整笔挡回、不落库。
- **两条路径同一口径**：页面提交与绕过页面直连 `POST /api/submissions`，缺温均返回 `400 {"detail":"送检刀补必须填写主轴温度"}`，文案由后端统一给出，禁止只挡页面。
- **写入即锁死**：温度随单落库后不可修改；系统不提供任何改温接口。总览温度列、单详情温度、温感台「已锁定温度清单」三处显示同一库列值。
- **温感台**：导航中的独立页面，含必填说明、温度录入栏、已锁定温度清单（不是总览加列）。复核员可见三处温度，但账号只读、不能送检。


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

1. machinist 登录后，种子数据应显示刀具 T01 合格（刀补 5 µm / 36℃）、T09 超差（刀补 20 µm / 38℃）。
2. 提交一条新刀补后，状态先为「待复核」，数秒内 worker 处理为「已完成」并给出结论。
3. auditor 登录后只能看列表，没有提交表单。
4. 缺主轴温度送检（页面留空或直连接口不带 `spindle_temp_c`）均被整笔挡回，文案一致：`送检刀补必须填写主轴温度`。
5. 填 36℃ 再送应收下；点开该单详情与温感台已锁定清单，两处温度均为 36；总览温度列同样为 36。

## 接口

| 方法/路径 | 说明 |
|-----------|------|
| `POST /api/submissions` | 送检，body 需含 `tool_code`、`offset_um`、`spindle_temp_c`；缺温 400 整笔挡回 |
| `GET /api/submissions` | 复核总览（含温度列） |
| `GET /api/submissions/{id}` | 单详情（含温度） |
| `GET /api/temperature/locked` | 温感台·已锁定温度清单（只读，无改温接口） |

## 目录

```text
backend/          Django 工程（config/、desk/、worker.py）
frontend/         SolidJS 单页
docker-compose.yml
PRD.md
```

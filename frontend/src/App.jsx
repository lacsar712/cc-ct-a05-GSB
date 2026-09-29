import { createSignal, onMount, Show, For, createEffect } from "solid-js";
import {
  clearSession,
  createSubmission,
  fetchLockedTemps,
  fetchSubmission,
  fetchSubmissions,
  getUser,
  login,
  setSession,
} from "./api";

const statusLabel = {
  pending: "待复核",
  processing: "复核中",
  done: "已完成",
};

const roleLabel = {
  machinist: "操作员",
  auditor: "复核员",
};

function readHash() {
  const raw = (location.hash || "#/").replace(/^#/, "") || "/";
  const mDetail = raw.match(/^\/detail\/(\d+)/);
  if (mDetail) return { name: "detail", id: Number(mDetail[1]) };
  if (raw === "/temp") return { name: "temp", id: null };
  return { name: "home", id: null };
}

// 送检录入栏：总览与温感台共用同一组件、同一接口，缺温文案由后端统一给出
function SubmitForm(props) {
  return (
    <section class="card">
      <h2>{props.title || "提交刀补"}</h2>
      <form onSubmit={props.onSubmit} class="form inline">
        <label>
          刀具编号
          <input
            placeholder="如 T01"
            value={props.toolCode()}
            onInput={(e) => props.setToolCode(e.currentTarget.value)}
            required
          />
        </label>
        <label>
          刀补（微米）
          <input
            type="number"
            value={props.offsetUm()}
            onInput={(e) => props.setOffsetUm(e.currentTarget.value)}
            required
          />
        </label>
        <label class="required-field">
          主轴温度（℃）必填
          <input
            type="number"
            placeholder="如 36"
            value={props.spindleTemp()}
            onInput={(e) => props.setSpindleTemp(e.currentTarget.value)}
          />
        </label>
        <button type="submit">提交待复核</button>
      </form>
      <p class="hint">送检刀补必须填写主轴温度；温度随单写入后即锁死，不可修改。</p>
    </section>
  );
}

function App() {
  const [user, setUser] = createSignal(getUser());
  const [rows, setRows] = createSignal([]);
  const [detail, setDetail] = createSignal(null);
  const [lockedTemps, setLockedTemps] = createSignal([]);
  const [route, setRoute] = createSignal(readHash());
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  const [loginUser, setLoginUser] = createSignal("machinist");
  const [loginPass, setLoginPass] = createSignal("machine123456");

  const [toolCode, setToolCode] = createSignal("");
  const [offsetUm, setOffsetUm] = createSignal("");
  const [spindleTemp, setSpindleTemp] = createSignal("");

  function goHome() {
    location.hash = "#/";
  }

  function goTemp() {
    location.hash = "#/temp";
  }

  function goDetail(id) {
    location.hash = `#/detail/${id}`;
  }

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchSubmissions();
      setRows(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadLockedTemps() {
    setError("");
    try {
      setLockedTemps(await fetchLockedTemps());
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadDetail(id) {
    setLoading(true);
    setError("");
    try {
      setDetail(await fetchSubmission(id));
    } catch (e) {
      setError(e.message);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  onMount(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    if (user()) {
      if (route().name === "detail") loadDetail(route().id);
      else if (route().name === "temp") loadLockedTemps();
      else loadRows();
    }
    return () => window.removeEventListener("hashchange", onHash);
  });

  createEffect(() => {
    const r = route();
    if (!user()) return;
    if (r.name === "detail" && r.id) loadDetail(r.id);
    if (r.name === "home") loadRows();
    if (r.name === "temp") loadLockedTemps();
  });

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await login(loginUser(), loginPass());
      setSession(data.token, {
        username: data.username,
        role: data.role,
        can_write: data.can_write,
      });
      setUser(getUser());
      goHome();
      await loadRows();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleLogout() {
    clearSession();
    setUser(null);
    setRows([]);
    setDetail(null);
    setLockedTemps([]);
    goHome();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await createSubmission(toolCode(), offsetUm(), spindleTemp());
      setToolCode("");
      setOffsetUm("");
      setSpindleTemp("");
      // 温感台清单与总览同源，写一笔两处一起刷新
      await Promise.all([loadRows(), loadLockedTemps()]);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div class="page">
      <header class="topbar">
        <div class="brand">
          <h1>数控刀补复核台</h1>
          <p class="hint">刀补绝对值不超过十二微米判合格，否则超差。送检必须填写主轴温度，写入即锁死。</p>
        </div>
        <Show when={user()}>
          <nav class="topnav">
            <a
              href="#/"
              class={route().name === "home" ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                goHome();
              }}
            >
              复核总览
            </a>
            <a
              href="#/temp"
              class={route().name === "temp" ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                goTemp();
              }}
            >
              温感台
            </a>
          </nav>
        </Show>
      </header>

      <Show when={error()}>
        <div class="banner error">{error()}</div>
      </Show>

      <Show
        when={user()}
        fallback={
          <section class="card">
            <h2>登录</h2>
            <form onSubmit={handleLogin} class="form">
              <label>
                用户名
                <input
                  value={loginUser()}
                  onInput={(e) => setLoginUser(e.currentTarget.value)}
                />
              </label>
              <label>
                密码
                <input
                  type="password"
                  value={loginPass()}
                  onInput={(e) => setLoginPass(e.currentTarget.value)}
                />
              </label>
              <button type="submit">进入系统</button>
            </form>
            <p class="hint">操作员 machinist / machine123456；复核员 auditor / audit123456（只读）</p>
          </section>
        }
      >
        <section class="card toolbar">
          <div>
            当前用户：<strong>{user().username}</strong>（{roleLabel[user().role] || user().role}）
          </div>
          <button type="button" class="ghost" onClick={handleLogout}>
            退出
          </button>
        </section>

        <Show when={route().name === "home"}>
          <Show when={user().can_write}>
            <SubmitForm
              title="提交刀补"
              toolCode={toolCode}
              setToolCode={setToolCode}
              offsetUm={offsetUm}
              setOffsetUm={setOffsetUm}
              spindleTemp={spindleTemp}
              setSpindleTemp={setSpindleTemp}
              onSubmit={handleSubmit}
            />
          </Show>

          <section class="card">
            <div class="toolbar">
              <h2>复核列表</h2>
              <button type="button" class="ghost" onClick={loadRows} disabled={loading()}>
                {loading() ? "刷新中…" : "刷新"}
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>刀具</th>
                  <th>刀补 µm</th>
                  <th>主轴温度 ℃</th>
                  <th>状态</th>
                  <th>结论</th>
                  <th>提交时间</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <For each={rows()}>
                  {(row) => (
                    <tr>
                      <td>{row.tool_code}</td>
                      <td>{row.offset_um}</td>
                      <td>{row.spindle_temp_c == null ? "—" : row.spindle_temp_c}</td>
                      <td>{statusLabel[row.status] || row.status}</td>
                      <td class={row.verdict === "合格" ? "pass" : row.verdict === "超差" ? "fail" : ""}>
                        {row.verdict || "—"}
                      </td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                      <td>
                        <button type="button" class="ghost" onClick={() => goDetail(row.id)}>
                          详情
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <Show when={!rows().length && !loading()}>
              <p class="hint">暂无记录</p>
            </Show>
          </section>
        </Show>

        <Show when={route().name === "temp"}>
          <section class="card">
            <h2>温感台</h2>
            <p class="hint">
              必填说明：送检刀补必须填写主轴温度。未填写主轴温度的送检会被整笔挡回；
              温度一经随单写入即锁死，温感台清单、总览温度列、单详情三处显示同一温度，
              事后无法修改旧单温度。
            </p>
          </section>

          <Show
            when={user().can_write}
            fallback={
              <section class="card">
                <p class="hint">当前为只读复核账号，不能送检；可查看下方已锁定温度清单。</p>
              </section>
            }
          >
            <SubmitForm
              title="温度录入栏"
              toolCode={toolCode}
              setToolCode={setToolCode}
              offsetUm={offsetUm}
              setOffsetUm={setOffsetUm}
              spindleTemp={spindleTemp}
              setSpindleTemp={setSpindleTemp}
              onSubmit={handleSubmit}
            />
          </Show>

          <section class="card">
            <div class="toolbar">
              <h2>已锁定温度清单</h2>
              <button type="button" class="ghost" onClick={loadLockedTemps}>
                刷新
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>单号</th>
                  <th>刀具</th>
                  <th>主轴温度 ℃</th>
                  <th>送检人</th>
                  <th>锁定时间</th>
                </tr>
              </thead>
              <tbody>
                <For each={lockedTemps()}>
                  {(row) => (
                    <tr>
                      <td>#{row.id}</td>
                      <td>{row.tool_code}</td>
                      <td class="locked-temp">{row.spindle_temp_c}</td>
                      <td>{row.submitted_by || "—"}</td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <Show when={!lockedTemps().length}>
              <p class="hint">暂无已锁定温度记录</p>
            </Show>
          </section>
        </Show>

        <Show when={route().name === "detail"}>
          <section class="card">
            <div class="toolbar">
              <h2>刀补详情</h2>
              <button type="button" class="ghost" onClick={goHome}>
                返回总览
              </button>
            </div>
            <Show when={detail()} fallback={<p class="hint">{loading() ? "加载中…" : "未找到记录"}</p>}>
              {(d) => (
                <div class="detail-grid">
                  <p>编号：{d().id}</p>
                  <p>刀具：{d().tool_code}</p>
                  <p>刀补 µm：{d().offset_um}</p>
                  <p>
                    主轴温度 ℃：
                    {d().spindle_temp_c == null ? "—" : `${d().spindle_temp_c}（已锁定）`}
                  </p>
                  <p>状态：{statusLabel[d().status] || d().status}</p>
                  <p class={d().verdict === "合格" ? "pass" : d().verdict === "超差" ? "fail" : ""}>
                    结论：{d().verdict || "—"}
                  </p>
                  <p>提交时间：{new Date(d().created_at).toLocaleString()}</p>
                  <p>
                    复核时间：
                    {d().reviewed_at ? new Date(d().reviewed_at).toLocaleString() : "—"}
                  </p>
                </div>
              )}
            </Show>
          </section>
        </Show>
      </Show>
    </div>
  );
}

export default App;

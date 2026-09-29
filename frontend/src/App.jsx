import { createSignal, onMount, Show, For, createEffect } from "solid-js";
import {
  clearSession,
  createSubmission,
  fetchSubmission,
  fetchSubmissions,
  fetchTemperatures,
  getUser,
  login,
  recordTemperature,
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

// 与后端完全一致的缺温挡回文案，页面拦截与接口挡回同一口径
const TEMP_REQUIRED_MESSAGE =
  "送检刀补必须填写主轴温度，请先到温感台录入主轴温度后再送检。";

function readHash() {
  const raw = (location.hash || "#/").replace(/^#/, "") || "/";
  let m = raw.match(/^\/detail\/(\d+)/);
  if (m) return { name: "detail", id: Number(m[1]) };
  if (raw === "/thermal") return { name: "thermal", id: null };
  return { name: "home", id: null };
}

function App() {
  const [user, setUser] = createSignal(getUser());
  const [rows, setRows] = createSignal([]);
  const [detail, setDetail] = createSignal(null);
  const [temps, setTemps] = createSignal([]);
  const [route, setRoute] = createSignal(readHash());
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  const [loginUser, setLoginUser] = createSignal("machinist");
  const [loginPass, setLoginPass] = createSignal("machine123456");

  const [toolCode, setToolCode] = createSignal("");
  const [offsetUm, setOffsetUm] = createSignal("");
  const [tempInput, setTempInput] = createSignal("");

  function goHome() {
    location.hash = "#/";
  }

  function goThermal() {
    location.hash = "#/thermal";
  }

  function goDetail(id) {
    location.hash = `#/detail/${id}`;
  }

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchSubmissions());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
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

  async function loadTemps() {
    try {
      setTemps(await fetchTemperatures());
    } catch (e) {
      setError(e.message);
    }
  }

  onMount(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    if (user()) {
      loadTemps();
      if (route().name === "detail") loadDetail(route().id);
      else loadRows();
    }
    return () => window.removeEventListener("hashchange", onHash);
  });

  createEffect(() => {
    const r = route();
    if (!user()) return;
    if (r.name === "detail" && r.id) loadDetail(r.id);
    if (r.name === "home") loadRows();
    if (r.name === "thermal") loadTemps();
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
      await Promise.all([loadRows(), loadTemps()]);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleLogout() {
    clearSession();
    setUser(null);
    setRows([]);
    setDetail(null);
    setTemps([]);
    goHome();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    // 页面侧缺温整笔挡回，文案与接口挡回一致；绕过页面时后端同样挡回
    if (!temps().length) {
      setError(TEMP_REQUIRED_MESSAGE);
      return;
    }
    try {
      await createSubmission(toolCode(), offsetUm());
      setToolCode("");
      setOffsetUm("");
      await loadRows();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRecordTemp(e) {
    e.preventDefault();
    setError("");
    try {
      await recordTemperature(tempInput());
      setTempInput("");
      await loadTemps();
    } catch (err) {
      setError(err.message);
    }
  }

  const latestTemp = () => (temps().length ? temps()[0].temp_c : null);

  return (
    <div class="page">
      <header class="topbar">
        <div class="brand">
          <h1>数控刀补复核台</h1>
          <p class="hint">刀补绝对值不超过十二微米判合格，否则超差。送检刀补必须填写主轴温度。</p>
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
              href="#/thermal"
              class={route().name === "thermal" ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                goThermal();
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
            <section class="card">
              <h2>提交刀补</h2>
              <p class="hint">
                送检必填主轴温度：请先到「温感台」录入温度，温度一经写入立即锁定，送检时自动取温感台最新已锁定读数。
              </p>
              <Show
                when={latestTemp() !== null}
                fallback={
                  <p class="fail">
                    {TEMP_REQUIRED_MESSAGE}
                    请先 <a href="#/thermal" onClick={(e) => { e.preventDefault(); goThermal(); }}>前往温感台录入</a>。
                  </p>
                }
              >
                <p class="pass">当前温感台已锁定主轴温度：{latestTemp()}℃，送检将以此温度快照落单。</p>
              </Show>
              <form onSubmit={handleSubmit} class="form inline">
                <label>
                  刀具编号
                  <input
                    placeholder="如 T01"
                    value={toolCode()}
                    onInput={(e) => setToolCode(e.currentTarget.value)}
                    required
                  />
                </label>
                <label>
                  刀补（微米）
                  <input
                    type="number"
                    value={offsetUm()}
                    onInput={(e) => setOffsetUm(e.currentTarget.value)}
                    required
                  />
                </label>
                <button type="submit">提交待复核</button>
              </form>
            </section>
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
                      <td>{row.spindle_temp_c}℃</td>
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

        <Show when={route().name === "thermal"}>
          <section class="card">
            <h2>温感台</h2>
            <p class="hint">
              送检刀补必须填写主轴温度：录入主轴温度后才能送检。温度一经写入立即锁定，不可修改、不可删除；
              后续送检自动取最新已锁定读数，历史送检单保留当时快照，事后改温不影响旧单。
            </p>
            <Show when={user().can_write} fallback={<p class="hint">当前为只读账号，仅可查看已锁定温度。</p>}>
              <form onSubmit={handleRecordTemp} class="form inline">
                <label>
                  主轴温度（摄氏度）
                  <input
                    type="number"
                    placeholder="如 36"
                    value={tempInput()}
                    onInput={(e) => setTempInput(e.currentTarget.value)}
                    required
                  />
                </label>
                <button type="submit">写入并锁定</button>
              </form>
            </Show>
          </section>

          <section class="card">
            <div class="toolbar">
              <h2>已锁定温度清单</h2>
              <button type="button" class="ghost" onClick={loadTemps}>
                刷新
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>主轴温度 ℃</th>
                  <th>录入人</th>
                  <th>录入时间</th>
                </tr>
              </thead>
              <tbody>
                <For each={temps()}>
                  {(t) => (
                    <tr>
                      <td>{t.temp_c}℃</td>
                      <td>{t.recorded_by || "—"}</td>
                      <td>{new Date(t.created_at).toLocaleString()}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <Show when={!temps().length}>
              <p class="hint">温感台尚无读数——此时送检将被整笔挡回。</p>
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
                  <p>主轴温度 ℃：{d().spindle_temp_c}℃</p>
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

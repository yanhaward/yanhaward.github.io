const leaderboardData = [
  { rank: 1, team: "RoboNova / dex-agent-x", overall: 95.2, success: "93.8%", latency: "182ms" },
  { rank: 2, team: "TsingLab / policy-omega", overall: 93.7, success: "91.9%", latency: "176ms" },
  { rank: 3, team: "OpenMotion / grasp-gpt", overall: 91.3, success: "89.7%", latency: "201ms" },
  { rank: 4, team: "ArenaInternal / planner-v4", overall: 90.6, success: "88.2%", latency: "169ms" },
  { rank: 5, team: "DexMinds / bimanual-lite", overall: 89.8, success: "87.3%", latency: "188ms" },
  { rank: 6, team: "RoboNova / dex-agent-x", overall: 95.2, success: "93.8%", latency: "182ms" },
  { rank: 7, team: "TsingLab / policy-omega", overall: 93.7, success: "91.9%", latency: "176ms" },
  { rank: 8, team: "OpenMotion / grasp-gpt", overall: 91.3, success: "89.7%", latency: "201ms" },
  { rank: 9, team: "ArenaInternal / planner-v4", overall: 90.6, success: "88.2%", latency: "169ms" },
  { rank: 10, team: "DexMinds / bimanual-lite", overall: 89.8, success: "87.3%", latency: "188ms" }
];

const defaultHistoryData = {
  "Pick & Place": [
    {
      date: "2026-03-08 10:24",
      model: "DexPilot-v2",
      version: "v1.3.2",
      score: 90.1,
      result: "PASS"
    },
    {
      date: "2026-03-09 14:02",
      model: "DexPilot-v2",
      version: "v1.3.5",
      score: 92.4,
      result: "PASS"
    }
  ],
  "Long Horizon": [
    {
      date: "2026-03-06 16:45",
      model: "HorizonOne",
      version: "v0.9.8",
      score: 84.9,
      result: "PASS"
    },
    {
      date: "2026-03-09 09:12",
      model: "HorizonOne",
      version: "v1.0.0",
      score: 87.2,
      result: "PASS"
    }
  ],
  "Tool Use": [
    {
      date: "2026-03-07 11:11",
      model: "ToolSmith",
      version: "v2.1.0",
      score: 79.3,
      result: "FAIL"
    },
    {
      date: "2026-03-09 18:26",
      model: "ToolSmith",
      version: "v2.1.3",
      score: 85.1,
      result: "PASS"
    }
  ],
  Navigation: [
    {
      date: "2026-03-05 08:30",
      model: "NavCore",
      version: "v3.0.2",
      score: 88.8,
      result: "PASS"
    }
  ]
};

const STORAGE_KEY = "arenaHistoryData";
const LANGUAGE_STORAGE_KEY = "arenaUiLanguage";

const translations = {
  zh: {
    "title.home": "Arena 挑战门户",
    "title.leaderboard": "排行榜 - ArenaEval",
    "title.history": "历史评测结果 - ArenaEval",
    "title.evaluation": "评测入口 - ArenaEval",
    "title.login": "登录 - ArenaEval",
    "topbar.home": "首页",
    "topbar.leaderboard": "排行榜",
    "topbar.history": "历史结果",
    "topbar.join": "加入挑战",
    "topbar.login": "登录",
    "topbar.homeAria": "返回首页",
    "topbar.logoAlt": "ArenaEval 机器人竞赛 Logo",
    "home.heroTag": "真实世界策略评测",
    "home.heroTitle": "ArenaEval 机器人竞赛平台",
    "home.ctaEval": "进入评测",
    "home.ctaLeaderboard": "查看排行榜",
    "home.cardLoginTitle": "登录页面",
    "home.cardLoginDesc": "用户登录入口，独立路由。",
    "home.cardLoginAction": "打开 login.html",
    "home.cardEvalTitle": "评测页面",
    "home.cardEvalDesc": "模型提交与评测触发，独立路由。",
    "home.cardEvalAction": "打开 evaluation.html",
    "home.cardLeaderboardTitle": "排行榜页面",
    "home.cardLeaderboardDesc": "Leaderboard 数据展示，独立路由。",
    "home.cardLeaderboardAction": "打开 leaderboard.html",
    "home.cardHistoryTitle": "历史结果页面",
    "home.cardHistoryDesc": "单项测试历史结果查询，独立路由。",
    "home.cardHistoryAction": "打开 history.html",
    "leaderboard.heading": "排行榜",
    "leaderboard.desc": "按综合分排序，实时对比各策略表现。",
    "leaderboard.colRank": "名次",
    "leaderboard.colTeam": "团队 / 模型",
    "leaderboard.colOverall": "综合分",
    "leaderboard.colSuccess": "成功率",
    "leaderboard.colLatency": "延迟",
    "history.heading": "单项测试历史评测结果",
    "history.desc": "按测试项目查看历次评测记录和分数波动。",
    "history.filterLabel": "选择测试项目",
    "history.empty": "该测试暂无历史评测结果。",
    "history.meta": "评测时间",
    "history.score": "得分",
    "history.result": "结果",
    "result.pass": "通过",
    "result.fail": "失败",
    "evaluation.heading": "评测入口",
    "evaluation.desc": "提交模型、选择测试集并触发评测。",
    "evaluation.modelLabel": "模型名称",
    "evaluation.modelPlaceholder": "例如：DexPilot-v2",
    "evaluation.testLabel": "测试项目",
    "evaluation.versionLabel": "提交版本",
    "evaluation.versionPlaceholder": "例如：v1.3.5",
    "evaluation.submit": "提交评测",
    "evaluation.statusIdle": "暂无新提交",
    "evaluation.statusSubmitted": "提交成功: {model} ({version}) -> {test}",
    "login.heading": "用户登录入口",
    "login.desc": "支持用户名 + 密码登录入口，你也可以扩展到 OAuth 或企业 SSO。",
    "login.usernameLabel": "用户名",
    "login.usernamePlaceholder": "请输入用户名",
    "login.passwordLabel": "密码",
    "login.passwordPlaceholder": "请输入密码",
    "login.submit": "登录",
    "login.statusIdle": "未登录",
    "login.statusLoggedIn": "已登录: {username}",
    "tests.pickPlace": "抓取放置",
    "tests.longHorizon": "长时程任务",
    "tests.toolUse": "工具使用",
    "tests.navigation": "导航",
    "footer.title": "ArenaEval Demo",
    "footer.contactLabel": "联系方式",
    "footer.githubLabel": "GitHub 仓库",
    "footer.note": "ArenaEval"
  },
  en: {
    "title.home": "Arena Challenge Portal",
    "title.leaderboard": "Leaderboard - ArenaEval",
    "title.history": "History Results - ArenaEval",
    "title.evaluation": "Evaluation Entry - ArenaEval",
    "title.login": "Login - ArenaEval",
    "topbar.home": "Home",
    "topbar.leaderboard": "Leaderboard",
    "topbar.history": "History",
    "topbar.join": "Join Challenge",
    "topbar.login": "Log in",
    "topbar.homeAria": "Go to home",
    "topbar.logoAlt": "ArenaEval Robotics Competition Logo",
    "home.heroTag": "REAL-WORLD POLICY EVALUATION",
    "home.heroTitle": "ArenaEval Robotics Competition Platform",
    "home.ctaEval": "Start Evaluation",
    "home.ctaLeaderboard": "View Leaderboard",
    "home.cardLoginTitle": "Login Page",
    "home.cardLoginDesc": "User login entry with an independent route.",
    "home.cardLoginAction": "Open login.html",
    "home.cardEvalTitle": "Evaluation Page",
    "home.cardEvalDesc": "Submit models and trigger evaluations on a dedicated route.",
    "home.cardEvalAction": "Open evaluation.html",
    "home.cardLeaderboardTitle": "Leaderboard Page",
    "home.cardLeaderboardDesc": "Leaderboard data display with an independent route.",
    "home.cardLeaderboardAction": "Open leaderboard.html",
    "home.cardHistoryTitle": "History Page",
    "home.cardHistoryDesc": "Query history results by test item with an independent route.",
    "home.cardHistoryAction": "Open history.html",
    "leaderboard.heading": "Leaderboard",
    "leaderboard.desc": "Sorted by overall score for real-time strategy comparison.",
    "leaderboard.colRank": "Rank",
    "leaderboard.colTeam": "Team / Model",
    "leaderboard.colOverall": "Overall",
    "leaderboard.colSuccess": "Success Rate",
    "leaderboard.colLatency": "Latency",
    "history.heading": "Per-Test Evaluation History",
    "history.desc": "Browse records and score trends by test type.",
    "history.filterLabel": "Select test",
    "history.empty": "No historical evaluation result for this test yet.",
    "history.meta": "Evaluated at",
    "history.score": "Score",
    "history.result": "Result",
    "result.pass": "PASS",
    "result.fail": "FAIL",
    "evaluation.heading": "Evaluation Entry",
    "evaluation.desc": "Submit your model, choose a test set, and trigger evaluation.",
    "evaluation.modelLabel": "Model Name",
    "evaluation.modelPlaceholder": "e.g. DexPilot-v2",
    "evaluation.testLabel": "Test",
    "evaluation.versionLabel": "Version",
    "evaluation.versionPlaceholder": "e.g. v1.3.5",
    "evaluation.submit": "Submit Evaluation",
    "evaluation.statusIdle": "No new submission",
    "evaluation.statusSubmitted": "Submitted: {model} ({version}) -> {test}",
    "login.heading": "User Login",
    "login.desc": "Username/password entry, easy to extend to OAuth or enterprise SSO.",
    "login.usernameLabel": "Username",
    "login.usernamePlaceholder": "Enter username",
    "login.passwordLabel": "Password",
    "login.passwordPlaceholder": "Enter password",
    "login.submit": "Log in",
    "login.statusIdle": "Not logged in",
    "login.statusLoggedIn": "Logged in: {username}",
    "tests.pickPlace": "Pick & Place",
    "tests.longHorizon": "Long Horizon",
    "tests.toolUse": "Tool Use",
    "tests.navigation": "Navigation",
    "footer.title": "ArenaEval Demo",
    "footer.contactLabel": "Contact",
    "footer.githubLabel": "GitHub Repository",
    "footer.note": "ArenaEval"
  }
};

const testNameI18nKeys = {
  "Pick & Place": "tests.pickPlace",
  "Long Horizon": "tests.longHorizon",
  "Tool Use": "tests.toolUse",
  Navigation: "tests.navigation"
};

let currentLang = "zh";

let historyData = loadHistoryData();

const leaderboardBody = document.getElementById("leaderboardBody");
const testFilter = document.getElementById("testFilter");
const historyList = document.getElementById("historyList");
const loginForm = document.getElementById("loginForm");
const evalForm = document.getElementById("evalForm");
const loginStatus = document.getElementById("loginStatus");
const evalStatus = document.getElementById("evalStatus");
const langToggleBtn = document.getElementById("langToggleBtn");

function resolveInitialLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === "zh" || saved === "en") {
      return saved;
    }
  } catch {
    // Ignore localStorage access issues.
  }

  const pageLang = (document.documentElement.lang || "").toLowerCase();
  return pageLang.startsWith("zh") ? "zh" : "en";
}

function t(key) {
  const dict = translations[currentLang] || translations.en;
  return dict[key] || key;
}

function tf(key, params) {
  return t(key).replace(/\{(\w+)\}/g, (_, token) => (params && token in params ? params[token] : `{${token}}`));
}

function applyI18nToStaticNodes() {
  const i18nNodes = document.querySelectorAll("[data-i18n]");

  i18nNodes.forEach((node) => {
    const key = node.getAttribute("data-i18n");
    const text = t(key);
    if (text) {
      node.textContent = text;
    }
  });

  const placeholderNodes = document.querySelectorAll("[data-i18n-placeholder]");
  placeholderNodes.forEach((node) => {
    const key = node.getAttribute("data-i18n-placeholder");
    const text = t(key);
    if (text) {
      node.setAttribute("placeholder", text);
    }
  });

  const ariaNodes = document.querySelectorAll("[data-i18n-aria-label]");
  ariaNodes.forEach((node) => {
    const key = node.getAttribute("data-i18n-aria-label");
    const text = t(key);
    if (text) {
      node.setAttribute("aria-label", text);
    }
  });

  const altNodes = document.querySelectorAll("[data-i18n-alt]");
  altNodes.forEach((node) => {
    const key = node.getAttribute("data-i18n-alt");
    const text = t(key);
    if (text) {
      node.setAttribute("alt", text);
    }
  });
}

function setSiteLanguage(lang) {
  currentLang = lang;
  applyI18nToStaticNodes();

  if (langToggleBtn) {
    langToggleBtn.textContent = lang === "zh" ? "EN" : "中";
    langToggleBtn.setAttribute("aria-label", lang === "zh" ? "切换到英文" : "Switch to Chinese");
  }

  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
}

function initTopbarLanguageToggle() {
  currentLang = resolveInitialLanguage();
  setSiteLanguage(currentLang);

  if (testFilter && historyList) {
    renderFilterOptions();
    renderHistory(testFilter.value || Object.keys(historyData)[0]);
  }

  if (langToggleBtn) {
    langToggleBtn.addEventListener("click", () => {
      currentLang = currentLang === "zh" ? "en" : "zh";
      setSiteLanguage(currentLang);

      if (testFilter && historyList) {
        renderFilterOptions();
        renderHistory(testFilter.value);
      }

      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLang);
      } catch {
        // Ignore localStorage access issues.
      }
    });
  }
}

function loadHistoryData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(defaultHistoryData);
    }

    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : structuredClone(defaultHistoryData);
  } catch {
    return structuredClone(defaultHistoryData);
  }
}

function saveHistoryData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyData));
  } catch {
    // Ignore storage errors and keep in-memory data.
  }
}

function renderLeaderboard() {
  leaderboardBody.innerHTML = leaderboardData
    .map(
      (row) => `
      <tr>
        <td><span class="rank-pill ${
          row.rank === 1 ? "rank-gold" : row.rank === 2 ? "rank-silver" : row.rank === 3 ? "rank-bronze" : ""
        }">${row.rank}</span></td>
        <td>${row.team}</td>
        <td>${row.overall.toFixed(1)}</td>
        <td>${row.success}</td>
        <td>${row.latency}</td>
      </tr>
    `
    )
    .join("");
}

function renderFilterOptions() {
  const testNames = Object.keys(historyData);
  testFilter.innerHTML = testNames
    .map((name) => `<option value="${name}">${t(testNameI18nKeys[name] || name)}</option>`)
    .join("");
}

function renderHistory(testName) {
  const records = historyData[testName] || [];
  if (!records.length) {
    historyList.innerHTML = `<div class="empty">${t("history.empty")}</div>`;
    return;
  }

  historyList.innerHTML = records
    .map(
      (item) => `
      <article class="history-item">
        <p><strong>${item.model}</strong> (${item.version})</p>
        <p class="meta">${t("history.meta")}: ${item.date}</p>
        <p>${t("history.score")}: <strong>${item.score}</strong> | ${t("history.result")}: <strong style="color:${
          item.result === "PASS" ? "#7dffd9" : "#ff9aaa"
        }">${item.result === "PASS" ? t("result.pass") : t("result.fail")}</strong></p>
      </article>
    `
    )
    .join("");
}

function addEvaluationRecord(testName, modelName, version) {
  const score = Number((76 + Math.random() * 22).toFixed(1));
  const result = score >= 82 ? "PASS" : "FAIL";
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(
    2,
    "0"
  )}`;

  if (!historyData[testName]) {
    historyData[testName] = [];
  }

  historyData[testName].unshift({
    date,
    model: modelName,
    version,
    score,
    result
  });

  saveHistoryData();
}

if (loginForm && loginStatus) {
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const username = formData.get("username");
    loginStatus.textContent = tf("login.statusLoggedIn", { username });
    loginStatus.style.color = "#7dffd9";
    loginForm.reset();
  });
}

if (evalForm && evalStatus) {
  evalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(evalForm);
    const modelName = formData.get("modelName");
    const testName = formData.get("testName");
    const version = formData.get("version");

    addEvaluationRecord(testName, modelName, version);

    if (testFilter && historyList) {
      renderHistory(testName);
      testFilter.value = testName;
    }

    evalStatus.textContent = tf("evaluation.statusSubmitted", {
      model: modelName,
      version,
      test: t(testNameI18nKeys[testName] || testName)
    });
    evalStatus.style.color = "#7dffd9";
    evalForm.reset();
  });
}

if (testFilter && historyList) {
  testFilter.addEventListener("change", (event) => {
    renderHistory(event.target.value);
  });
}

if (leaderboardBody) {
  renderLeaderboard();
}

if (testFilter && historyList) {
  renderFilterOptions();
  renderHistory(Object.keys(historyData)[0]);
}

initTopbarLanguageToggle();

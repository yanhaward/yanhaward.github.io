const leaderboardData = [
  { rank: 1, team: "RoboNova / dex-agent-x", overall: 95.2, success: "93.8%", latency: "182ms" },
  { rank: 2, team: "TsingLab / policy-omega", overall: 93.7, success: "91.9%", latency: "176ms" },
  { rank: 3, team: "OpenMotion / grasp-gpt", overall: 91.3, success: "89.7%", latency: "201ms" },
  { rank: 4, team: "ArenaInternal / planner-v4", overall: 90.6, success: "88.2%", latency: "169ms" },
  { rank: 5, team: "DexMinds / bimanual-lite", overall: 89.8, success: "87.3%", latency: "188ms" }
];

const historyData = {
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

const leaderboardBody = document.getElementById("leaderboardBody");
const testFilter = document.getElementById("testFilter");
const historyList = document.getElementById("historyList");
const loginForm = document.getElementById("loginForm");
const evalForm = document.getElementById("evalForm");
const loginStatus = document.getElementById("loginStatus");
const evalStatus = document.getElementById("evalStatus");

function renderLeaderboard() {
  leaderboardBody.innerHTML = leaderboardData
    .map(
      (row) => `
      <tr>
        <td><span class="rank-pill">#${row.rank}</span></td>
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
    .map((name) => `<option value="${name}">${name}</option>`)
    .join("");
}

function renderHistory(testName) {
  const records = historyData[testName] || [];
  if (!records.length) {
    historyList.innerHTML = '<div class="empty">该测试暂无历史评测结果。</div>';
    return;
  }

  historyList.innerHTML = records
    .map(
      (item) => `
      <article class="history-item">
        <p><strong>${item.model}</strong> (${item.version})</p>
        <p class="meta">评测时间: ${item.date}</p>
        <p>得分: <strong>${item.score}</strong> | 结果: <strong style="color:${
          item.result === "PASS" ? "#7dffd9" : "#ff9aaa"
        }">${item.result}</strong></p>
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
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = formData.get("username");
  loginStatus.textContent = `已登录: ${username}`;
  loginStatus.style.color = "#7dffd9";
  loginForm.reset();
});

evalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(evalForm);
  const modelName = formData.get("modelName");
  const testName = formData.get("testName");
  const version = formData.get("version");

  addEvaluationRecord(testName, modelName, version);
  renderHistory(testName);
  testFilter.value = testName;

  evalStatus.textContent = `提交成功: ${modelName} (${version}) -> ${testName}`;
  evalStatus.style.color = "#7dffd9";
  evalForm.reset();
});

testFilter.addEventListener("change", (event) => {
  renderHistory(event.target.value);
});

renderLeaderboard();
renderFilterOptions();
renderHistory(Object.keys(historyData)[0]);

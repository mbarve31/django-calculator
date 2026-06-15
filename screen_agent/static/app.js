(() => {
  const preview = document.getElementById("preview");
  const canvas = document.getElementById("capture-canvas");
  const previewEmpty = document.getElementById("preview-empty");
  const shareBtn = document.getElementById("share-btn");
  const captureBtn = document.getElementById("capture-btn");
  const modeSelect = document.getElementById("mode");
  const contextInput = document.getElementById("context");
  const autoAnalyze = document.getElementById("auto-analyze");
  const autoInterval = document.getElementById("auto-interval");
  const statusPill = document.getElementById("status-pill");
  const shareState = document.getElementById("share-state");
  const loading = document.getElementById("loading");
  const results = document.getElementById("results");
  const clearHistoryBtn = document.getElementById("clear-history");
  const browserWarning = document.getElementById("browser-warning");
  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const chatSendBtn = document.getElementById("chat-send");
  const chatLoading = document.getElementById("chat-loading");
  const chatIncludeScreen = document.getElementById("chat-include-screen");
  const clearChatBtn = document.getElementById("clear-chat");

  let mediaStream = null;
  let autoTimer = null;
  let analyzing = false;
  let chatting = false;
  let healthReady = false;
  let lastAnalysisContext = "";
  let chatHistory = [];

  function setStatus(kind, text) {
    statusPill.className = `status-pill status-${kind}`;
    statusPill.textContent = text;
    statusPill.title = text;
  }

  function showBrowserWarning(message) {
    browserWarning.textContent = message;
    browserWarning.classList.remove("hidden");
  }

  function hideBrowserWarning() {
    browserWarning.classList.add("hidden");
  }

  function appUrl() {
    return window.location.origin;
  }

  function screenCaptureSupport() {
    if (!window.isSecureContext) {
      return {
        ok: false,
        message: `Screen capture requires a secure context. Open ${appUrl()} in Chrome or Safari.`,
      };
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      return {
        ok: false,
        message: `This browser cannot share the screen. Open ${appUrl()} in Chrome or Safari — Cursor’s built-in browser does not support screen capture.`,
      };
    }

    return { ok: true };
  }

  function shareErrorMessage(err) {
    if (err.name === "NotAllowedError") {
      return "Share denied — click Allow when the browser asks to share your screen.";
    }
    if (err.name === "AbortError") {
      return "Share cancelled.";
    }
    if (err.name === "NotFoundError") {
      return "No screen or window was selected.";
    }
    if (err.name === "NotSupportedError") {
      return `Screen share is not supported here. Open ${appUrl()} in Chrome or Safari.`;
    }

    const detail = err.message ? ` (${err.message})` : "";
    return `Share failed${detail}. Try Chrome or Safari at ${appUrl()}.`;
  }

  function checkScreenCapture() {
    const support = screenCaptureSupport();
    if (!support.ok) {
      showBrowserWarning(support.message);
      shareBtn.disabled = true;
      return false;
    }

    hideBrowserWarning();
    shareBtn.disabled = false;
    return true;
  }

  async function checkHealth() {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      if (data.configured) {
        const label = data.provider === "anthropic" ? "Claude" : "OpenAI";
        healthReady = true;
        setStatus("ready", `Ready · ${label} · ${data.model}`);
        checkScreenCapture();
        return;
      }

      healthReady = false;

      setStatus(
        "error",
        data.message ||
          "Add ANTHROPIC_API_KEY to .env (see .env.example), then restart"
      );
    } catch {
      setStatus("error", "Backend unreachable");
    }
  }

  function stopShare() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    preview.srcObject = null;
    captureBtn.disabled = true;
    shareBtn.textContent = "Start screen share";
    shareState.textContent = "Not sharing";
    previewEmpty.style.display = "flex";
    stopAutoAnalyze();
  }

  async function startShare() {
    if (mediaStream) {
      stopShare();
      return;
    }

    if (!checkScreenCapture()) {
      setStatus("error", "Use Chrome or Safari for screen share");
      return;
    }

    try {
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: false,
      });
      preview.srcObject = mediaStream;
      previewEmpty.style.display = "none";
      captureBtn.disabled = false;
      shareBtn.textContent = "Stop screen share";
      shareState.textContent = "Sharing active";
      hideBrowserWarning();

      if (healthReady) {
        const res = await fetch("/api/health");
        const data = await res.json();
        if (data.configured) {
          const label = data.provider === "anthropic" ? "Claude" : "OpenAI";
          setStatus("ready", `Sharing · ${label} · ${data.model}`);
        }
      }

      mediaStream.getVideoTracks()[0].addEventListener("ended", stopShare);
    } catch (err) {
      const message = shareErrorMessage(err);
      showBrowserWarning(message);
      setStatus("error", message.length > 72 ? "Share failed — see banner below" : message);
    }
  }

  function captureFrameBase64() {
    const track = mediaStream?.getVideoTracks()[0];
    if (!track) {
      return null;
    }

    const settings = track.getSettings();
    const width = settings.width || preview.videoWidth || 1280;
    const height = settings.height || preview.videoHeight || 720;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(preview, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/png");
    return dataUrl.split(",")[1];
  }

  function copyText(text, button) {
    navigator.clipboard.writeText(text).then(() => {
      const original = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = original;
      }, 1200);
    });
  }

  function section(title, contentNode) {
    const wrap = document.createElement("div");
    wrap.className = "result-section";
    const h3 = document.createElement("h3");
    h3.textContent = title;
    wrap.appendChild(h3);
    wrap.appendChild(contentNode);
    return wrap;
  }

  function paragraph(text) {
    const p = document.createElement("p");
    p.textContent = text;
    return p;
  }

  function bulletList(items) {
    const ul = document.createElement("ul");
    (items || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    });
    return ul;
  }

  function numberedList(items) {
    const ol = document.createElement("ol");
    (items || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      ol.appendChild(li);
    });
    return ol;
  }

  function apiTable(apis) {
    const table = document.createElement("table");
    table.className = "api-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Method</th>
          <th>Path</th>
          <th>Description</th>
          <th>Request</th>
          <th>Response</th>
        </tr>
      </thead>
    `;
    const tbody = document.createElement("tbody");
    (apis || []).forEach((api) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${api.method || "—"}</td>
        <td><code>${api.path || "—"}</code></td>
        <td>${api.description || "—"}</td>
        <td>${api.request || "—"}</td>
        <td>${api.response || "—"}</td>
      `;
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    return table;
  }

  function dataTable(headers, rows) {
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headers.forEach((header) => {
      const th = document.createElement("th");
      th.textContent = header;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function envelopeList(items) {
    const wrap = document.createElement("div");
    (items || []).forEach((item) => {
      const block = document.createElement("div");
      block.className = "envelope-item";
      block.innerHTML = `
        <div><strong>${item.metric || "Estimate"}</strong></div>
        <div>${item.calculation || ""}</div>
        <div class="envelope-result">${item.result || ""}</div>
      `;
      wrap.appendChild(block);
    });
    return wrap;
  }

  function tradeoffList(items) {
    const wrap = document.createElement("div");
    (items || []).forEach((item) => {
      const block = document.createElement("div");
      block.className = "tradeoff-item";
      block.innerHTML = `
        <div><strong>${item.topic || "Tradeoff"}</strong></div>
        <div><strong>Bottleneck:</strong> ${item.bottleneck || "—"}</div>
        <div><strong>Tradeoff:</strong> ${item.tradeoff || "—"}</div>
        <div><strong>Mitigation:</strong> ${item.mitigation || "—"}</div>
      `;
      wrap.appendChild(block);
    });
    return wrap;
  }

  function mermaidDiagram(source) {
    const wrap = document.createElement("div");
    wrap.className = "mermaid-wrap";
    const diagram = document.createElement("div");
    diagram.className = "mermaid";
    diagram.textContent = source || "flowchart LR\n  A[No diagram]";
    wrap.appendChild(diagram);

    if (window.mermaid) {
      window.mermaid.run({ nodes: [diagram] }).catch(() => {
        wrap.appendChild(paragraph("Could not render diagram. See raw Mermaid below."));
        wrap.appendChild(codeBlock(source || "", "Copy Mermaid", "plaintext"));
      });
    }

    return wrap;
  }

  function renderSystemDesignResult(block, data) {
    if (data.title) block.appendChild(section("System", paragraph(data.title)));
    if (data.problem_summary) {
      block.appendChild(section("Problem summary", paragraph(data.problem_summary)));
    }
    if (data.clarifying_questions?.length) {
      block.appendChild(
        section("Clarifying questions", numberedList(data.clarifying_questions))
      );
    }
    if (data.assumptions?.length) {
      block.appendChild(section("Assumptions", bulletList(data.assumptions)));
    }
    if (data.back_of_envelope?.length) {
      block.appendChild(
        section("Back-of-envelope calculations", envelopeList(data.back_of_envelope))
      );
    }
    if (data.apis?.length) {
      block.appendChild(section("API design", apiTable(data.apis)));
    }
    if (data.architecture_diagram_mermaid) {
      block.appendChild(
        section(
          "Architecture diagram",
          mermaidDiagram(data.architecture_diagram_mermaid)
        )
      );
    }
    if (data.architecture_components?.length) {
      block.appendChild(
        section(
          "Components",
          dataTable(
            ["Component", "Role", "Technology"],
            data.architecture_components.map((item) => [
              item.name || "—",
              item.role || "—",
              item.tech || "—",
            ])
          )
        )
      );
    }

    const lld = data.low_level_design || {};
    if (lld.database_tables?.length) {
      const tableWrap = document.createElement("div");
      lld.database_tables.forEach((table) => {
        const heading = document.createElement("p");
        heading.innerHTML = `<strong>${table.name || "Table"}</strong>${table.notes ? ` — ${table.notes}` : ""}`;
        tableWrap.appendChild(heading);
        tableWrap.appendChild(bulletList(table.columns || []));
      });
      block.appendChild(section("Database tables", tableWrap));
    }
    if (lld.data_calculations?.length) {
      block.appendChild(
        section(
          "Data calculations",
          dataTable(
            ["Metric", "Formula", "Estimate"],
            lld.data_calculations.map((item) => [
              item.label || "—",
              item.formula || "—",
              item.estimate || "—",
            ])
          )
        )
      );
    }
    if (lld.bandwidth_storage?.length) {
      block.appendChild(
        section(
          "Bandwidth & storage",
          dataTable(
            ["Resource", "Estimate"],
            lld.bandwidth_storage.map((item) => [
              item.label || "—",
              item.estimate || "—",
            ])
          )
        )
      );
    }
    if (data.bottlenecks_and_tradeoffs?.length) {
      block.appendChild(
        section("Bottlenecks & tradeoffs", tradeoffList(data.bottlenecks_and_tradeoffs))
      );
    }
  }

  function normalizeLanguage(language) {
    const value = (language || "python").toLowerCase().trim();
    const map = {
      python: "python",
      py: "python",
      javascript: "javascript",
      js: "javascript",
      typescript: "javascript",
      ts: "javascript",
      java: "java",
      cpp: "cpp",
      "c++": "cpp",
      c: "cpp",
      csharp: "cpp",
      "c#": "cpp",
      go: "go",
      golang: "go",
      rust: "rust",
      rs: "rust",
      ruby: "python",
      swift: "cpp",
      kotlin: "java",
    };
    return map[value] || "python";
  }

  function highlightCodeElement(codeEl, language) {
    if (window.hljs) {
      codeEl.className = `language-${normalizeLanguage(language)}`;
      window.hljs.highlightElement(codeEl);
    }
  }

  function appendFormattedText(parent, text) {
    const parts = text.split(/(```[\s\S]*?```)/g);
    parts.forEach((part) => {
      if (part.startsWith("```")) {
        const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
        if (!match) return;
        const pre = document.createElement("pre");
        const codeEl = document.createElement("code");
        codeEl.textContent = match[2].trim();
        pre.appendChild(codeEl);
        parent.appendChild(pre);
        highlightCodeElement(codeEl, match[1]);
        return;
      }

      if (part.trim()) {
        const block = document.createElement("div");
        block.textContent = part.trim();
        parent.appendChild(block);
      }
    });
  }

  function codeBlock(code, label = "Copy", language = "python") {
    const wrap = document.createElement("div");
    wrap.className = "code-block";
    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    codeEl.textContent = code;
    pre.appendChild(codeEl);
    highlightCodeElement(codeEl, language);
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary copy-btn";
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => copyText(code, btn));
    wrap.appendChild(pre);
    wrap.appendChild(btn);
    return wrap;
  }

  function promptBlock(text) {
    const wrap = document.createElement("div");
    wrap.className = "code-block";
    const box = document.createElement("div");
    box.className = "prompt-box";
    box.textContent = text;
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary copy-btn";
    btn.type = "button";
    btn.textContent = "Copy prompt";
    btn.addEventListener("click", () => copyText(text, btn));
    wrap.appendChild(box);
    wrap.appendChild(btn);
    return wrap;
  }

  function renderResult(data) {
    const block = document.createElement("article");
    block.className = "result-block";

    const meta = document.createElement("div");
    meta.className = "result-meta";
    const time = document.createElement("span");
    time.textContent = new Date().toLocaleTimeString();
    const confidence = document.createElement("span");
    const level = (data.confidence || "medium").toLowerCase();
    confidence.className = `confidence confidence-${level}`;
    confidence.textContent = `Confidence: ${level}`;
    meta.appendChild(time);
    meta.appendChild(confidence);
    block.appendChild(meta);

    if (data.error) {
      block.appendChild(section("Error", paragraph(data.error)));
      if (data.raw_response) {
        block.appendChild(section("Raw response", codeBlock(data.raw_response)));
      }
      return block;
    }

    if (data.mode === "system_design" || data.clarifying_questions || data.architecture_diagram_mermaid) {
      renderSystemDesignResult(block, data);
    } else if (data.mode === "coding" || data.title || data.solution_code) {
      if (data.title) block.appendChild(section("Problem", paragraph(data.title)));
      if (data.summary) block.appendChild(section("Summary", paragraph(data.summary)));
      if (data.constraints?.length) {
        block.appendChild(section("Constraints", bulletList(data.constraints)));
      }
      if (data.examples?.length) {
        const list = document.createElement("ul");
        data.examples.forEach((ex) => {
          const li = document.createElement("li");
          li.textContent = `Input: ${ex.input} → Output: ${ex.output}${
            ex.explanation ? ` (${ex.explanation})` : ""
          }`;
          list.appendChild(li);
        });
        block.appendChild(section("Examples", list));
      }
      if (data.approach) block.appendChild(section("Approach", paragraph(data.approach)));
      if (data.solution_code) {
        block.appendChild(
          section(
            `Solution${data.language ? ` (${data.language})` : ""}`,
            codeBlock(data.solution_code, "Copy code", data.language || "python")
          )
        );
      }
      if (data.time_complexity || data.space_complexity) {
        block.appendChild(
          section(
            "Complexity",
            paragraph(
              `Time: ${data.time_complexity || "—"} · Space: ${data.space_complexity || "—"}`
            )
          )
        );
      }
      if (data.edge_cases?.length) {
        block.appendChild(section("Edge cases", bulletList(data.edge_cases)));
      }
    } else if (data.recommended_prompt || data.task_summary) {
      if (data.task_summary) {
        block.appendChild(section("Task", paragraph(data.task_summary)));
      }
      if (data.assessment_type) {
        block.appendChild(section("Type", paragraph(data.assessment_type)));
      }
      if (data.recommended_prompt) {
        block.appendChild(
          section("Recommended prompt", promptBlock(data.recommended_prompt))
        );
      }
      if (data.follow_up_prompts?.length) {
        block.appendChild(section("Follow-up prompts", bulletList(data.follow_up_prompts)));
      }
      if (data.why_this_works) {
        block.appendChild(section("Why this works", paragraph(data.why_this_works)));
      }
      if (data.pitfalls?.length) {
        block.appendChild(section("Pitfalls", bulletList(data.pitfalls)));
      }
      if (data.evaluation_criteria?.length) {
        block.appendChild(
          section("Likely grading criteria", bulletList(data.evaluation_criteria))
        );
      }
    } else {
      if (data.question_detected) {
        block.appendChild(section("Question", paragraph(data.question_detected)));
      }
      if (data.answer) block.appendChild(section("Answer", paragraph(data.answer)));
      if (data.key_points?.length) {
        block.appendChild(section("Key points", bulletList(data.key_points)));
      }
      if (data.suggested_actions?.length) {
        block.appendChild(section("Next steps", bulletList(data.suggested_actions)));
      }
    }

    return block;
  }

  function buildAnalysisContext(data) {
    try {
      return JSON.stringify(data, null, 2).slice(0, 6000);
    } catch {
      return "";
    }
  }

  function renderChatBubble(role, content) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble chat-bubble-${role}`;
    if (role === "assistant") {
      appendFormattedText(bubble, content);
    } else {
      bubble.textContent = content;
    }
    return bubble;
  }

  function refreshChatView() {
    chatMessages.innerHTML = "";
    if (!chatHistory.length) {
      chatMessages.innerHTML =
        '<p class="muted placeholder">Ask follow-ups — explain the approach, optimize code, or clarify the task.</p>';
      return;
    }

    chatHistory.forEach((message) => {
      chatMessages.appendChild(renderChatBubble(message.role, message.content));
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text || chatting) return;

    chatHistory.push({ role: "user", content: text });
    chatInput.value = "";
    refreshChatView();

    chatting = true;
    chatSendBtn.disabled = true;
    chatLoading.classList.remove("hidden");

    const includeScreen = chatIncludeScreen.checked;
    const image = includeScreen ? captureFrameBase64() : null;
    if (includeScreen && !image) {
      chatHistory.pop();
      refreshChatView();
      chatting = false;
      chatSendBtn.disabled = false;
      chatLoading.classList.add("hidden");
      setStatus("error", "Start screen share to include a frame in chat");
      return;
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory.slice(-20),
          include_screen: includeScreen,
          image: image || "",
          analysis_context: lastAnalysisContext,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Chat failed");
      }

      chatHistory.push({ role: "assistant", content: data.reply });
      refreshChatView();
    } catch (err) {
      chatHistory.push({
        role: "assistant",
        content: `Error: ${err.message}`,
      });
      refreshChatView();
      setStatus("error", "Chat failed");
    } finally {
      chatting = false;
      chatSendBtn.disabled = false;
      chatLoading.classList.add("hidden");
    }
  }

  async function analyzeFrame() {
    if (analyzing) return;

    const image = captureFrameBase64();
    if (!image) {
      setStatus("error", "Start screen share first");
      return;
    }

    analyzing = true;
    loading.classList.remove("hidden");
    captureBtn.disabled = true;

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          mode: modeSelect.value,
          context: contextInput.value,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Analysis failed");
      }

      if (results.querySelector(".placeholder")) {
        results.innerHTML = "";
      }

      results.prepend(renderResult(data));
      lastAnalysisContext = buildAnalysisContext(data);
      setStatus("ready", "Analysis complete");
    } catch (err) {
      const errBlock = renderResult({ error: err.message, confidence: "low" });
      if (results.querySelector(".placeholder")) {
        results.innerHTML = "";
      }
      results.prepend(errBlock);
      setStatus("error", "Analysis failed");
    } finally {
      analyzing = false;
      loading.classList.add("hidden");
      captureBtn.disabled = !mediaStream;
    }
  }

  function stopAutoAnalyze() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    autoInterval.disabled = !autoAnalyze.checked;
  }

  function startAutoAnalyze() {
    stopAutoAnalyze();
    if (!autoAnalyze.checked || !mediaStream) return;

    autoInterval.disabled = false;
    const seconds = Number(autoInterval.value) || 30;
    autoTimer = setInterval(analyzeFrame, seconds * 1000);
  }

  shareBtn.addEventListener("click", startShare);
  captureBtn.addEventListener("click", analyzeFrame);
  clearHistoryBtn.addEventListener("click", () => {
    results.innerHTML =
      '<p class="muted placeholder">Capture a frame to see structured answers here — code solutions, recommended prompts, or direct Q&amp;A.</p>';
    lastAnalysisContext = "";
  });

  clearChatBtn.addEventListener("click", () => {
    chatHistory = [];
    refreshChatView();
  });

  chatSendBtn.addEventListener("click", sendChatMessage);
  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendChatMessage();
    }
  });

  autoAnalyze.addEventListener("change", () => {
    if (autoAnalyze.checked) {
      startAutoAnalyze();
    } else {
      stopAutoAnalyze();
    }
  });

  autoInterval.addEventListener("change", startAutoAnalyze);

  window.addEventListener("beforeunload", stopShare);

  const CONTEXT_PLACEHOLDERS = {
    coding: "e.g. Use Python, time limit 30 min, focus on O(n) solution",
    system_design:
      "e.g. 100M DAU, read-heavy, must be multi-region, strong consistency required",
    ai_assessment: "e.g. Multi-turn prompt task, evaluator cares about specificity",
    general: "e.g. Focus on the question in the top-left panel",
  };

  function updateContextPlaceholder() {
    contextInput.placeholder =
      CONTEXT_PLACEHOLDERS[modeSelect.value] || CONTEXT_PLACEHOLDERS.general;
  }

  modeSelect.addEventListener("change", updateContextPlaceholder);

  if (window.mermaid) {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "strict",
    });
  }

  updateContextPlaceholder();
  checkScreenCapture();
  checkHealth();
})();

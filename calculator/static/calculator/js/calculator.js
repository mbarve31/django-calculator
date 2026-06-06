(function () {
  const expressionEl = document.getElementById("expression");
  const resultEl = document.getElementById("result");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const csrfToken = document.querySelector("[name=csrfmiddlewaretoken]").value;

  let expression = "";
  let lastResult = "0";

  function updateDisplay() {
    expressionEl.textContent = expression || "\u00a0";
    resultEl.textContent = lastResult;
    resultEl.classList.remove("error");
  }

  function setError(message) {
    resultEl.textContent = message;
    resultEl.classList.add("error");
  }

  function setStatus(state, text) {
    statusDot.className = "status-dot" + (state === "loading" ? " loading" : "");
    statusText.textContent = text;
  }

  function appendValue(value) {
    if (lastResult !== "0" && !expression && /^[\d.]/.test(value)) {
      expression = value;
    } else {
      expression += value;
    }
    updateDisplay();
  }

  function clearAll() {
    expression = "";
    lastResult = "0";
    updateDisplay();
  }

  function backspace() {
    expression = expression.slice(0, -1);
    updateDisplay();
  }

  async function calculate() {
    if (!expression.trim()) {
      return;
    }

    setStatus("loading", "Calculating via Django…");

    try {
      const response = await fetch("/api/calculate/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({ expression }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Calculation failed.");
        setStatus("ready", "Ready");
        return;
      }

      lastResult = data.result;
      expression = "";
      updateDisplay();
      setStatus("ready", "Verified by Django backend");
    } catch (error) {
      setError("Network error.");
      setStatus("ready", "Ready");
    }
  }

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      const value = button.dataset.value;

      if (action === "append") {
        appendValue(value);
      } else if (action === "clear") {
        clearAll();
      } else if (action === "backspace") {
        backspace();
      } else if (action === "equals") {
        calculate();
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    const key = event.key;

    if (/[\d.]/.test(key)) {
      appendValue(key);
      event.preventDefault();
    } else if (["+", "-", "*", "/", "%", "(", ")"].includes(key)) {
      appendValue(key);
      event.preventDefault();
    } else if (key === "Enter" || key === "=") {
      calculate();
      event.preventDefault();
    } else if (key === "Escape") {
      clearAll();
      event.preventDefault();
    } else if (key === "Backspace") {
      backspace();
      event.preventDefault();
    }
  });

  updateDisplay();
  setStatus("ready", "Ready");
})();

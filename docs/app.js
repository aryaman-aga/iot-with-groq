(() => {
  const setupPanel = document.getElementById("setupPanel");
  const quizPanel = document.getElementById("quizPanel");
  const resultPanel = document.getElementById("resultPanel");
  const heroMetrics = document.getElementById("heroMetrics");

  const sourceGrid = document.getElementById("sourceGrid");
  const totalQuestionsMetric = document.getElementById("totalQuestionsMetric");
  const questionSetsMetric = document.getElementById("questionSetsMetric");

  const startQuizBtn = document.getElementById("startQuizBtn");
  const shuffleToggle = document.getElementById("shuffleToggle");
  const setupError = document.getElementById("setupError");

  const progressPill = document.getElementById("progressPill");
  const scoreValue = document.getElementById("scoreValue");
  const weekTag = document.getElementById("weekTag");
  const sourceBadge = document.getElementById("sourceBadge");
  const questionText = document.getElementById("questionText");
  const optionsContainer = document.getElementById("optionsContainer");
  const feedbackBanner = document.getElementById("feedbackBanner");

  const prevQuestionBtn = document.getElementById("prevQuestionBtn");
  const nextQuestionBtn = document.getElementById("nextQuestionBtn");
  const backToSetupBtn = document.getElementById("backToSetupBtn");
  const themeToggleBtn = document.getElementById("themeToggleBtn");

  const finalScoreText = document.getElementById("finalScoreText");
  const sourceBreakdown = document.getElementById("sourceBreakdown");
  const restartBtn = document.getElementById("restartBtn");

  const state = {
    sources: [],
    questions: [],
    quizActive: false,
    selectedQuestions: [],
    answerLog: [],
    currentQuestionIndex: 0,
    activeQuestionIndex: 0,
    score: 0,
    finalSummary: null,
    locked: false,
  };

  function getCurrentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function updateThemeToggleUi(theme) {
    if (!themeToggleBtn) {
      return;
    }

    const isDark = theme === "dark";
    themeToggleBtn.textContent = isDark ? "Switch to Light" : "Switch to Dark";
    themeToggleBtn.setAttribute("aria-pressed", isDark ? "true" : "false");
  }

  function applyTheme(theme) {
    const resolvedTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    try {
      window.localStorage.setItem("iiot-theme", resolvedTheme);
    } catch (_) {
      // Ignore storage failures in private browsing modes.
    }
    updateThemeToggleUi(resolvedTheme);
  }

  function toggleTheme() {
    const nextTheme = getCurrentTheme() === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  }

  function setQuizModeUi(isQuizActive) {
    if (!heroMetrics) {
      return;
    }
    heroMetrics.classList.toggle("hidden", isQuizActive);
  }

  function setSetupError(message) {
    if (!setupError) {
      return;
    }
    setupError.textContent = message;
  }

  function clearFeedback() {
    if (!feedbackBanner) {
      return;
    }
    feedbackBanner.classList.add("hidden");
    feedbackBanner.classList.remove("ok", "bad");
    feedbackBanner.textContent = "";
  }

  function showFeedback(message, status) {
    if (!feedbackBanner) {
      return;
    }
    feedbackBanner.textContent = message;
    feedbackBanner.classList.remove("hidden", "ok", "bad");
    feedbackBanner.classList.add(status === "ok" ? "ok" : "bad");
  }

  function shuffleArray(items) {
    const clone = [...items];
    for (let i = clone.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [clone[i], clone[j]] = [clone[j], clone[i]];
    }
    return clone;
  }

  function getSelectedSources() {
    return Array.from(document.querySelectorAll(".source-checkbox:checked")).map(
      (checkbox) => checkbox.value,
    );
  }

  function resolveWeekLabel(week) {
    if (Number.isInteger(week)) {
      return `Week ${week}`;
    }

    const trimmed = String(week || "").trim();
    if (!trimmed) {
      return "Week Unknown";
    }

    return /^week\s+/i.test(trimmed) ? trimmed : `Week ${trimmed}`;
  }

  function buildSourceGrid(sources) {
    if (!sourceGrid) {
      return;
    }

    sourceGrid.innerHTML = "";
    sources.forEach((source) => {
      const tile = document.createElement("label");
      tile.className = "source-tile";
      tile.innerHTML = `
        <input type="checkbox" class="source-checkbox" value="${source.source_id}" checked />
        <span class="tile-heading">${source.label}</span>
        <span class="tile-sub">${source.question_count} questions</span>
      `;
      sourceGrid.appendChild(tile);
    });

    if (totalQuestionsMetric) {
      totalQuestionsMetric.textContent = String(state.questions.length);
    }
    if (questionSetsMetric) {
      questionSetsMetric.textContent = String(sources.length);
    }
  }

  function getQuestionAt(index) {
    return state.selectedQuestions[index] || null;
  }

  function markAnsweredOptions(selectedOption, correctOption) {
    const optionButtons = optionsContainer.querySelectorAll(".option-btn");
    optionButtons.forEach((button) => {
      const option = button.dataset.option;
      button.disabled = true;
      if (option === selectedOption && option === correctOption) {
        button.classList.add("correct");
      } else if (option === selectedOption && option !== correctOption) {
        button.classList.add("wrong");
      } else if (option === correctOption) {
        button.classList.add("correct");
      }
    });
  }

  function renderAnsweredState(answerEntry) {
    markAnsweredOptions(answerEntry.selectedOption, answerEntry.correctOption);

    if (answerEntry.isCorrect) {
      showFeedback("Correct answer. Great work.", "ok");
    } else {
      showFeedback(
        `Wrong answer. Correct option: ${answerEntry.correctOption.toUpperCase()} - ${answerEntry.correctOptionText}`,
        "bad",
      );
    }

    state.locked = true;
  }

  function updateQuestionNavButtons() {
    if (!state.quizActive || !prevQuestionBtn || !nextQuestionBtn) {
      return;
    }

    if (nextQuestionBtn.dataset.mode === "finish") {
      prevQuestionBtn.disabled = true;
      nextQuestionBtn.disabled = false;
      nextQuestionBtn.classList.remove("hidden");
      return;
    }

    prevQuestionBtn.disabled = state.currentQuestionIndex <= 0;

    const canMoveNext = state.currentQuestionIndex < state.activeQuestionIndex;
    nextQuestionBtn.dataset.mode = "navigate";
    nextQuestionBtn.textContent = "Next Question";
    nextQuestionBtn.classList.remove("hidden");
    nextQuestionBtn.disabled = !canMoveNext;
  }

  function renderQuestion(index) {
    const question = getQuestionAt(index);
    if (!question) {
      return;
    }

    state.currentQuestionIndex = index;

    progressPill.textContent = `Question ${index + 1} / ${state.selectedQuestions.length}`;
    scoreValue.textContent = String(state.score);
    weekTag.textContent = resolveWeekLabel(question.week);
    sourceBadge.textContent = `${question.source_label} | Question ${question.question_number}`;
    questionText.textContent = question.question;

    optionsContainer.innerHTML = "";
    const optionKeys = Object.keys(question.options);
    optionKeys.forEach((key) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-btn";
      button.dataset.option = key;
      button.innerHTML = `<span class="option-key">${key.toUpperCase()}</span><span>${question.options[key]}</span>`;
      optionsContainer.appendChild(button);
    });

    clearFeedback();
    state.locked = false;

    const answerEntry = state.answerLog[index];
    if (answerEntry) {
      renderAnsweredState(answerEntry);
    } else {
      const shouldDisable = index !== state.activeQuestionIndex;
      if (shouldDisable) {
        optionsContainer.querySelectorAll(".option-btn").forEach((button) => {
          button.disabled = true;
        });
        state.locked = true;
      }
    }

    nextQuestionBtn.dataset.mode = "navigate";
    updateQuestionNavButtons();
  }

  function buildSummary() {
    const total = state.selectedQuestions.length;
    const percent = total ? Number(((state.score / total) * 100).toFixed(2)) : 0;

    const breakdownMap = new Map();

    state.selectedQuestions.forEach((question, index) => {
      const entry = state.answerLog[index];
      if (!entry) {
        return;
      }

      const existing = breakdownMap.get(question.source_id) || {
        source_label: question.source_label,
        correct: 0,
        total: 0,
      };

      existing.total += 1;
      if (entry.isCorrect) {
        existing.correct += 1;
      }

      breakdownMap.set(question.source_id, existing);
    });

    const sourceBreakdownData = [...breakdownMap.values()].sort((a, b) =>
      a.source_label.localeCompare(b.source_label),
    );

    return {
      score: state.score,
      total,
      percent,
      sourceBreakdownData,
    };
  }

  function renderFinalSummary() {
    if (!state.finalSummary) {
      return;
    }

    const { score, total, percent, sourceBreakdownData } = state.finalSummary;
    finalScoreText.textContent = `You scored ${score} out of ${total} (${percent}%).`;

    sourceBreakdown.innerHTML = "";
    sourceBreakdownData.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "breakdown-card";
      card.innerHTML = `
        <h3>${entry.source_label}</h3>
        <p>${entry.correct} / ${entry.total} correct</p>
      `;
      sourceBreakdown.appendChild(card);
    });
  }

  function moveToNextStep() {
    const mode = nextQuestionBtn.dataset.mode;
    if (mode === "finish") {
      quizPanel.classList.add("hidden");
      resultPanel.classList.remove("hidden");
      setQuizModeUi(false);
      renderFinalSummary();
      return;
    }

    if (mode === "navigate" && state.currentQuestionIndex < state.activeQuestionIndex) {
      renderQuestion(state.currentQuestionIndex + 1);
    }
  }

  function moveToPreviousQuestion() {
    if (state.currentQuestionIndex <= 0) {
      return;
    }
    renderQuestion(state.currentQuestionIndex - 1);
  }

  function resetToSetup() {
    state.quizActive = false;
    state.selectedQuestions = [];
    state.answerLog = [];
    state.currentQuestionIndex = 0;
    state.activeQuestionIndex = 0;
    state.score = 0;
    state.finalSummary = null;
    state.locked = false;

    clearFeedback();
    resultPanel.classList.add("hidden");
    quizPanel.classList.add("hidden");
    setupPanel.classList.remove("hidden");
    setQuizModeUi(false);
    setSetupError("");

    nextQuestionBtn.dataset.mode = "";
    nextQuestionBtn.classList.add("hidden");
    nextQuestionBtn.disabled = false;
    prevQuestionBtn.disabled = true;
  }

  function goBackToSetup() {
    const hasLiveQuiz = !quizPanel.classList.contains("hidden") && state.quizActive;
    if (hasLiveQuiz) {
      const shouldLeave = window.confirm(
        "Go back to setup? Your current quiz progress will be lost.",
      );
      if (!shouldLeave) {
        return;
      }
    }

    resetToSetup();
  }

  async function startQuiz() {
    setSetupError("");

    if (!state.questions.length) {
      setSetupError("Question bank not loaded yet. Refresh and try again.");
      return;
    }

    const selectedSources = getSelectedSources();
    if (!selectedSources.length) {
      setSetupError("Pick at least one question set to start.");
      return;
    }

    startQuizBtn.disabled = true;

    const filteredQuestions = state.questions.filter((question) =>
      selectedSources.includes(question.source_id),
    );

    if (!filteredQuestions.length) {
      setSetupError("No questions available for selected sources.");
      startQuizBtn.disabled = false;
      return;
    }

    const questionSequence = shuffleToggle.checked ? shuffleArray(filteredQuestions) : filteredQuestions;

    state.quizActive = true;
    state.selectedQuestions = questionSequence;
    state.answerLog = new Array(questionSequence.length).fill(null);
    state.currentQuestionIndex = 0;
    state.activeQuestionIndex = 0;
    state.score = 0;
    state.finalSummary = null;
    state.locked = false;

    setupPanel.classList.add("hidden");
    resultPanel.classList.add("hidden");
    quizPanel.classList.remove("hidden");
    setQuizModeUi(true);

    renderQuestion(0);
    startQuizBtn.disabled = false;
  }

  function submitAnswer(selectedOption) {
    if (!state.quizActive) {
      return;
    }

    if (state.locked || state.currentQuestionIndex !== state.activeQuestionIndex) {
      return;
    }

    const question = getQuestionAt(state.activeQuestionIndex);
    if (!question) {
      return;
    }

    if (!(selectedOption in question.options)) {
      showFeedback("Please choose a valid option.", "bad");
      return;
    }

    const correctOption = question.answer;
    const isCorrect = selectedOption === correctOption;

    if (isCorrect) {
      state.score += 1;
    }

    const answerEntry = {
      isCorrect,
      selectedOption,
      correctOption,
      correctOptionText: question.options[correctOption],
    };

    state.answerLog[state.activeQuestionIndex] = answerEntry;
    renderAnsweredState(answerEntry);

    state.activeQuestionIndex += 1;
    scoreValue.textContent = String(state.score);

    if (state.activeQuestionIndex >= state.selectedQuestions.length) {
      state.finalSummary = buildSummary();
      nextQuestionBtn.textContent = "View Result";
      nextQuestionBtn.dataset.mode = "finish";
      nextQuestionBtn.disabled = false;
      nextQuestionBtn.classList.remove("hidden");
      prevQuestionBtn.disabled = true;
      return;
    }

    updateQuestionNavButtons();
  }

  async function loadQuestionBank() {
    try {
      const response = await fetch("./quiz_data/questions.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Unable to load questions (${response.status}).`);
      }

      const payload = await response.json();
      state.sources = Array.isArray(payload.sources) ? payload.sources : [];
      state.questions = Array.isArray(payload.questions) ? payload.questions : [];

      buildSourceGrid(state.sources);
      setSetupError("");
    } catch (error) {
      setSetupError(error.message || "Failed to load question bank.");
      startQuizBtn.disabled = true;
    }
  }

  optionsContainer.addEventListener("click", (event) => {
    const button = event.target.closest(".option-btn");
    if (!button) {
      return;
    }
    submitAnswer(button.dataset.option);
  });

  startQuizBtn.addEventListener("click", startQuiz);
  nextQuestionBtn.addEventListener("click", moveToNextStep);
  prevQuestionBtn.addEventListener("click", moveToPreviousQuestion);
  backToSetupBtn.addEventListener("click", goBackToSetup);
  restartBtn.addEventListener("click", resetToSetup);

  if (themeToggleBtn) {
    updateThemeToggleUi(getCurrentTheme());
    themeToggleBtn.addEventListener("click", toggleTheme);
  }

  loadQuestionBank();
})();

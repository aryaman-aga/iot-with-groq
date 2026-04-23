(() => {
  const setupPanel = document.getElementById("setupPanel");
  const quizPanel = document.getElementById("quizPanel");
  const resultPanel = document.getElementById("resultPanel");
  const heroMetrics = document.getElementById("heroMetrics");

  const startQuizBtn = document.getElementById("startQuizBtn");
  const shuffleToggle = document.getElementById("shuffleToggle");
  const shuffleOptionsToggle = document.getElementById("shuffleOptionsToggle");
  const setupError = document.getElementById("setupError");

  const progressPill = document.getElementById("progressPill");
  const scoreValue = document.getElementById("scoreValue");
  const weekTag = document.getElementById("weekTag");
  const sourceBadge = document.getElementById("sourceBadge");
  const githubPdfLink = document.getElementById("githubPdfLink");
  const questionText = document.getElementById("questionText");
  const optionsContainer = document.getElementById("optionsContainer");
  const feedbackBanner = document.getElementById("feedbackBanner");
  const explainContainer = document.getElementById("explainContainer");
  const explainBtn = document.getElementById("explainBtn");
  const prevQuestionBtn = document.getElementById("prevQuestionBtn");
  const nextQuestionBtn = document.getElementById("nextQuestionBtn");
  const backToSetupBtn = document.getElementById("backToSetupBtn");
  const themeToggleBtn = document.getElementById("themeToggleBtn");

  const finalScoreText = document.getElementById("finalScoreText");
  const sourceBreakdown = document.getElementById("sourceBreakdown");
  const restartBtn = document.getElementById("restartBtn");
  const groqSecretCode = document.getElementById("groqSecretCode");

  const state = {
    quizId: "",
    totalQuestions: 0,
    currentQuestionIndex: 0,
    activeQuestionIndex: 0,
    score: 0,
    currentQuestion: null,
    finalSummary: null,
    locked: false,
    secretCode: "",
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

  function getSelectedSources() {
    return Array.from(document.querySelectorAll(".source-checkbox:checked")).map(
      (checkbox) => checkbox.value,
    );
  }

  function setQuizModeUi(isQuizActive) {
    if (!heroMetrics) {
      return;
    }
    heroMetrics.classList.toggle("hidden", isQuizActive);
  }

  function setSetupError(message) {
    setupError.textContent = message;
  }

  function clearFeedback() {
    feedbackBanner.classList.add("hidden");
    feedbackBanner.classList.remove("ok", "bad");
    feedbackBanner.textContent = "";
    if (explainContainer) {
      explainContainer.classList.add("hidden");
    }
  }

  function showFeedback(message, status) {
    feedbackBanner.textContent = message;
    feedbackBanner.classList.remove("hidden", "ok", "bad");
    feedbackBanner.classList.add(status === "ok" ? "ok" : "bad");
  }

  function updateQuestionNavButtons() {
    if (!prevQuestionBtn || !nextQuestionBtn || !state.quizId) {
      return;
    }

    if (nextQuestionBtn.dataset.mode === "finish") {
      prevQuestionBtn.disabled = true;
      nextQuestionBtn.disabled = false;
      nextQuestionBtn.classList.remove("hidden");
      return;
    }

    prevQuestionBtn.disabled = state.currentQuestionIndex <= 1;

    const canMoveNext = state.currentQuestionIndex < state.activeQuestionIndex;
    nextQuestionBtn.dataset.mode = "navigate";
    nextQuestionBtn.textContent = "Next Question";
    nextQuestionBtn.classList.remove("hidden");
    nextQuestionBtn.disabled = !canMoveNext;
  }

  function renderQuestion(question, questionIndex) {
    state.currentQuestion = question;
    state.currentQuestionIndex = questionIndex;

    progressPill.textContent = `Question ${questionIndex} / ${state.totalQuestions}`;
    scoreValue.textContent = String(state.score);
    const resolvedWeek = Number.isInteger(question.week)
      ? `Week ${question.week}`
      : String(question.week || "").trim()
        ? `Week ${String(question.week).trim()}`
        : "Week Unknown";
    if (weekTag) {
      weekTag.textContent = resolvedWeek;
    }
    sourceBadge.textContent = `${question.source_label} | Question ${question.question_number}`;
    
    if (githubPdfLink) {
      if (question.source_file && question.page) {
        // Replace 'iot-with-groq' if your new repo name is different
        const githubRepo = "aryaman-aga/iot-with-groq";
        githubPdfLink.href = `https://github.com/${githubRepo}/blob/main/${encodeURIComponent(question.source_file)}#page=${question.page}`;
        githubPdfLink.textContent = `View Page ${question.page} on GitHub`;
        githubPdfLink.classList.remove("hidden");
      } else {
        githubPdfLink.classList.add("hidden");
      }
    }

    questionText.textContent = question.text;

    optionsContainer.innerHTML = "";
    question.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-btn";
      button.dataset.option = option.key;
      button.innerHTML = `<span class="option-key">${option.key.toUpperCase()}</span><span>${option.text}</span>`;
      optionsContainer.appendChild(button);
    });

    state.locked = false;
    nextQuestionBtn.dataset.mode = "navigate";
    clearFeedback();
    updateQuestionNavButtons();
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

    state.locked = true;
    updateQuestionNavButtons();
  }

  function renderAnsweredState(data) {
    markAnsweredOptions(data.selected_option, data.correct_option);

    if (data.correct) {
      showFeedback("Correct answer. Great work.", "ok");
      
      // If secret code is valid, show the "Explain this" option for correct answers
      if (state.secretCode === "arya21" && explainContainer) {
        explainContainer.classList.remove("hidden");
        explainBtn.dataset.questionId = state.currentQuestion ? state.currentQuestion.id : "";
        explainBtn.dataset.selectedOption = data.selected_option;
        explainBtn.disabled = false;
        explainBtn.textContent = "Explain with Groq";
      }
    } else {
      let message = `Wrong answer. Correct option: ${data.correct_option.toUpperCase()} - ${data.correct_option_text}`;
      showFeedback(message, "bad");
      
      // Fetch AI explanation automatically for wrong answers
      if (state.currentQuestion) {
        fetchExplanation(state.currentQuestion.id, data.selected_option);
      }
    }
  }

  async function fetchExplanation(questionId, selectedOption) {
    if (explainBtn) {
      explainBtn.disabled = true;
      explainBtn.textContent = "Fetching...";
    }

    try {
      const response = await fetch("/api/explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: questionId,
          selected_option: selectedOption,
          secret_code: state.secretCode,
        }),
      });

      const data = await response.json();
      if (response.ok && data.explanation) {
        // Append explanation to existing feedback
        feedbackBanner.textContent += `\n\n${data.explanation}`;
        if (explainContainer) {
          explainContainer.classList.add("hidden");
        }
      } else {
        if (explainBtn) {
          explainBtn.textContent = "No explanation available";
        }
      }
    } catch (error) {
      // Silently fail - explanation is optional
      console.log("Could not fetch explanation:", error.message);
      if (explainBtn) {
        explainBtn.textContent = "Error fetching explanation";
      }
    }
  }

  async function fetchQuestion(questionIndex) {
    if (!state.quizId) {
      return;
    }

    try {
      const response = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quiz_id: state.quizId,
          question_index: questionIndex,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not load question.");
      }

      state.totalQuestions = data.total_questions;
      state.score = data.score;
      state.activeQuestionIndex = data.active_question_index;
      renderQuestion(data.question, data.current_question_index);

      if (data.answered) {
        renderAnsweredState(data);
      }
    } catch (error) {
      showFeedback(error.message || "Could not load question.", "bad");
    }
  }

  async function startQuiz() {
    setSetupError("");

    const selectedSources = getSelectedSources();
    if (!selectedSources.length) {
      setSetupError("Pick at least one question set to start.");
      return;
    }

    startQuizBtn.disabled = true;

    try {
      const response = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: selectedSources,
          shuffle: shuffleToggle.checked,
          shuffle_options: shuffleOptionsToggle.checked,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not start quiz.");
      }

      state.quizId = data.quiz_id;
      state.totalQuestions = data.total_questions;
      state.score = data.score;
      state.activeQuestionIndex = data.active_question_index || 1;
      state.finalSummary = null;

      setupPanel.classList.add("hidden");
      resultPanel.classList.add("hidden");
      quizPanel.classList.remove("hidden");
      setQuizModeUi(true);

      renderQuestion(data.question, data.current_question_index);
    } catch (error) {
      setSetupError(error.message || "Could not start quiz.");
      startQuizBtn.disabled = false;
      return;
    }

    startQuizBtn.disabled = false;
  }

  async function submitAnswer(selectedOption) {
    if (!state.quizId || !state.currentQuestion) {
      return;
    }

    state.locked = true;

    try {
      const response = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quiz_id: state.quizId,
          question_id: state.currentQuestion.id,
          selected_option: selectedOption,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not submit answer.");
      }

      state.score = data.score;
      state.activeQuestionIndex = data.active_question_index || state.activeQuestionIndex;
      scoreValue.textContent = String(state.score);

      renderAnsweredState(data);

      if (data.finished) {
        state.finalSummary = data.summary;
        nextQuestionBtn.textContent = "View Result";
        nextQuestionBtn.dataset.mode = "finish";
        nextQuestionBtn.disabled = false;
        nextQuestionBtn.classList.remove("hidden");
        if (prevQuestionBtn) {
          prevQuestionBtn.disabled = true;
        }
        return;
      }

      updateQuestionNavButtons();
    } catch (error) {
      showFeedback(error.message || "Could not submit answer.", "bad");
      state.locked = false;
      return;
    }
  }

  function renderFinalSummary() {
    if (!state.finalSummary) {
      return;
    }

    const { score, total, percent, source_breakdown: sourceBreakdownData } = state.finalSummary;
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
      fetchQuestion(state.currentQuestionIndex + 1);
    }
  }

  function moveToPreviousQuestion() {
    if (state.currentQuestionIndex <= 1) {
      return;
    }
    fetchQuestion(state.currentQuestionIndex - 1);
  }

  function goBackToSetup() {
    const hasLiveQuiz = !quizPanel.classList.contains("hidden") && !!state.quizId;
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

  function resetToSetup() {
    state.quizId = "";
    state.totalQuestions = 0;
    state.currentQuestionIndex = 0;
    state.activeQuestionIndex = 0;
    state.score = 0;
    state.currentQuestion = null;
    state.finalSummary = null;
    state.locked = false;

    clearFeedback();
    resultPanel.classList.add("hidden");
    quizPanel.classList.add("hidden");
    setupPanel.classList.remove("hidden");
    setQuizModeUi(false);
    setSetupError("");
  }

  startQuizBtn.addEventListener("click", startQuiz);

  optionsContainer.addEventListener("click", (event) => {
    const button = event.target.closest(".option-btn");
    if (!button || state.locked) {
      return;
    }
    submitAnswer(button.dataset.option);
  });

  nextQuestionBtn.addEventListener("click", moveToNextStep);
  if (prevQuestionBtn) {
    prevQuestionBtn.addEventListener("click", moveToPreviousQuestion);
  }
  backToSetupBtn.addEventListener("click", goBackToSetup);
  restartBtn.addEventListener("click", resetToSetup);

  if (explainBtn) {
    explainBtn.addEventListener("click", () => {
      const qId = explainBtn.dataset.questionId;
      const opt = explainBtn.dataset.selectedOption;
      if (qId && opt) {
        fetchExplanation(qId, opt);
      }
    });
  }

  if (groqSecretCode) {
    groqSecretCode.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = groqSecretCode.value.trim();
        state.secretCode = val;
        
        if (val === "arya21") {
          // Success glow
          groqSecretCode.style.boxShadow = "0 0 10px 2px rgba(16, 185, 129, 0.6)";
          groqSecretCode.style.borderColor = "rgba(16, 185, 129, 0.8)";
          groqSecretCode.style.opacity = "0.8";
          groqSecretCode.style.transition = "all 0.3s ease";
        } else {
          // Subtle error reset
          groqSecretCode.style.boxShadow = "none";
          groqSecretCode.style.borderColor = "rgba(255, 255, 255, 0.2)";
          groqSecretCode.style.opacity = "0";
          setTimeout(() => groqSecretCode.style.opacity = "0.3", 500);
        }
      }
    });
  }

  if (themeToggleBtn) {
    updateThemeToggleUi(getCurrentTheme());
    themeToggleBtn.addEventListener("click", toggleTheme);
  }
})();

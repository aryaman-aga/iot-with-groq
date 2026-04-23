(() => {
  // DOM Elements
  const setupPanel = document.getElementById("setupPanel");
  const quizPanel = document.getElementById("quizPanel");
  const resultPanel = document.getElementById("resultPanel");
  const heroMetrics = document.getElementById("heroMetrics");
  const totalQuestionsCount = document.getElementById("totalQuestionsCount");
  const totalSetsCount = document.getElementById("totalSetsCount");
  const sourceGrid = document.getElementById("sourceGrid");

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
  const prevQuestionBtn = document.getElementById("prevQuestionBtn");
  const nextQuestionBtn = document.getElementById("nextQuestionBtn");
  const backToSetupBtn = document.getElementById("backToSetupBtn");
  const themeToggleBtn = document.getElementById("themeToggleBtn");

  const finalScoreText = document.getElementById("finalScoreText");
  const sourceBreakdown = document.getElementById("sourceBreakdown");
  const restartBtn = document.getElementById("restartBtn");
  const groqSecretCode = document.getElementById("groqSecretCode");

  const weekSelectionSection = document.getElementById("weekSelectionSection");
  const weekGrid = document.getElementById("weekGrid");
  const selectAllWeeksBtn = document.getElementById("selectAllWeeksBtn");
  const clearAllWeeksBtn = document.getElementById("clearAllWeeksBtn");

  // State
  const state = {
    allQuestions: [],
    questionLookup: {},
    sources: [],
    sourceWeeks: {},
    
    quizQuestionIds: [],
    currentQuestionIndex: 0, // 1-based
    activeQuestionIndex: 0, // max index reached
    score: 0,
    answerLog: [],
    locked: false,
    secretCode: "",
    shuffleOptions: false,
  };

  const STORAGE_KEY = "iiot-quiz-state-static";

  // Initialization
  async function init() {
    try {
      const response = await fetch("quiz_data/questions.json");
      const data = await response.json();
      
      state.allQuestions = data.questions;
      state.sources = data.sources;
      
      // Build lookups
      state.questionLookup = {};
      state.allQuestions.forEach(q => {
        state.questionLookup[q.id] = q;
      });

      // Build source weeks
      state.sourceWeeks = {};
      state.allQuestions.forEach(q => {
        if (q.week) {
          if (!state.sourceWeeks[q.source_id]) {
            state.sourceWeeks[q.source_id] = new Set();
          }
          state.sourceWeeks[q.source_id].add(parseInt(q.week));
        }
      });
      // Convert sets to sorted lists
      for (const id in state.sourceWeeks) {
        state.sourceWeeks[id] = Array.from(state.sourceWeeks[id]).sort((a, b) => a - b);
      }

      renderSetupPanel();
      resumeSession();
    } catch (error) {
      console.error("Failed to load quiz data:", error);
      if (sourceGrid) {
        sourceGrid.innerHTML = `<div class="error">Failed to load quiz data. Please refresh.</div>`;
      }
    }
  }

  function renderSetupPanel() {
    if (totalQuestionsCount) totalQuestionsCount.textContent = state.allQuestions.length;
    if (totalSetsCount) totalSetsCount.textContent = state.sources.length;

    if (sourceGrid) {
      sourceGrid.innerHTML = state.sources.map(source => `
        <label class="source-tile">
          <input type="checkbox" class="source-checkbox" value="${source.source_id}" checked />
          <span class="tile-heading">${source.label}</span>
          <span class="tile-sub">${source.question_count} questions</span>
        </label>
      `).join("");

      // Add listeners to new checkboxes
      document.querySelectorAll(".source-checkbox").forEach(cb => {
        cb.addEventListener("change", updateWeekGrid);
      });
    }

    if (startQuizBtn) startQuizBtn.disabled = false;
    updateWeekGrid();
  }

  function updateWeekGrid() {
    const selectedSources = getSelectedSources();
    if (!selectedSources.length) {
      weekSelectionSection.classList.add("hidden");
      return;
    }

    const availableWeeks = new Set();
    selectedSources.forEach(sourceId => {
      const weeks = state.sourceWeeks[sourceId] || [];
      weeks.forEach(w => availableWeeks.add(w));
    });

    if (availableWeeks.size === 0) {
      weekSelectionSection.classList.add("hidden");
      return;
    }

    const sortedWeeks = Array.from(availableWeeks).sort((a, b) => a - b);
    weekGrid.innerHTML = sortedWeeks.map(week => `
      <label class="week-tile">
        <input type="checkbox" class="week-checkbox" value="${week}" checked />
        <span>Week ${week}</span>
      </label>
    `).join("");

    weekSelectionSection.classList.remove("hidden");
  }

  function getSelectedSources() {
    return Array.from(document.querySelectorAll(".source-checkbox:checked")).map(cb => cb.value);
  }

  function getSelectedWeeks() {
    return Array.from(document.querySelectorAll(".week-checkbox:checked")).map(cb => parseInt(cb.value));
  }

  // Quiz Logic
  function startQuiz() {
    const selectedSources = getSelectedSources();
    const selectedWeeks = getSelectedWeeks();
    
    if (!selectedSources.length) {
      setSetupError("Pick at least one question set to start.");
      return;
    }

    let filtered = state.allQuestions.filter(q => 
      selectedSources.includes(q.source_id) && 
      (selectedWeeks.length === 0 || selectedWeeks.includes(parseInt(q.week)))
    );

    if (filtered.length === 0) {
      setSetupError("No questions found for the selected filters.");
      return;
    }

    let questionIds = filtered.map(q => q.id);
    if (shuffleToggle.checked) {
      shuffleArray(questionIds);
    }

    state.quizQuestionIds = questionIds;
    state.currentQuestionIndex = 1;
    state.activeQuestionIndex = 1;
    state.score = 0;
    state.answerLog = [];
    state.shuffleOptions = shuffleOptionsToggle.checked;
    state.locked = false;

    setupPanel.classList.add("hidden");
    quizPanel.classList.remove("hidden");
    setQuizModeUi(true);
    
    renderQuestion(1);
    saveProgress();
  }

  function renderQuestion(index) {
    state.currentQuestionIndex = index;
    const questionId = state.quizQuestionIds[index - 1];
    const q = state.questionLookup[questionId];
    
    if (!q) return;

    // Update UI
    progressPill.textContent = `Question ${index} / ${state.quizQuestionIds.length}`;
    scoreValue.textContent = state.score;
    weekTag.textContent = q.week ? `Week ${q.week}` : "Week Unknown";
    sourceBadge.textContent = `${q.source_label} | Question ${q.question_number}`;
    
    if (githubPdfLink) {
      if (q.source_file && q.page) {
        const githubRepo = "aryaman-aga/iot-with-groq";
        githubPdfLink.href = `https://github.com/${githubRepo}/blob/main/${encodeURIComponent(q.source_file)}#page=${q.page}`;
        githubPdfLink.textContent = `View Page ${q.page} on GitHub`;
        githubPdfLink.classList.remove("hidden");
      } else {
        githubPdfLink.classList.add("hidden");
      }
    }

    questionText.textContent = q.question;

    // Options
    let options = Object.entries(q.options).map(([key, text]) => ({ key, text }));
    if (state.shuffleOptions) {
      // Use a seed based on quizId and questionId to keep it consistent if revisited
      shuffleArray(options);
    }

    optionsContainer.innerHTML = options.map(opt => `
      <button type="button" class="option-btn" data-option="${opt.key}">
        <span class="option-key">${opt.key.toUpperCase()}</span>
        <span>${opt.text}</span>
      </button>
    `).join("");

    clearFeedback();
    state.locked = false;

    // Check if already answered
    const logged = state.answerLog.find(a => a.questionId === questionId);
    if (logged) {
      markAnswered(logged.selectedOption, q.answer, q.options[q.answer], logged.correct);
    }

    updateNavigationButtons();
  }

  function submitAnswer(selectedOption) {
    if (state.locked) return;
    
    const questionId = state.quizQuestionIds[state.currentQuestionIndex - 1];
    const q = state.questionLookup[questionId];
    const correctOption = q.answer;
    const isCorrect = selectedOption === correctOption;

    if (isCorrect) state.score++;
    
    state.answerLog.push({
      questionId,
      selectedOption,
      correct: isCorrect
    });

    state.activeQuestionIndex = Math.max(state.activeQuestionIndex, state.currentQuestionIndex + 1);
    
    markAnswered(selectedOption, correctOption, q.options[correctOption], isCorrect);
    
    if (isCorrect) {
      const capturedIndex = state.currentQuestionIndex;
      setTimeout(() => {
        if (state.currentQuestionIndex === capturedIndex && state.locked) {
          if (state.currentQuestionIndex < state.quizQuestionIds.length) {
            renderQuestion(state.currentQuestionIndex + 1);
          } else {
            showFinalSummary();
          }
        }
      }, 1000);
    }
    
    saveProgress();
  }

  function markAnswered(selectedOption, correctOption, correctText, isCorrect) {
    state.locked = true;
    const buttons = optionsContainer.querySelectorAll(".option-btn");
    buttons.forEach(btn => {
      btn.disabled = true;
      const opt = btn.dataset.option;
      if (opt === correctOption) btn.classList.add("correct");
      else if (opt === selectedOption) btn.classList.add("wrong");
    });

    if (isCorrect) {
      showFeedback("Correct answer. Great work.", "ok");
    } else {
      showFeedback(`Wrong answer. Correct option: ${correctOption.toUpperCase()} - ${correctText}`, "bad");
    }

    // Show explanation if secret code matches
    const q = state.questionLookup[state.quizQuestionIds[state.currentQuestionIndex - 1]];
    if (state.secretCode === "arya21" && q.explanation) {
      feedbackBanner.innerHTML += `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.1); font-weight: normal; font-size: 0.9em;">${q.explanation}</div>`;
    }

    updateNavigationButtons();
  }

  function updateNavigationButtons() {
    const isLast = state.currentQuestionIndex === state.quizQuestionIds.length;
    const isAnswered = state.answerLog.some(a => a.questionId === state.quizQuestionIds[state.currentQuestionIndex - 1]);

    prevQuestionBtn.disabled = state.currentQuestionIndex <= 1;
    
    if (isLast && isAnswered) {
      nextQuestionBtn.textContent = "View Result";
      nextQuestionBtn.classList.remove("hidden");
      nextQuestionBtn.disabled = false;
    } else if (state.currentQuestionIndex < state.activeQuestionIndex) {
      nextQuestionBtn.textContent = "Next Question";
      nextQuestionBtn.classList.remove("hidden");
      nextQuestionBtn.disabled = false;
    } else {
      nextQuestionBtn.classList.add("hidden");
    }
  }

  function showFinalSummary() {
    quizPanel.classList.add("hidden");
    resultPanel.classList.remove("hidden");
    setQuizModeUi(false);

    const total = state.quizQuestionIds.length;
    const percent = Math.round((state.score / total) * 100);
    finalScoreText.textContent = `You scored ${state.score} out of ${total} (${percent}%).`;

    // Breakdown
    const stats = {};
    state.answerLog.forEach(log => {
      const q = state.questionLookup[log.questionId];
      if (!stats[q.source_id]) stats[q.source_id] = { label: q.source_label, correct: 0, total: 0 };
      stats[q.source_id].total++;
      if (log.correct) stats[q.source_id].correct++;
    });

    sourceBreakdown.innerHTML = Object.values(stats).map(s => `
      <article class="breakdown-card">
        <h3>${s.label}</h3>
        <p>${s.correct} / ${s.total} correct</p>
      </article>
    `).join("");

    clearProgress();
  }

  // Helpers
  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  function setQuizModeUi(active) {
    if (heroMetrics) heroMetrics.classList.toggle("hidden", active);
  }

  function setSetupError(msg) {
    setupError.textContent = msg;
  }

  function clearFeedback() {
    feedbackBanner.classList.add("hidden");
    feedbackBanner.classList.remove("ok", "bad");
    feedbackBanner.innerHTML = "";
  }

  function showFeedback(msg, type) {
    feedbackBanner.textContent = msg;
    feedbackBanner.classList.remove("hidden", "ok", "bad");
    feedbackBanner.classList.add(type);
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      questionIds: state.quizQuestionIds,
      currentQuestionIndex: state.currentQuestionIndex,
      activeQuestionIndex: state.activeQuestionIndex,
      score: state.score,
      answerLog: state.answerLog,
      shuffleOptions: state.shuffleOptions,
      secretCode: state.secretCode
    }));
  }

  function resumeSession() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const data = JSON.parse(saved);
      Object.assign(state, data);
      
      if (state.quizQuestionIds.length > 0) {
        setupPanel.classList.add("hidden");
        quizPanel.classList.remove("hidden");
        setQuizModeUi(true);
        renderQuestion(state.currentQuestionIndex);
        
        // Sync secret code UI
        if (state.secretCode === "arya21" && groqSecretCode) {
          groqSecretCode.value = state.secretCode;
          groqSecretCode.style.boxShadow = "0 0 10px 2px rgba(16, 185, 129, 0.6)";
        }
      }
    } catch (e) {
      console.warn("Failed to resume:", e);
    }
  }

  function clearProgress() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // Theme Logic
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("iiot-theme", theme);
    if (themeToggleBtn) themeToggleBtn.textContent = theme === "dark" ? "Switch to Light" : "Switch to Dark";
  }

  // Event Listeners
  startQuizBtn.addEventListener("click", startQuiz);

  selectAllWeeksBtn.addEventListener("click", () => {
    document.querySelectorAll(".week-checkbox").forEach(cb => cb.checked = true);
  });

  clearAllWeeksBtn.addEventListener("click", () => {
    document.querySelectorAll(".week-checkbox").forEach(cb => cb.checked = false);
  });
  
  optionsContainer.addEventListener("click", e => {
    const btn = e.target.closest(".option-btn");
    if (btn && !state.locked) submitAnswer(btn.dataset.option);
  });

  nextQuestionBtn.addEventListener("click", () => {
    if (state.currentQuestionIndex < state.quizQuestionIds.length) {
      renderQuestion(state.currentQuestionIndex + 1);
    } else {
      showFinalSummary();
    }
  });

  prevQuestionBtn.addEventListener("click", () => {
    if (state.currentQuestionIndex > 1) renderQuestion(state.currentQuestionIndex - 1);
  });

  backToSetupBtn.addEventListener("click", () => {
    if (confirm("Exit quiz? Progress will be lost.")) {
      clearProgress();
      location.reload();
    }
  });

  restartBtn.addEventListener("click", () => location.reload());

  themeToggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });

  groqSecretCode.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      state.secretCode = groqSecretCode.value.trim();
      if (state.secretCode === "arya21") {
        groqSecretCode.style.boxShadow = "0 0 10px 2px rgba(16, 185, 129, 0.6)";
        // If already answered, re-render to show explanation
        if (state.locked) renderQuestion(state.currentQuestionIndex);
      }
      saveProgress();
    }
  });

  init();
})();

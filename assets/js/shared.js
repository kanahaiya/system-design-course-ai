/**
 * @file shared.js
 * @description Core engine for the MAANG System Design Course. Handles
 *              progress tracking, quiz logic, code copy, animated SVG
 *              diagrams, TOC highlighting, and mock interview timer.
 *
 * @requires none — vanilla JS, no dependencies
 *
 * Public API:
 * initPage()               — call on every page; bootstraps all features
 * QuizEngine(containerId)  — instantiate a quiz from data-* attributes
 * drawDiagram(svgId, spec) — render an animated architecture diagram
 * MockInterview            — namespace for the interview simulator
 * Progress                 — namespace for localStorage progress tracking
 */

// ── Constants ─────────────────────────────────────────────────────
const STORAGE_KEY_PROGRESS = 'sdcourse_progress_v1';
const STORAGE_KEY_QUIZ     = 'sdcourse_quiz_v1';
const TIMER_WARNING_SECS   = 600;  // 10 minutes — turn timer yellow
const TIMER_DANGER_SECS    = 300;  // 5 minutes  — turn timer red
const COPY_RESET_DELAY_MS  = 2000;
const STORAGE_KEY_INTERVIEW = 'sdcourse_interview_mode_v1';

// ── Progress Tracking ─────────────────────────────────────────────
const Progress = (() => {
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PROGRESS);
      return raw !== null ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(state));
    } catch {
      // Storage quota exceeded — fail silently; non-critical
    }
  }

  function markComplete(lessonId) {
    const state = loadState();
    state[lessonId] = { completedAt: Date.now() };
    saveState(state);
    updateCompletionUi(lessonId);
  }

  function markIncomplete(lessonId) {
    const state = loadState();
    delete state[lessonId];
    saveState(state);
    updateCompletionUi(lessonId);
  }

  function isComplete(lessonId) {
    const state = loadState();
    return lessonId in state;
  }

  function getCompletedCount(lessonIds) {
    const state = loadState();
    return lessonIds.filter(id => id in state).length;
  }

  function getAllCompleted() {
    return loadState();
  }

  function updateCompletionUi(lessonId) {
    const buttonElement = document.getElementById('js-complete-btn');
    if (buttonElement === null) return;

    const completed = isComplete(lessonId);
    buttonElement.textContent = completed ? 'Mark Incomplete' : 'Mark Complete';
    buttonElement.classList.toggle('btn--primary', !completed);
    buttonElement.classList.toggle('btn--outline', completed);
  }

  return { markComplete, markIncomplete, isComplete, getCompletedCount, getAllCompleted };
})();

// ── Quiz Engine ───────────────────────────────────────────────────
function QuizEngine(containerElement) {
  if (containerElement === null || containerElement === undefined) return;

  const questions = parseQuestions(containerElement);
  if (questions.length === 0) return;

  let currentQuestionIndex = 0;
  let correctCount = 0;
  const quizId = containerElement.dataset.quizId;
  const quizDifficulty = getQuizDifficultySettings();

  renderDifficultyBadge();
  renderQuestion(currentQuestionIndex);
  renderProgressDots();

  function parseQuestions(container) {
    const questionElements = container.querySelectorAll('[data-question]');
    return Array.from(questionElements).map(questionElement => ({
      text:        questionElement.dataset.question,
      options:     JSON.parse(questionElement.dataset.options),
      correctIndex:parseInt(questionElement.dataset.correct, 10),
      explanation: questionElement.dataset.explanation,
    }));
  }

  function renderQuestion(index) {
    const questionData = questions[index];
    const questionTextElement = containerElement.querySelector('.quiz__question-text');
    const questionNumberElement = containerElement.querySelector('.quiz__question-number');
    const optionsContainer = containerElement.querySelector('.quiz__options');
    const explanationElement = containerElement.querySelector('.quiz__explanation');

    if (questionTextElement !== null) {
      questionTextElement.textContent = questionData.text;
    }
    if (questionNumberElement !== null) {
      questionNumberElement.textContent = `Question ${index + 1} of ${questions.length}`;
    }
    if (explanationElement !== null) {
      explanationElement.textContent = '';
      explanationElement.classList.remove('quiz__explanation--visible');
    }
    if (optionsContainer !== null) {
      optionsContainer.innerHTML = '';
      questionData.options.forEach((optionText, optionIndex) => {
        const buttonElement = document.createElement('button');
        buttonElement.className = 'quiz__option';
        buttonElement.setAttribute('type', 'button');
        buttonElement.innerHTML = `
          <span class="quiz__option-letter">${String.fromCharCode(65 + optionIndex)}</span>
          <span>${optionText}</span>
        `;
        buttonElement.addEventListener('click', () => handleOptionClick(buttonElement, optionIndex));
        optionsContainer.appendChild(buttonElement);
      });
    }
  }

  function handleOptionClick(clickedButton, selectedIndex) {
    const allOptionButtons = containerElement.querySelectorAll('.quiz__option');
    const isAlreadyAnswered = Array.from(allOptionButtons).some(
      buttonElement => buttonElement.classList.contains('quiz__option--correct') ||
                       buttonElement.classList.contains('quiz__option--wrong')
    );
    if (isAlreadyAnswered) return;

    const correctIndex = questions[currentQuestionIndex].correctIndex;
    const isCorrect = selectedIndex === correctIndex;

    allOptionButtons.forEach((buttonElement, buttonIndex) => {
      if (buttonIndex === correctIndex) {
        buttonElement.classList.add('quiz__option--correct');
      } else if (buttonIndex === selectedIndex && !isCorrect) {
        buttonElement.classList.add('quiz__option--wrong');
      }
    });

    if (isCorrect) correctCount++;

    const explanationElement = containerElement.querySelector('.quiz__explanation');
    if (explanationElement !== null) {
      explanationElement.textContent = questions[currentQuestionIndex].explanation;
      explanationElement.classList.add('quiz__explanation--visible');
    }

    updateProgressDot(currentQuestionIndex, isCorrect);
    showNextButton();
  }

  function showNextButton() {
    const nextButtonElement = containerElement.querySelector('.js-quiz-next');
    if (nextButtonElement !== null) {
      nextButtonElement.classList.remove('is-hidden');
    }
  }

  function renderProgressDots() {
    const progressContainer = containerElement.querySelector('.quiz__progress');
    if (progressContainer === null) return;

    progressContainer.innerHTML = '';
    questions.forEach((_, dotIndex) => {
      const dotElement = document.createElement('span');
      dotElement.className = 'quiz__progress-dot';
      if (dotIndex === 0) dotElement.classList.add('quiz__progress-dot--current');
      progressContainer.appendChild(dotElement);
    });
  }

  function updateProgressDot(questionIndex, isCorrect) {
    const dotElements = containerElement.querySelectorAll('.quiz__progress-dot');
    if (dotElements[questionIndex] !== undefined) {
      dotElements[questionIndex].classList.remove('quiz__progress-dot--current');
      dotElements[questionIndex].classList.add('quiz__progress-dot--done');
      dotElements[questionIndex].style.background = isCorrect
        ? 'var(--color-accent-green)'
        : 'var(--color-accent-red)';
    }
    if (dotElements[questionIndex + 1] !== undefined) {
      dotElements[questionIndex + 1].classList.add('quiz__progress-dot--current');
    }
  }

  function nextQuestion() {
    currentQuestionIndex++;
    const nextButtonElement = containerElement.querySelector('.js-quiz-next');
    if (nextButtonElement !== null) nextButtonElement.classList.add('is-hidden');

    if (currentQuestionIndex < questions.length) {
      renderQuestion(currentQuestionIndex);
    } else {
      showResult();
    }
  }

  function showResult() {
    const percentage = Math.round((correctCount / questions.length) * 100);
    const questionElement = containerElement.querySelector('.quiz__question');
    const resultContainer = containerElement.querySelector('.quiz__result');
    const nextButtonElement = containerElement.querySelector('.js-quiz-next');

    if (questionElement !== null) questionElement.classList.add('is-hidden');
    if (nextButtonElement !== null) nextButtonElement.classList.add('is-hidden');

    if (resultContainer !== null) {
      resultContainer.classList.remove('is-hidden');
      const scoreElement = resultContainer.querySelector('.quiz__result-score');
      const labelElement = resultContainer.querySelector('.quiz__result-label');
      if (scoreElement !== null) scoreElement.textContent = `${percentage}%`;
      if (labelElement !== null) {
        labelElement.textContent = percentage === 100
          ? `Perfect! ${quizDifficulty.name} level mastered.`
          : percentage >= quizDifficulty.passThreshold
            ? `${correctCount} of ${questions.length} correct — pass for ${quizDifficulty.name} (${quizDifficulty.passThreshold}% target).`
            : `${correctCount} of ${questions.length} correct — below ${quizDifficulty.name} target (${quizDifficulty.passThreshold}%). Re-run once before moving on.`;
      }
    }

    if (quizId !== undefined && quizId !== null) {
      saveQuizScore(quizId, percentage);
    }
  }

  function renderDifficultyBadge() {
    const quizHeaderElement = containerElement.querySelector('.quiz__header');
    const quizScoreElement = containerElement.querySelector('.quiz__score');
    if (quizHeaderElement === null || quizScoreElement === null) return;
    const badgeElement = document.createElement('span');
    badgeElement.className = `quiz__difficulty quiz__difficulty--${quizDifficulty.tierClass}`;
    badgeElement.textContent = `${quizDifficulty.name} • target ${quizDifficulty.passThreshold}%`;
    quizHeaderElement.insertBefore(badgeElement, quizScoreElement);
  }

  function saveQuizScore(quizId, percentage) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_QUIZ);
      const scores = raw !== null ? JSON.parse(raw) : {};
      scores[quizId] = { score: percentage, takenAt: Date.now() };
      localStorage.setItem(STORAGE_KEY_QUIZ, JSON.stringify(scores));
    } catch {
      // Non-critical; ignore storage failures
    }
  }

  const nextButtonElement = containerElement.querySelector('.js-quiz-next');
  if (nextButtonElement !== null) {
    nextButtonElement.addEventListener('click', nextQuestion);
  }

  const retryButtonElement = containerElement.querySelector('.js-quiz-retry');
  if (retryButtonElement !== null) {
    retryButtonElement.addEventListener('click', () => {
      currentQuestionIndex = 0;
      correctCount = 0;
      const resultContainer = containerElement.querySelector('.quiz__result');
      const questionElement = containerElement.querySelector('.quiz__question');
      if (resultContainer !== null) resultContainer.classList.add('is-hidden');
      if (questionElement !== null) questionElement.classList.remove('is-hidden');
      renderQuestion(0);
      renderProgressDots();
    });
  }
}

function getQuizDifficultySettings() {
  const path = window.location.pathname;
  if (path.includes('/tier3/')) {
    return { name: 'Tier 3 (Staff)', passThreshold: 80, tierClass: 'tier3' };
  }
  if (path.includes('/tier2/')) {
    return { name: 'Tier 2 (Senior)', passThreshold: 75, tierClass: 'tier2' };
  }
  return { name: 'Tier 1 (Core)', passThreshold: 70, tierClass: 'tier1' };
}

// ── Code Copy Buttons ─────────────────────────────────────────────
function initCodeCopyButtons() {
  const copyButtonElements = document.querySelectorAll('.code-block__copy');
  copyButtonElements.forEach(buttonElement => {
    buttonElement.addEventListener('click', () => handleCopyButtonClick(buttonElement));
  });
}

function handleCopyButtonClick(buttonElement) {
  const codeBlockElement = buttonElement.closest('.code-block');
  if (codeBlockElement === null) return;

  const codeElement = codeBlockElement.querySelector('code');
  if (codeElement === null) return;

  const codeText = codeElement.textContent;
  navigator.clipboard.writeText(codeText).then(() => {
    buttonElement.textContent = 'Copied!';
    buttonElement.classList.add('code-block__copy--copied');
    setTimeout(() => {
      buttonElement.textContent = 'Copy';
      buttonElement.classList.remove('code-block__copy--copied');
    }, COPY_RESET_DELAY_MS);
  }).catch(() => {
    buttonElement.textContent = 'Failed';
  });
}

// ── TOC Active Highlighting ───────────────────────────────────────
function initTocHighlighting() {
  const sectionElements = document.querySelectorAll('.content-section[id]');
  const tocLinkElements = document.querySelectorAll('.module-toc__link');
  if (sectionElements.length === 0 || tocLinkElements.length === 0) return;

  const observerOptions = {
    rootMargin: '-20% 0px -60% 0px',
    threshold: 0,
  };

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const activeId = entry.target.id;
      tocLinkElements.forEach(linkElement => {
        const isActive = linkElement.getAttribute('href') === `#${activeId}`;
        linkElement.classList.toggle('module-toc__link--active', isActive);
      });
    });
  }, observerOptions);

  sectionElements.forEach(sectionElement => observer.observe(sectionElement));
}

// ── Completion Button ─────────────────────────────────────────────
function initCompletionButton() {
  const buttonElement = document.getElementById('js-complete-btn');
  if (buttonElement === null) return;

  const lessonId = buttonElement.dataset.lessonId;
  if (lessonId === undefined) return;

  if (Progress.isComplete(lessonId)) {
    buttonElement.textContent = 'Mark Incomplete';
    buttonElement.classList.add('btn--outline');
    buttonElement.classList.remove('btn--primary');
  }

  buttonElement.addEventListener('click', () => {
    if (Progress.isComplete(lessonId)) {
      Progress.markIncomplete(lessonId);
    } else {
      Progress.markComplete(lessonId);
    }
  });
}

// ── SVG Diagram Renderer ──────────────────────────────────────────

/**
 * Draws an animated architecture diagram into a target SVG element.
 * Spec format:
 * {
 *   nodes: [{ id, label, sublabel, x, y, w, h, type }],
 *   edges: [{ from, to, label, animated }]
 * }
 *
 * @param {string} svgElementId - The id of the <svg> element to draw into
 * @param {Object} diagramSpec  - Diagram specification
 */
function drawDiagram(svgElementId, diagramSpec) {
  const svgElement = document.getElementById(svgElementId);
  if (svgElement === null) return;

  const svgNs = 'http://www.w3.org/2000/svg';

  function createSvgElement(tagName, attributes) {
    const element = document.createElementNS(svgNs, tagName);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  // Arrowhead marker
  const defsElement = createSvgElement('defs', {});
  const markerElement = createSvgElement('marker', {
    id: 'arrowhead', markerWidth: '10', markerHeight: '7',
    refX: '9', refY: '3.5', orient: 'auto',
  });
  const polygonElement = createSvgElement('polygon', {
    points: '0 0, 10 3.5, 0 7',
    fill: 'var(--color-text-muted)',
  });
  markerElement.appendChild(polygonElement);
  defsElement.appendChild(markerElement);
  svgElement.appendChild(defsElement);

  const nodeMap = {};
  diagramSpec.nodes.forEach(nodeSpec => nodeMap[nodeSpec.id] = nodeSpec);

  // Draw edges first (behind nodes)
  diagramSpec.edges.forEach(edgeSpec => {
    const sourceNode = nodeMap[edgeSpec.from];
    const targetNode = nodeMap[edgeSpec.to];
    if (sourceNode === undefined || targetNode === undefined) return;

    const startX = sourceNode.x + sourceNode.w;
    const startY = sourceNode.y + sourceNode.h / 2;
    const endX = targetNode.x;
    const endY = targetNode.y + targetNode.h / 2;
    const midX = (startX + endX) / 2;

    const pathElement = createSvgElement('path', {
      d: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
      fill: 'none',
      stroke: edgeSpec.animated ? 'var(--color-primary)' : 'var(--color-text-muted)',
      'stroke-width': '1.5',
      'marker-end': 'url(#arrowhead)',
    });

    if (edgeSpec.animated) {
      const totalLength = 200; // approximate
      pathElement.setAttribute('stroke-dasharray', `${totalLength}`);
      pathElement.setAttribute('stroke-dashoffset', `${totalLength}`);
      const animateElement = createSvgElement('animate', {
        attributeName: 'stroke-dashoffset',
        from: `${totalLength}`, to: '0',
        dur: '1.5s', begin: '0.5s', fill: 'freeze',
      });
      pathElement.appendChild(animateElement);
    }

    svgElement.appendChild(pathElement);

    if (edgeSpec.label !== undefined && edgeSpec.label !== '') {
      const labelX = midX;
      const labelY = (startY + endY) / 2 - 6;
      const textElement = createSvgElement('text', {
        x: labelX, y: labelY,
        'text-anchor': 'middle',
        fill: 'var(--color-text-muted)',
        'font-size': '10',
        'font-family': 'var(--font-sans)',
      });
      textElement.textContent = edgeSpec.label;
      svgElement.appendChild(textElement);
    }
  });

  // Draw nodes
  diagramSpec.nodes.forEach(nodeSpec => {
    const nodeTypeClassMap = {
      primary: 'diagram-node--primary',
      accent:  'diagram-node--accent',
      green:   'diagram-node--green',
      yellow:  'diagram-node--yellow',
    };

    const rectElement = createSvgElement('rect', {
      x: nodeSpec.x, y: nodeSpec.y,
      width: nodeSpec.w, height: nodeSpec.h,
      rx: '8',
      class: `diagram-node ${nodeTypeClassMap[nodeSpec.type] ?? ''}`,
    });
    svgElement.appendChild(rectElement);

    const labelElement = createSvgElement('text', {
      x: nodeSpec.x + nodeSpec.w / 2,
      y: nodeSpec.sublabel ? nodeSpec.y + nodeSpec.h / 2 - 6 : nodeSpec.y + nodeSpec.h / 2,
      class: 'diagram-label',
    });
    labelElement.textContent = nodeSpec.label;
    svgElement.appendChild(labelElement);

    if (nodeSpec.sublabel !== undefined) {
      const sublabelElement = createSvgElement('text', {
        x: nodeSpec.x + nodeSpec.w / 2,
        y: nodeSpec.y + nodeSpec.h / 2 + 10,
        class: 'diagram-sublabel',
      });
      sublabelElement.textContent = nodeSpec.sublabel;
      svgElement.appendChild(sublabelElement);
    }
  });
}

// ── Mock Interview Timer ──────────────────────────────────────────
const MockInterview = (() => {
  let remainingSeconds = 0;
  let intervalId = null;
  let timerElement = null;

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function updateTimerDisplay() {
    if (timerElement === null) return;
    timerElement.textContent = formatTime(remainingSeconds);
    timerElement.classList.remove('mock-timer--warning', 'mock-timer--danger');
    if (remainingSeconds <= TIMER_DANGER_SECS) {
      timerElement.classList.add('mock-timer--danger');
    } else if (remainingSeconds <= TIMER_WARNING_SECS) {
      timerElement.classList.add('mock-timer--warning');
    }
  }

  function start(durationSeconds, displayElement) {
    if (intervalId !== null) stop();
    remainingSeconds = durationSeconds;
    timerElement = displayElement;
    updateTimerDisplay();
    intervalId = setInterval(() => {
      remainingSeconds--;
      updateTimerDisplay();
      if (remainingSeconds <= 0) stop();
    }, 1000);
  }

  function stop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function reset(durationSeconds) {
    stop();
    remainingSeconds = durationSeconds;
    updateTimerDisplay();
  }

  return { start, stop, reset };
})();

// ── Collapsible Guide Sections ────────────────────────────────────
function initGuideToggles() {
  const toggleButtonElements = document.querySelectorAll('.mock-guide__toggle');
  toggleButtonElements.forEach(buttonElement => {
    buttonElement.addEventListener('click', () => handleGuideToggle(buttonElement));
  });
}

function handleGuideToggle(toggleButtonElement) {
  const sectionElement = toggleButtonElement.closest('.mock-guide__section');
  if (sectionElement === null) return;

  const isLocked = sectionElement.dataset.locked === 'true';
  if (isLocked) return;

  const contentElement = sectionElement.querySelector('.mock-guide__content');
  const chevronElement = sectionElement.querySelector('.mock-guide__chevron');
  const isOpen = contentElement.classList.contains('mock-guide__content--open');

  contentElement.classList.toggle('mock-guide__content--open', !isOpen);
  if (chevronElement !== null) {
    chevronElement.classList.toggle('mock-guide__chevron--open', !isOpen);
  }
  toggleButtonElement.classList.toggle('mock-guide__toggle--revealed', !isOpen);
}

// ── Nav Active State ──────────────────────────────────────────────
function initNavActiveState() {
  const currentPath = window.location.pathname;
  const navLinkElements = document.querySelectorAll('.site-nav__link');
  navLinkElements.forEach(linkElement => {
    const href = linkElement.getAttribute('href');
    if (href !== null && currentPath.includes(href) && href !== '/') {
      linkElement.classList.add('site-nav__link--active');
    }
  });
}

// ── Problem Card Completion Badges ────────────────────────────────
function initProblemCardBadges() {
  const problemCardElements = document.querySelectorAll('[data-lesson-id]');
  problemCardElements.forEach(cardElement => {
    const lessonId = cardElement.dataset.lessonId;
    if (lessonId === undefined) return;
    if (Progress.isComplete(lessonId)) {
      const iconElement = cardElement.querySelector('.problem-card__complete-icon');
      if (iconElement !== null) {
        iconElement.classList.add('problem-card__complete-icon--done');
        iconElement.textContent = '✓';
      }
    }
  });
}

// ── Interview Mode Blocks (all problem pages) ─────────────────────
function initInterviewModeBlocks() {
  const isInterviewContentPage = window.location.pathname.includes('/problems/') ||
                                 window.location.pathname.includes('/modules/');
  if (!isInterviewContentPage) return;

  const moduleContentElement = document.querySelector('.module-content');
  const moduleHeaderElement = document.querySelector('.module-header');
  const tocListElement = document.querySelector('.module-toc__list');
  if (moduleContentElement === null || moduleHeaderElement === null || tocListElement === null) return;
  if (document.getElementById('interview-drill') !== null) return;

  const lessonId = document.getElementById('js-complete-btn')?.dataset.lessonId ?? window.location.pathname;
  const titleText = document.querySelector('.module-header__title')?.textContent ?? '';
  const interviewSignals = getInterviewSignals(lessonId, titleText);

  const sectionElement = document.createElement('section');
  sectionElement.className = 'content-section';
  sectionElement.id = 'interview-drill';
  sectionElement.setAttribute('aria-labelledby', 'interview-drill-title');
  sectionElement.innerHTML = `
    <h2 class="content-section__title" id="interview-drill-title">
      <span class="content-section__title-icon" aria-hidden="true">🎯</span>
      Interview Drill Mode
      <span class="reshaded-step__letter">L5 → L6</span>
    </h2>
    <div class="content-section__body">
      <div class="interview-mode__tabs" role="tablist" aria-label="Interview depth view">
        <button class="interview-mode__tab interview-mode__tab--active" type="button" role="tab" aria-selected="true" data-interview-view="30m">30-min answer</button>
        <button class="interview-mode__tab" type="button" role="tab" aria-selected="false" data-interview-view="60m">60-min deep answer</button>
      </div>

      <div class="interview-mode__panel" data-interview-panel="30m">
        <p><strong>Use this when the interviewer says "high-level design first".</strong></p>
        <ol>
          <li><strong>3 min:</strong> Clarify functional + non-functional requirements, explicitly call out scale assumptions.</li>
          <li><strong>5 min:</strong> Back-of-envelope estimates (QPS, storage, hot path, p99 latency target).</li>
          <li><strong>10 min:</strong> Present baseline architecture and one critical data model.</li>
          <li><strong>7 min:</strong> Deep dive the hardest bottleneck (consistency, fan-out, or contention).</li>
          <li><strong>5 min:</strong> Trade-offs, failure handling, and phased rollout plan.</li>
        </ol>
      </div>

      <div class="interview-mode__panel is-hidden" data-interview-panel="60m">
        <p><strong>Use this when the interviewer asks for staff-level depth.</strong></p>
        <ol>
          <li><strong>10 min:</strong> Walk through baseline + alternative architectures and reject one with reasoned trade-offs.</li>
          <li><strong>15 min:</strong> Capacity planning by component (cache, queue, DB, network egress, partition strategy).</li>
          <li><strong>15 min:</strong> Consistency model + failure semantics (idempotency, retries, duplicate suppression, ordering).</li>
          <li><strong>10 min:</strong> Observability, SLOs, and operational playbooks (what pages on-call at 2am).</li>
          <li><strong>10 min:</strong> Migration strategy, risk controls, and measurable rollout checkpoints.</li>
        </ol>
      </div>

      <div class="insight-box insight-box--info">
        <div class="insight-box__icon" aria-hidden="true">🧭</div>
        <div class="insight-box__body">
          <div class="insight-box__title">What interviewer is testing here</div>
          <div class="insight-box__text">
            <ul class="interview-mode__signal-list">
              ${interviewSignals.map(signal => `<li>${signal}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>

      <div class="interview-mode__mistakes">
        <h3 style="margin-top:0">Common mistakes + recovery lines</h3>
        <div class="interview-mode__mistake-card">
          <p><strong>Mistake:</strong> Jumping to tools (Kafka/Redis) before requirements.</p>
          <p><strong>Recovery line:</strong> "Let me step back and pin down the exact consistency and latency requirements first, then choose components."</p>
        </div>
        <div class="interview-mode__mistake-card">
          <p><strong>Mistake:</strong> Ignoring write path contention or idempotency.</p>
          <p><strong>Recovery line:</strong> "Before finalizing, I want to close retry semantics and idempotency so duplicate requests don't create incorrect state."</p>
        </div>
        <div class="interview-mode__mistake-card">
          <p><strong>Mistake:</strong> No explicit failure behavior.</p>
          <p><strong>Recovery line:</strong> "If Redis is unavailable, we fail open to the DB and accept higher latency while preserving correctness."</p>
        </div>
      </div>

      <div class="interview-mode__exercise" data-interview-checklist="${lessonId}">
        <h3 style="margin-top:0">Practice checklist (self-score)</h3>
        <label class="interview-mode__check"><input type="checkbox" data-check-key="requirements"> I stated assumptions and NFRs in under 3 minutes</label>
        <label class="interview-mode__check"><input type="checkbox" data-check-key="estimation"> I gave concrete QPS/storage numbers</label>
        <label class="interview-mode__check"><input type="checkbox" data-check-key="deepdive"> I deep-dived the hardest bottleneck</label>
        <label class="interview-mode__check"><input type="checkbox" data-check-key="failure"> I explained failure mode and fallback behavior</label>
        <label class="interview-mode__check"><input type="checkbox" data-check-key="tradeoffs"> I defended at least 2 trade-offs with rationale</label>
        <p class="interview-mode__score" aria-live="polite"></p>
      </div>
    </div>
  `;

  moduleHeaderElement.insertAdjacentElement('afterend', sectionElement);

  const tocLinkElement = document.createElement('li');
  tocLinkElement.innerHTML = '<a href="#interview-drill" class="module-toc__link">Interview Drill Mode</a>';
  const tocInsertAfter = tocListElement.querySelector('a[href="#deepdive"]')?.parentElement;
  if (tocInsertAfter !== null && tocInsertAfter !== undefined) {
    tocInsertAfter.insertAdjacentElement('afterend', tocLinkElement);
  } else {
    tocListElement.appendChild(tocLinkElement);
  }

  initInterviewTabs(sectionElement);
  initInterviewChecklist(sectionElement, lessonId);
}

function getInterviewSignals(lessonId, titleText) {
  const lessonSignals = {
    'module-00': ['Can you drive the interview with a clear structure?', 'Can you time-box each section under pressure?', 'Can you summarize decisions crisply at the end?'],
    'module-00b': ['Can you explain packet-to-product flow clearly?', 'Can you choose the right protocol for the workload?', 'Can you map networking limits to architecture choices?'],
    'module-01': ['Can you apply CAP/consistency based on requirements?', 'Can you estimate scale quickly with sane assumptions?', 'Can you connect fundamentals to design trade-offs?'],
    'module-02': ['Can you choose storage model by access pattern?', 'Can you justify sharding and replication strategy?', 'Can you reason about index/storage amplification costs?'],
    'module-03': ['Can you select cache strategy per read/write behavior?', 'Can you handle invalidation and stampede scenarios?', 'Can you quantify hit-rate impact on latency/cost?'],
    'module-04': ['Can you choose queue/pub-sub based on guarantees?', 'Can you reason about ordering/partitioning semantics?', 'Can you design back-pressure and dead-letter behavior?'],
    'module-05': ['Can you design APIs for correctness under retries?', 'Can you justify rate-limit algorithm choice?', 'Can you communicate versioning and compatibility plans?'],
    'module-06': ['Can you explain consensus and leader election plainly?', 'Can you reason about distributed transaction failure modes?', 'Can you choose CP/AP behavior intentionally?'],
    'module-07': ['Can you articulate scaling bottlenecks with numbers?', 'Can you choose fanout strategy by workload shape?', 'Can you handle hot partitions and rebalance risk?'],
    'module-08': ['Can you define useful SLIs/SLOs for this system?', 'Can you trace a failure across service boundaries?', 'Can you distinguish symptom alerts from noise?'],
    'module-09': ['Can you design authn/authz boundaries correctly?', 'Can you prevent secret/token leakage in design paths?', 'Can you map threats to concrete mitigations?'],
    'module-10': ['Can you pick patterns for specific failure risks?', 'Can you explain circuit-breaker/bulkhead interaction?', 'Can you avoid pattern overuse and keep simplicity?'],
    'module-11': ['Can you model entities and responsibilities cleanly?', 'Can you enforce invariants in object interactions?', 'Can you separate extensibility from overengineering?'],
    'module-12': ['Can you choose transport by latency/fanout needs?', 'Can you manage connection state at high concurrency?', 'Can you degrade gracefully under partial real-time failure?'],
    'module-13': ['Can you use advanced primitives only where needed?', 'Can you explain idempotency/discovery/leader-election trade-offs?', 'Can you keep operations complexity in the design conversation?'],

    'p-url-shortener': ['ID generation without collisions at scale', 'Read-path latency via cache hierarchy', 'Redirect semantics and analytics correctness'],
    'p-twitter-feed': ['Fanout strategy selection under celebrity skew', 'Feed freshness vs write amplification', 'Timeline merge correctness under failures'],
    'p-youtube': ['Upload pipeline durability and retry safety', 'Transcoding fanout and storage lifecycle control', 'Playback latency and CDN strategy by region'],
    'p-whatsapp': ['Message delivery guarantees and ordering scope', 'Online/offline state transitions and reconciliation', 'Read receipt semantics under reconnects'],
    'p-rate-limiter': ['Correctness under burst traffic', 'Distributed counter consistency', 'Fail-open vs fail-closed behavior'],
    'p-distributed-cache': ['Partitioning and hot-key mitigation design', 'Eviction policy impact on real latency', 'Consistency guarantees for cache invalidation'],
    'p-search-autocomplete': ['Prefix retrieval latency at scale', 'Ranking quality vs memory footprint trade-off', 'Freshness pipeline for trending queries'],
    'p-notification': ['Channel fanout reliability under retries', 'User preference filtering correctness', 'Back-pressure handling by notification channel'],
    'p-uber': ['Real-time geo indexing and nearest-driver search', 'Matching fairness vs latency trade-off', 'State consistency across trip lifecycle'],
    'p-web-crawler': ['Politeness and crawl budget scheduling', 'Deduplication correctness under distributed workers', 'Frontier prioritization and failure recovery'],
    'p-pastebin': ['Write-path durability with cheap storage', 'Read-path latency for hot vs cold content', 'Abuse controls without hurting availability'],
    'p-key-value': ['Partition + replication strategy with quorum math', 'Read/write consistency under node failures', 'Compaction and storage amplification trade-offs'],
    'p-message-queue': ['Ordering guarantees and partition strategy', 'At-least-once vs exactly-once semantics clarity', 'Consumer lag and back-pressure behavior'],
    'p-news-feed': ['Hybrid push/pull fanout boundary conditions', 'Cache invalidation and stale feed risk', 'Latency budget under multi-source merges'],
    'p-dropbox': ['Chunk-level dedup correctness and efficiency', 'Sync conflict resolution model', 'Metadata consistency across devices'],
    'p-lru-cache': ['Data structure correctness under concurrent access', 'Eviction policy impact on hit ratio', 'TTL semantics and stale-read behavior'],
    'p-yelp': ['Geo partitioning and nearby search accuracy', 'Ranking blend (distance + quality + relevance)', 'Hotspot mitigation in dense urban cells'],

    'p-slack': ['WebSocket fanout scalability and stickiness', 'Channel ordering and idempotent message delivery', 'Presence correctness under heartbeat failures'],
    'p-instagram': ['Feed fanout strategy with celebrity bypass', 'Media pipeline cost vs quality trade-off', 'Ranking model signal freshness and drift'],
    'p-netflix': ['ABR quality switching stability', 'CDN strategy and pre-positioning economics', 'Service resilience under partial regional failures'],
    'p-google-maps': ['Spatial indexing and routing latency trade-offs', 'Live traffic update propagation model', 'Storage/computation cost boundaries'],
    'p-payment': ['Idempotency and duplicate charge prevention', 'State-machine correctness with external PSP', 'Reconciliation and failure recovery'],
    'p-code-judge': ['Sandbox isolation and escape prevention', 'Queueing strategy during contest spikes', 'Deterministic grading and flaky test handling'],
    'p-hotel': ['Inventory correctness under concurrent bookings', 'Hold/confirm timeout flow safety', 'Pricing and overbooking policy boundaries'],
    'p-stock': ['Matching engine determinism and fairness', 'Latency optimization without correctness loss', 'Market halt and risk-control semantics'],
    'p-ad-click': ['Exactly-once billing correctness', 'Windowing + late-event handling strategy', 'Fraud filtering without revenue leakage'],
    'p-scheduler': ['Leader election reliability and failover timing', 'Duplicate execution prevention model', 'Retry and dead-letter semantics'],
    'p-live': ['Ingest/transcode/delivery latency budget', 'Viewer fanout under burst traffic', 'Quality fallback behavior under network degradation'],
    'p-flash': ['Oversell prevention correctness', 'Queueing and fairness under extreme spikes', 'Timeout/retry behavior around reservations'],
    'p-google-docs': ['Concurrency conflict resolution model', 'Operational transform ordering guarantees', 'Offline merge semantics'],
    'p-metrics': ['High-cardinality control strategy', 'Rollup correctness and retention economics', 'Alerting semantics under delayed data'],
    'p-leaderboard': ['Ordering correctness under heavy writes', 'Shard merge strategy for global ranking', 'Anti-cheat signal reliability'],
    'p-live-comments': ['Real-time fanout and ordering guarantees', 'Write durability vs ultra-low latency trade-off', 'Hot stream partition mitigation'],
    'p-ecommerce-cart': ['Inventory and payment saga consistency', 'Optimistic locking retry semantics', 'Compensation flow correctness'],
    'p-search-engine': ['Index freshness vs query latency trade-off', 'Ranking quality vs serving cost', 'Crawl/index pipeline fault tolerance'],
    'p-spotify': ['Streaming quality adaptation stability', 'Recommendation freshness and cold-start handling', 'Rights/DRM flow correctness'],
    'p-ticket-booking': ['Seat lock correctness under contention', 'Reservation timeout and release behavior', 'Consistency across payment and seat state'],
    'p-zoom': ['Real-time media routing strategy selection', 'Latency/quality trade-off under packet loss', 'Control-plane reliability during scale events'],
    'p-trending-topics': ['Windowing math and recency weighting', 'Approximation error bounds clarity', 'Abuse/bot amplification protection'],
    'p-fb-messenger': ['Message ordering scope and guarantees', 'Fanout strategy for large groups', 'Presence/read-receipt consistency'],

    'p-dist-db': ['Consistency model and transaction semantics', 'Replication/quorum behavior under partition', 'Latency vs correctness trade-offs'],
    'p-moderation': ['Precision/recall policy by abuse type', 'Human-review queue prioritization logic', 'Appeal flow and legal hold correctness'],
    'p-recommendation': ['Retrieval vs ranking architecture split', 'Real-time vs offline signal incorporation', 'Exploration vs exploitation balancing'],
    'p-cdn': ['Cache hierarchy and origin protection strategy', 'Purge consistency vs propagation delay', 'Edge latency optimization under failures'],
    'p-analytics': ['Stream vs batch accuracy boundaries', 'Session/funnel correctness under late events', 'Serving-layer freshness trade-offs'],
    'p-tracing': ['Trace context propagation correctness', 'Sampling trade-off and observability blind spots', 'Storage/search strategy for high cardinality'],
    'p-api-gateway': ['Policy chain ordering correctness', 'Auth/rate-limit coupling under retries', 'Gateway reliability and fallback behavior'],
    'p-flags': ['Flag evaluation determinism and cache freshness', 'Rollout math and cohort stability', 'Kill-switch safety and blast-radius control'],
    'p-saas': ['Tenant isolation model and noisy-neighbor controls', 'Data ownership and migration strategy', 'Compliance boundaries by tenant geography'],
    'p-logs': ['Ingestion durability under burst traffic', 'Indexing strategy and retention economics', 'PII handling and secure access controls'],
  };
  if (lessonSignals[lessonId] !== undefined) return lessonSignals[lessonId];

  const normalizedTitle = titleText.toLowerCase();
  const genericSignals = [
    'Can you identify the true bottleneck before choosing technologies?',
    'Can you reason about consistency and failure behavior under retries?',
    'Can you justify trade-offs with numbers instead of opinions?',
  ];

  if (normalizedTitle.includes('payment') || normalizedTitle.includes('checkout')) {
    return [
      'Idempotency and duplicate suppression under retries',
      'State-machine correctness across external integrations',
      'Reconciling eventual consistency with financial correctness',
    ];
  }
  if (normalizedTitle.includes('cache') || normalizedTitle.includes('feed')) {
    return [
      'Read/write amplification and invalidation strategy',
      'Hot key mitigation and partition skew handling',
      'Latency vs consistency trade-offs at scale',
    ];
  }
  if (normalizedTitle.includes('stream') || normalizedTitle.includes('realtime') || normalizedTitle.includes('chat')) {
    return [
      'Ordering and fan-out guarantees under massive concurrency',
      'Back-pressure strategy when producers outpace consumers',
      'Connection management and graceful degradation under load',
    ];
  }
  return genericSignals;
}

function initInterviewTabs(sectionElement) {
  const tabButtonElements = sectionElement.querySelectorAll('.interview-mode__tab');
  const panelElements = sectionElement.querySelectorAll('.interview-mode__panel');

  tabButtonElements.forEach(tabButtonElement => {
    tabButtonElement.addEventListener('click', () => {
      const targetView = tabButtonElement.dataset.interviewView;
      tabButtonElements.forEach(buttonElement => {
        const isActive = buttonElement === tabButtonElement;
        buttonElement.classList.toggle('interview-mode__tab--active', isActive);
        buttonElement.setAttribute('aria-selected', String(isActive));
      });
      panelElements.forEach(panelElement => {
        const shouldShow = panelElement.dataset.interviewPanel === targetView;
        panelElement.classList.toggle('is-hidden', !shouldShow);
      });
    });
  });
}

function initInterviewChecklist(sectionElement, lessonId) {
  const exerciseElement = sectionElement.querySelector('.interview-mode__exercise');
  const scoreElement = sectionElement.querySelector('.interview-mode__score');
  if (exerciseElement === null || scoreElement === null) return;

  const checkboxElements = Array.from(exerciseElement.querySelectorAll('input[type="checkbox"]'));
  const storageKey = `${lessonId}`;
  const state = loadInterviewState();
  const lessonState = state[storageKey] ?? {};

  checkboxElements.forEach(checkboxElement => {
    const checkKey = checkboxElement.dataset.checkKey;
    checkboxElement.checked = lessonState[checkKey] === true;
    checkboxElement.addEventListener('change', () => {
      const nextState = loadInterviewState();
      const currentLessonState = nextState[storageKey] ?? {};
      currentLessonState[checkKey] = checkboxElement.checked;
      nextState[storageKey] = currentLessonState;
      saveInterviewState(nextState);
      updateInterviewScore();
    });
  });

  function updateInterviewScore() {
    const checkedCount = checkboxElements.filter(checkboxElement => checkboxElement.checked).length;
    scoreElement.textContent = `Interview readiness: ${checkedCount}/${checkboxElements.length} checkpoints complete`;
  }

  updateInterviewScore();
}

function loadInterviewState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INTERVIEW);
    return raw !== null ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveInterviewState(state) {
  try {
    localStorage.setItem(STORAGE_KEY_INTERVIEW, JSON.stringify(state));
  } catch {
    // Non-critical; ignore storage failures
  }
}

// ── Inline Quiz Engine (alternative format with data-correct on buttons) ──
function initInlineQuizzes() {
  const quizContainerElements = document.querySelectorAll('.quiz:not([data-quiz-id])');
  quizContainerElements.forEach(containerElement => {
    const questionElements = containerElement.querySelectorAll('.quiz__question');
    if (questionElements.length === 0) return;

    let currentQuestionIndex = 0;
    let correctCount = 0;
    const quizDifficulty = getQuizDifficultySettings();

    function showQuestion(index) {
      questionElements.forEach((questionElement, questionIndex) => {
        questionElement.classList.toggle('is-hidden', questionIndex !== index);
      });
      updateProgressDots(index);
    }

    function updateProgressDots(activeIndex) {
      const dotElements = containerElement.querySelectorAll('.quiz__progress-dot');
      dotElements.forEach((dotElement, dotIndex) => {
        dotElement.classList.remove('quiz__progress-dot--current');
        if (dotIndex === activeIndex) dotElement.classList.add('quiz__progress-dot--current');
      });
    }

    function buildProgressDots() {
      const progressContainer = containerElement.querySelector('.quiz__progress');
      if (progressContainer === null) return;
      progressContainer.innerHTML = '';
      questionElements.forEach((_, dotIndex) => {
        const dotElement = document.createElement('span');
        dotElement.className = 'quiz__progress-dot';
        if (dotIndex === 0) dotElement.classList.add('quiz__progress-dot--current');
        progressContainer.appendChild(dotElement);
      });
    }

    // Attach click handlers to all inline option buttons
    questionElements.forEach((questionElement, questionIndex) => {
      const optionButtonElements = questionElement.querySelectorAll('.quiz__option');
      optionButtonElements.forEach(optionButtonElement => {
        optionButtonElement.addEventListener('click', () => {
          const isAlreadyAnswered = questionElement.querySelector('.quiz__option--correct') !== null ||
                                    questionElement.querySelector('.quiz__option--wrong') !== null;
          if (isAlreadyAnswered) return;

          const isCorrect = optionButtonElement.dataset.correct === 'true';
          if (isCorrect) {
            optionButtonElement.classList.add('quiz__option--correct');
            correctCount++;
          } else {
            optionButtonElement.classList.add('quiz__option--wrong');
            // Highlight the correct one
            optionButtonElements.forEach(buttonElement => {
              if (buttonElement.dataset.correct === 'true') {
                buttonElement.classList.add('quiz__option--correct');
              }
            });
          }

          const dotElements = containerElement.querySelectorAll('.quiz__progress-dot');
          if (dotElements[questionIndex] !== undefined) {
            dotElements[questionIndex].style.background = isCorrect
              ? 'var(--color-accent-green)' : 'var(--color-accent-red)';
            dotElements[questionIndex].classList.remove('quiz__progress-dot--current');
            dotElements[questionIndex].classList.add('quiz__progress-dot--done');
          }

          if (questionIndex + 1 < questionElements.length) {
            if (dotElements[questionIndex + 1] !== undefined) {
              dotElements[questionIndex + 1].classList.add('quiz__progress-dot--current');
            }
          }

          const nextButtonElement = containerElement.querySelector('.js-quiz-next');
          if (nextButtonElement !== null) nextButtonElement.classList.remove('is-hidden');

          const explanationElement = questionElement.querySelector('.quiz__explanation');
          if (explanationElement !== null) explanationElement.classList.add('quiz__explanation--visible');
        });
      });
    });

    const nextButtonElement = containerElement.querySelector('.js-quiz-next');
    if (nextButtonElement !== null) {
      nextButtonElement.addEventListener('click', () => {
        currentQuestionIndex++;
        nextButtonElement.classList.add('is-hidden');
        if (currentQuestionIndex < questionElements.length) {
          showQuestion(currentQuestionIndex);
        } else {
          // Show result
          const resultContainer = containerElement.querySelector('.quiz__result');
          const firstQuestionElement = containerElement.querySelector('.quiz__question');
          if (resultContainer !== null) resultContainer.classList.remove('is-hidden');
          if (firstQuestionElement !== null) firstQuestionElement.classList.add('is-hidden');
          questionElements.forEach(questionElement => questionElement.classList.add('is-hidden'));
          const percentage = Math.round((correctCount / questionElements.length) * 100);
          const scoreElement = resultContainer !== null ? resultContainer.querySelector('.quiz__result-score') : null;
          const labelElement = resultContainer !== null ? resultContainer.querySelector('.quiz__result-label') : null;
          if (scoreElement !== null) scoreElement.textContent = `${percentage}%`;
          if (labelElement !== null) {
            labelElement.textContent = percentage >= quizDifficulty.passThreshold
              ? `${correctCount}/${questionElements.length} correct — pass for ${quizDifficulty.name} (${quizDifficulty.passThreshold}% target)`
              : `${correctCount}/${questionElements.length} correct — below ${quizDifficulty.name} target (${quizDifficulty.passThreshold}%)`;
          }
        }
      });
    }

    // Hide all but first question
    questionElements.forEach((questionElement, questionIndex) => {
      if (questionIndex !== 0) questionElement.classList.add('is-hidden');
    });

    buildProgressDots();

    const quizHeaderElement = containerElement.querySelector('.quiz__header');
    const quizScoreElement = containerElement.querySelector('.quiz__score');
    if (quizHeaderElement !== null && quizScoreElement !== null) {
      const badgeElement = document.createElement('span');
      badgeElement.className = `quiz__difficulty quiz__difficulty--${quizDifficulty.tierClass}`;
      badgeElement.textContent = `${quizDifficulty.name} • target ${quizDifficulty.passThreshold}%`;
      quizHeaderElement.insertBefore(badgeElement, quizScoreElement);
    }
  });
}

// ── Page Init ─────────────────────────────────────────────────────
function initPage() {
  initCodeCopyButtons();
  initTocHighlighting();
  initCompletionButton();
  initGuideToggles();
  initNavActiveState();
  initProblemCardBadges();
  initInterviewModeBlocks();

  // Boot data-attribute quizzes (primary format)
  const quizContainerElements = document.querySelectorAll('.quiz[data-quiz-id]');
  quizContainerElements.forEach(containerElement => new QuizEngine(containerElement));

  // Boot inline quizzes (fallback format used by some problem pages)
  initInlineQuizzes();
}

document.addEventListener('DOMContentLoaded', initPage);

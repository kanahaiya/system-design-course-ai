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
          ? 'Perfect! You nailed it.'
          : percentage >= 60
            ? `${correctCount} of ${questions.length} correct — review the explanations above.`
            : `${correctCount} of ${questions.length} correct — revisit this module before moving on.`;
      }
    }

    if (quizId !== undefined && quizId !== null) {
      saveQuizScore(quizId, percentage);
    }
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

// ── Inline Quiz Engine (alternative format with data-correct on buttons) ──
function initInlineQuizzes() {
  const quizContainerElements = document.querySelectorAll('.quiz:not([data-quiz-id])');
  quizContainerElements.forEach(containerElement => {
    const questionElements = containerElement.querySelectorAll('.quiz__question');
    if (questionElements.length === 0) return;

    let currentQuestionIndex = 0;
    let correctCount = 0;

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
            labelElement.textContent = percentage === 100
              ? 'Perfect score!' : `${correctCount}/${questionElements.length} correct`;
          }
        }
      });
    }

    // Hide all but first question
    questionElements.forEach((questionElement, questionIndex) => {
      if (questionIndex !== 0) questionElement.classList.add('is-hidden');
    });

    buildProgressDots();
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

  // Boot data-attribute quizzes (primary format)
  const quizContainerElements = document.querySelectorAll('.quiz[data-quiz-id]');
  quizContainerElements.forEach(containerElement => new QuizEngine(containerElement));

  // Boot inline quizzes (fallback format used by some problem pages)
  initInlineQuizzes();
}

document.addEventListener('DOMContentLoaded', initPage);

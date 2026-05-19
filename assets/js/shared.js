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
const STORAGE_KEY_ACCOUNT = 'sdcourse_account_v1';
const STORAGE_KEY_PLAN = 'sdcourse_plan_v1';
const STORAGE_KEY_ONBOARDING = 'sdcourse_onboarding_v1';
const STORAGE_KEY_WAITLIST = 'sdcourse_waitlist_v1';
const STORAGE_KEY_FEEDBACK = 'sdcourse_feedback_v1';
const STORAGE_KEY_ANALYTICS = 'sdcourse_analytics_events_v1';
const STORAGE_KEY_LAUNCH_CONFIG = 'sdcourse_launch_config_v1';
const WAITLIST_ENDPOINT_KEY = 'waitlist';
const FEEDBACK_ENDPOINT_KEY = 'feedback';
const ENTITLEMENT_ENDPOINT_KEY = 'entitlement';

let cachedSupabaseClientPromise = null;
let runtimeEntitlementState = { plan: 'free', status: 'inactive' };

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
    return Array.from(questionElements)
      .map(questionElement => {
        try {
          const optionJsonText = questionElement.dataset.options ?? '[]';
          const parsedOptions = JSON.parse(optionJsonText);
          const parsedCorrectIndex = parseInt(questionElement.dataset.correct ?? '0', 10);
          if (!Array.isArray(parsedOptions) || Number.isNaN(parsedCorrectIndex)) return null;
          return {
            text: questionElement.dataset.question ?? '',
            options: parsedOptions,
            correctIndex: parsedCorrectIndex,
            explanation: questionElement.dataset.explanation ?? '',
          };
        } catch {
          return null;
        }
      })
      .filter(questionData => questionData !== null);
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

function convertDataQuizToInlineQuiz(containerElement) {
  if (containerElement.dataset.quizId === undefined) return false;
  const hiddenQuestionElements = Array.from(containerElement.querySelectorAll('[data-question]'));
  if (hiddenQuestionElements.length === 0) return false;

  const existingQuestionElement = containerElement.querySelector('.quiz__question');
  if (existingQuestionElement === null) return false;

  const questionElements = hiddenQuestionElements.map((questionElement, questionIndex) => {
    let options = [];
    try {
      options = JSON.parse(questionElement.dataset.options ?? '[]');
    } catch {
      options = [];
    }
    if (!Array.isArray(options) || options.length === 0) return null;

    const correctIndex = parseInt(questionElement.dataset.correct ?? '-1', 10);
    if (Number.isNaN(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return null;

    const inlineQuestionElement = document.createElement('div');
    inlineQuestionElement.className = `quiz__question${questionIndex === 0 ? '' : ' is-hidden'}`;

    const questionNumberElement = document.createElement('div');
    questionNumberElement.className = 'quiz__question-number';
    questionNumberElement.textContent = `Question ${questionIndex + 1} of ${hiddenQuestionElements.length}`;
    inlineQuestionElement.appendChild(questionNumberElement);

    const questionTextElement = document.createElement('div');
    questionTextElement.className = 'quiz__question-text';
    questionTextElement.textContent = questionElement.dataset.question ?? '';
    inlineQuestionElement.appendChild(questionTextElement);

    const optionsElement = document.createElement('div');
    optionsElement.className = 'quiz__options';
    optionsElement.setAttribute('role', 'group');
    optionsElement.setAttribute('aria-label', 'Answer options');

    options.forEach((optionText, optionIndex) => {
      const optionButtonElement = document.createElement('button');
      optionButtonElement.className = 'quiz__option';
      optionButtonElement.setAttribute('type', 'button');
      optionButtonElement.dataset.correct = String(optionIndex === correctIndex);
      optionButtonElement.innerHTML = `
        <span class="quiz__option-letter">${String.fromCharCode(65 + optionIndex)}</span>
        <span>${optionText}</span>
      `;
      optionsElement.appendChild(optionButtonElement);
    });
    inlineQuestionElement.appendChild(optionsElement);

    const explanationElement = document.createElement('div');
    explanationElement.className = 'quiz__explanation';
    explanationElement.setAttribute('role', 'alert');
    explanationElement.setAttribute('aria-live', 'polite');
    explanationElement.textContent = questionElement.dataset.explanation ?? '';
    inlineQuestionElement.appendChild(explanationElement);

    return inlineQuestionElement;
  }).filter(questionElement => questionElement !== null);

  if (questionElements.length === 0) return false;

  const quizId = containerElement.dataset.quizId;
  existingQuestionElement.replaceWith(...questionElements);
  hiddenQuestionElements.forEach(questionElement => questionElement.remove());

  if (quizId !== undefined) {
    containerElement.dataset.quizKey = quizId;
  }
  delete containerElement.dataset.quizId;
  return true;
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

// ── Diagram Motion Enhancer (global, non-intrusive) ───────────────
function getEnhanceableDiagramSvgs() {
  const moduleContentElement = document.querySelector('.module-content');
  if (moduleContentElement === null) return [];

  const allSvgElements = Array.from(moduleContentElement.querySelectorAll('svg'));
  return allSvgElements.filter(svgElement => {
    if (!(svgElement instanceof SVGElement)) return false;
    const drawableCount = svgElement.querySelectorAll('line, path, polyline, rect, circle, ellipse').length;
    return drawableCount >= 4;
  });
}

function initDiagramMotionEnhancer() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const svgElements = getEnhanceableDiagramSvgs();
  svgElements.forEach(svgElement => {
    if (!(svgElement instanceof SVGElement)) return;
    if (svgElement.dataset.motionEnhanced === 'true') return;
    svgElement.dataset.motionEnhanced = 'true';

    const lineLikeElements = svgElement.querySelectorAll('line, path, polyline');
    lineLikeElements.forEach((shapeElement, shapeIndex) => {
      if (shapeElement.querySelector('animate') !== null) return;
      const strokeColor = shapeElement.getAttribute('stroke');
      if (strokeColor === null || strokeColor === 'none') return;

      const hasDashArray = shapeElement.hasAttribute('stroke-dasharray');
      if (!hasDashArray) {
        shapeElement.setAttribute('stroke-dasharray', '8 6');
      }
      const animateElement = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
      animateElement.setAttribute('attributeName', 'stroke-dashoffset');
      animateElement.setAttribute('values', hasDashArray ? '10;0' : '14;0');
      animateElement.setAttribute('dur', `${1.6 + (shapeIndex % 5) * 0.2}s`);
      animateElement.setAttribute('repeatCount', 'indefinite');
      shapeElement.appendChild(animateElement);
    });

    const nodeElements = svgElement.querySelectorAll('rect, circle, ellipse');
    nodeElements.forEach((nodeElement, nodeIndex) => {
      if (nodeElement.querySelector('animate[attributeName=\"opacity\"]') !== null) return;
      const fillColor = nodeElement.getAttribute('fill');
      if (fillColor === null || fillColor === 'none') return;

      const animateOpacityElement = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
      animateOpacityElement.setAttribute('attributeName', 'opacity');
      animateOpacityElement.setAttribute('values', '0.92;1;0.92');
      animateOpacityElement.setAttribute('dur', `${2 + (nodeIndex % 4) * 0.3}s`);
      animateOpacityElement.setAttribute('repeatCount', 'indefinite');
      nodeElement.appendChild(animateOpacityElement);
    });
  });
}

function initDiagramInteractivityEnhancer() {
  const svgElements = getEnhanceableDiagramSvgs();
  svgElements.forEach(svgElement => {
    if (!(svgElement instanceof SVGElement)) return;
    if (svgElement.dataset.interactiveEnhanced === 'true') return;
    svgElement.dataset.interactiveEnhanced = 'true';

    const interactiveElements = Array.from(
      svgElement.querySelectorAll('line, path, polyline, rect, circle, ellipse, text')
    );
    if (interactiveElements.length === 0) return;

    let pinnedGroupId = null;
    const elementGroupIdMap = new Map();
    const groupedElementsMap = new Map();

    interactiveElements.forEach((element, index) => {
      if (!(element instanceof SVGElement)) return;
      element.dataset.interactiveId = `diagram-element-${index}`;
      element.style.transition = 'opacity 140ms ease, filter 140ms ease, stroke-width 140ms ease';

      const nearestGroupedAncestor = element.closest('[data-diagram-group]');
      const groupId = nearestGroupedAncestor instanceof SVGElement
        ? nearestGroupedAncestor.getAttribute('data-diagram-group') ?? `group-default-${index}`
        : `group-default-${index}`;
      elementGroupIdMap.set(element, groupId);
      const groupedElements = groupedElementsMap.get(groupId) ?? [];
      groupedElements.push(element);
      groupedElementsMap.set(groupId, groupedElements);
    });

    const setFocusByGroup = (activeGroupId) => {
      interactiveElements.forEach(element => {
        const isActive = elementGroupIdMap.get(element) === activeGroupId;
        element.style.opacity = isActive ? '1' : '0.28';
        element.style.filter = isActive ? 'drop-shadow(0 0 4px rgba(99, 102, 241, 0.55))' : 'none';
        if (isActive && (element.tagName === 'line' || element.tagName === 'path' || element.tagName === 'polyline')) {
          const currentStrokeWidth = parseFloat(element.getAttribute('stroke-width') ?? '1.2');
          element.style.strokeWidth = `${Math.max(currentStrokeWidth, 1.2) + 0.6}`;
        } else {
          element.style.strokeWidth = '';
        }
      });
    };

    const clearFocus = () => {
      interactiveElements.forEach(element => {
        element.style.opacity = '';
        element.style.filter = 'none';
        element.style.strokeWidth = '';
      });
    };

    svgElement.addEventListener('mouseover', event => {
      if (pinnedGroupId !== null) return;
      const targetElement = event.target;
      if (!(targetElement instanceof SVGElement)) return;
      const interactiveTarget = targetElement.closest('line, path, polyline, rect, circle, ellipse, text');
      if (interactiveTarget === null || !svgElement.contains(interactiveTarget)) return;
      const groupId = elementGroupIdMap.get(interactiveTarget);
      if (groupId === undefined) return;
      setFocusByGroup(groupId);
    });

    svgElement.addEventListener('mouseleave', () => {
      if (pinnedGroupId !== null) return;
      clearFocus();
    });

    svgElement.addEventListener('click', event => {
      const targetElement = event.target;
      if (!(targetElement instanceof SVGElement)) return;
      const interactiveTarget = targetElement.closest('line, path, polyline, rect, circle, ellipse, text');
      if (interactiveTarget === null || !svgElement.contains(interactiveTarget)) return;
      const groupId = elementGroupIdMap.get(interactiveTarget);
      if (groupId === undefined) return;

      if (pinnedGroupId === groupId) {
        pinnedGroupId = null;
        clearFocus();
        return;
      }
      pinnedGroupId = groupId;
      setFocusByGroup(groupId);
    });
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

// ── Phase 1 Monetization ──────────────────────────────────────────
function initPhaseOneLaunch() {
  injectNavLinks();
  initAccountForm();
  initOnboardingForm();
  initPricingCheckoutActions();
  updateAccountUi().catch(() => {});
  enforcePremiumRouteAccess().catch(() => {});
  gatePremiumLinks();
}

function injectNavLinks() {
  const navListElement = document.querySelector('.site-nav__links');
  if (navListElement === null) return;
  const hasPricingLink = navListElement.querySelector('a[href*="pricing/index.html"]');
  if (hasPricingLink === null) {
    const pricingItemElement = document.createElement('li');
    pricingItemElement.innerHTML = '<a href="/pricing/index.html" class="site-nav__link">Pricing</a>';
    navListElement.appendChild(pricingItemElement);
  }

  const hasAccountLink = navListElement.querySelector('a[href*="account/index.html"]');
  if (hasAccountLink === null) {
    const accountItemElement = document.createElement('li');
    accountItemElement.innerHTML = '<a href="/account/index.html" class="site-nav__link">Account</a>';
    navListElement.appendChild(accountItemElement);
  }
}

function getPathname() {
  return window.location.pathname.replace(/\/{2,}/g, '/');
}

async function getSupabaseAuthClient() {
  if (cachedSupabaseClientPromise !== null) return cachedSupabaseClientPromise;

  cachedSupabaseClientPromise = (async () => {
    const launchConfig = getLaunchConfig();
    const supabaseAuth = launchConfig.supabaseAuth;
    if (supabaseAuth === undefined || supabaseAuth === null || typeof supabaseAuth !== 'object') {
      return null;
    }
    const supabaseUrl = typeof supabaseAuth.url === 'string' ? supabaseAuth.url.trim() : '';
    const supabaseAnonKey = typeof supabaseAuth.anonKey === 'string' ? supabaseAuth.anonKey.trim() : '';
    if (supabaseUrl === '' || supabaseAnonKey === '') {
      return null;
    }
    const supabaseModule = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
    return supabaseModule.createClient(supabaseUrl, supabaseAnonKey);
  })();

  return cachedSupabaseClientPromise;
}

function getEntitlementEndpoint() {
  const providerConfig = getFormProviderConfig(ENTITLEMENT_ENDPOINT_KEY);
  if (providerConfig !== null) {
    const endpoint = typeof providerConfig.endpoint === 'string' ? providerConfig.endpoint.trim() : '';
    return endpoint.length > 0 ? endpoint : null;
  }
  return getFormEndpoint(ENTITLEMENT_ENDPOINT_KEY);
}

async function fetchRuntimeEntitlement() {
  const supabaseClient = await getSupabaseAuthClient();
  if (supabaseClient === null) {
    runtimeEntitlementState = { plan: 'free', status: 'inactive' };
    return runtimeEntitlementState;
  }

  const entitlementEndpoint = getEntitlementEndpoint();
  if (entitlementEndpoint === null) {
    runtimeEntitlementState = { plan: 'free', status: 'inactive' };
    return runtimeEntitlementState;
  }

  const sessionResult = await supabaseClient.auth.getSession();
  const accessToken = sessionResult.data.session?.access_token ?? null;
  if (accessToken === null) {
    runtimeEntitlementState = { plan: 'free', status: 'inactive' };
    return runtimeEntitlementState;
  }

  const launchConfig = getLaunchConfig();
  const supabaseAuth = launchConfig.supabaseAuth ?? {};
  const anonKey = typeof supabaseAuth.anonKey === 'string' ? supabaseAuth.anonKey.trim() : '';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
  if (anonKey !== '') {
    headers.apikey = anonKey;
  }

  try {
    const response = await fetch(entitlementEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: window.location.pathname }),
    });
    if (!response.ok) {
      runtimeEntitlementState = { plan: 'free', status: 'inactive' };
      return runtimeEntitlementState;
    }
    const entitlementPayload = await response.json();
    runtimeEntitlementState = {
      plan: String(entitlementPayload.plan ?? 'free'),
      status: String(entitlementPayload.status ?? 'inactive'),
    };
    return runtimeEntitlementState;
  } catch {
    runtimeEntitlementState = { plan: 'free', status: 'inactive' };
    return runtimeEntitlementState;
  }
}

function isRuntimeProPlan() {
  return runtimeEntitlementState.plan === 'pro_monthly' || runtimeEntitlementState.plan === 'pro_yearly';
}

function getCheckoutUrl(planCode) {
  const launchConfig = getLaunchConfig();
  const checkoutUrls = launchConfig.checkoutUrls;
  if (checkoutUrls === undefined || checkoutUrls === null || typeof checkoutUrls !== 'object') {
    return null;
  }
  const urlValue = checkoutUrls[planCode];
  if (typeof urlValue !== 'string' || urlValue.trim().length === 0) {
    return null;
  }
  return urlValue.trim();
}

function isPremiumPath(pathname) {
  if (pathname.includes('/pricing/') || pathname.includes('/account/') || pathname.includes('/onboarding/')) {
    return false;
  }
  if (pathname.includes('/modules/13-advanced-concepts/')) return true;
  if (pathname.includes('/problems/tier3/')) return true;
  if (pathname.includes('/mock-interview/')) return true;
  return false;
}

async function enforcePremiumRouteAccess() {
  const pathname = getPathname();
  if (!isPremiumPath(pathname)) return;
  await fetchRuntimeEntitlement();
  if (isRuntimeProPlan()) return;
  if (document.querySelector('.paywall-overlay') !== null) return;

  const paywallOverlayElement = document.createElement('div');
  paywallOverlayElement.className = 'paywall-overlay';
  paywallOverlayElement.innerHTML = `
    <section class="paywall-card" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
      <h2 id="paywall-title" style="margin-bottom:var(--space-3)">This section is part of Pro</h2>
      <p style="color:var(--color-text-secondary);margin-bottom:var(--space-5)">
        Upgrade to access staff-level modules, Tier 3 systems, and premium mock interview packs.
      </p>
      <div style="display:flex;gap:var(--space-3);flex-wrap:wrap">
        <a class="btn btn--primary" href="/pricing/index.html">View plans</a>
        <a class="btn btn--outline" href="/index.html">Back to free content</a>
      </div>
    </section>
  `;
  document.body.appendChild(paywallOverlayElement);
}

function gatePremiumLinks() {
  const premiumPathPatterns = ['/modules/13-advanced-concepts/', '/problems/tier3/', '/mock-interview/'];
  document.querySelectorAll('a[href]').forEach(anchorElement => {
    anchorElement.addEventListener('click', async event => {
      const href = anchorElement.getAttribute('href');
      if (href === null || href.startsWith('#')) return;
      const normalizedHref = href.replace('../', '/').replace('./', '/');
      const isPremiumTarget = premiumPathPatterns.some(pattern => normalizedHref.includes(pattern));
      if (!isPremiumTarget) return;
      await fetchRuntimeEntitlement();
      if (isRuntimeProPlan()) return;
      event.preventDefault();
      window.location.href = `/pricing/index.html?next=${encodeURIComponent(href)}`;
    });
  });
}

function initPricingCheckoutActions() {
  const monthlyButtonElement = document.getElementById('js-upgrade-monthly');
  const yearlyButtonElement = document.getElementById('js-upgrade-yearly');
  const monthlyUrl = getCheckoutUrl('proMonthly');
  const yearlyUrl = getCheckoutUrl('proYearly');

  if (monthlyButtonElement !== null) {
    if (monthlyUrl !== null) {
      monthlyButtonElement.setAttribute('href', monthlyUrl);
      monthlyButtonElement.setAttribute('target', '_blank');
      monthlyButtonElement.setAttribute('rel', 'noopener noreferrer');
    } else {
      monthlyButtonElement.setAttribute('href', '#');
      monthlyButtonElement.classList.add('is-disabled');
      monthlyButtonElement.setAttribute('aria-disabled', 'true');
      monthlyButtonElement.textContent = 'Checkout not configured';
    }
  }
  if (yearlyButtonElement !== null) {
    if (yearlyUrl !== null) {
      yearlyButtonElement.setAttribute('href', yearlyUrl);
      yearlyButtonElement.setAttribute('target', '_blank');
      yearlyButtonElement.setAttribute('rel', 'noopener noreferrer');
    } else {
      yearlyButtonElement.setAttribute('href', '#');
      yearlyButtonElement.classList.add('is-disabled');
      yearlyButtonElement.setAttribute('aria-disabled', 'true');
      yearlyButtonElement.textContent = 'Checkout not configured';
    }
  }
}

async function initAccountForm() {
  const authFormElement = document.getElementById('js-auth-form');
  if (authFormElement === null) return;
  const statusElement = document.getElementById('js-auth-status');
  const signOutButtonElement = document.getElementById('js-auth-signout');

  authFormElement.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(authFormElement);
    const emailAddress = String(formData.get('email') ?? '').trim().toLowerCase();
    const supabaseClient = await getSupabaseAuthClient();
    if (supabaseClient === null) {
      if (statusElement !== null) statusElement.textContent = 'Supabase auth is not configured.';
      return;
    }
    const redirectUrl = `${window.location.origin}/account/index.html`;
    const signInResult = await supabaseClient.auth.signInWithOtp({
      email: emailAddress,
      options: { emailRedirectTo: redirectUrl },
    });
    if (signInResult.error !== null) {
      if (statusElement !== null) statusElement.textContent = `Unable to send sign-in link: ${signInResult.error.message}`;
      return;
    }
    if (statusElement !== null) statusElement.textContent = 'Sign-in link sent. Check your email.';
  });

  if (signOutButtonElement !== null) {
    signOutButtonElement.addEventListener('click', async () => {
      const supabaseClient = await getSupabaseAuthClient();
      if (supabaseClient === null) return;
      await supabaseClient.auth.signOut();
      runtimeEntitlementState = { plan: 'free', status: 'inactive' };
      if (statusElement !== null) statusElement.textContent = 'Signed out.';
      await updateAccountUi();
    });
  }
}

function initOnboardingForm() {
  const onboardingFormElement = document.getElementById('js-onboarding-form');
  if (onboardingFormElement === null) return;
  const statusElement = document.getElementById('js-onboarding-status');
  onboardingFormElement.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(onboardingFormElement);
    const onboardingState = {
      level: String(formData.get('level') ?? ''),
      target: String(formData.get('target') ?? ''),
      completedAt: Date.now(),
    };
    try {
      localStorage.setItem(STORAGE_KEY_ONBOARDING, JSON.stringify(onboardingState));
      if (statusElement !== null) statusElement.textContent = 'Onboarding saved. Redirecting to your learning path...';
      const nextPath = onboardingState.level === 'beginner'
        ? '/modules/00b-networking/index.html'
        : '/modules/00-framework/index.html';
      setTimeout(() => { window.location.href = nextPath; }, 400);
    } catch {
      if (statusElement !== null) statusElement.textContent = 'Unable to save onboarding state.';
    }
  });
}

async function updateAccountUi() {
  const planLabelElement = document.getElementById('js-account-plan');
  const invoiceListElement = document.getElementById('js-invoice-list');
  const portalLinkElement = document.getElementById('js-manage-subscription-link');
  const launchConfig = getLaunchConfig();
  const customerPortalUrl = typeof launchConfig.customerPortalUrl === 'string'
    ? launchConfig.customerPortalUrl.trim()
    : '';

  await fetchRuntimeEntitlement();

  if (planLabelElement !== null) {
    const labelMap = {
      free: 'Free',
      pro_monthly: 'Pro Monthly',
      pro_yearly: 'Pro Yearly',
    };
    planLabelElement.textContent = `Current plan: ${labelMap[runtimeEntitlementState.plan] ?? 'Free'} (${runtimeEntitlementState.status})`;
  }

  if (invoiceListElement !== null) {
    invoiceListElement.innerHTML = '<li>Invoices are managed by your payment provider portal.</li>';
  }

  if (portalLinkElement !== null) {
    if (customerPortalUrl.length > 0) {
      portalLinkElement.setAttribute('href', customerPortalUrl);
    } else {
      portalLinkElement.setAttribute('href', '#');
      portalLinkElement.classList.add('is-disabled');
      portalLinkElement.setAttribute('aria-disabled', 'true');
      portalLinkElement.textContent = 'Portal not configured';
    }
  }
}

// ── Phase 0 Launch Foundations ────────────────────────────────────
function initPhaseZeroLaunch() {
  persistLaunchConfig();
  initGa4FromConfig();
  trackAnalyticsPageView();
  initWaitlistForm();
  initFeedbackForm();
}

function initGa4FromConfig() {
  const launchConfig = getLaunchConfig();
  const measurementId = typeof launchConfig.ga4MeasurementId === 'string'
    ? launchConfig.ga4MeasurementId.trim()
    : '';
  if (measurementId === '' || typeof window.gtag === 'function') return;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId);

  const scriptElement = document.createElement('script');
  scriptElement.async = true;
  scriptElement.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(scriptElement);
}

function trackAnalyticsPageView() {
  const analyticsEvent = {
    event: 'page_view',
    path: window.location.pathname,
    title: document.title,
    timestamp: Date.now(),
  };
  appendAnalyticsEvent(analyticsEvent);

  const launchConfig = getLaunchConfig();
  const measurementId = typeof launchConfig.ga4MeasurementId === 'string'
    ? launchConfig.ga4MeasurementId.trim()
    : '';
  if (typeof window.gtag === 'function' && measurementId !== '') {
    window.gtag('config', measurementId, { page_path: window.location.pathname });
  }
}

function appendAnalyticsEvent(eventPayload) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ANALYTICS);
    const events = raw !== null ? JSON.parse(raw) : [];
    events.push(eventPayload);
    localStorage.setItem(STORAGE_KEY_ANALYTICS, JSON.stringify(events.slice(-500)));
  } catch {
    // Ignore local analytics persistence failures.
  }
}

function getLaunchConfig() {
  const globalConfig = window.SD_LAUNCH_CONFIG;
  if (globalConfig !== undefined && globalConfig !== null && typeof globalConfig === 'object') {
    return globalConfig;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAUNCH_CONFIG);
    return raw !== null ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistLaunchConfig() {
  const globalConfig = window.SD_LAUNCH_CONFIG;
  if (globalConfig === undefined || globalConfig === null || typeof globalConfig !== 'object') return;
  try {
    localStorage.setItem(STORAGE_KEY_LAUNCH_CONFIG, JSON.stringify(globalConfig));
  } catch {
    // Ignore localStorage persistence failures.
  }
}

function getFormEndpoint(endpointKey) {
  const launchConfig = getLaunchConfig();
  const formEndpoints = launchConfig.formEndpoints;
  if (formEndpoints === undefined || formEndpoints === null || typeof formEndpoints !== 'object') {
    return null;
  }
  const endpointValue = formEndpoints[endpointKey];
  return typeof endpointValue === 'string' && endpointValue.length > 0 ? endpointValue : null;
}

function getFormProviderConfig(endpointKey) {
  const launchConfig = getLaunchConfig();
  const formProviders = launchConfig.formProviders;
  if (formProviders === undefined || formProviders === null || typeof formProviders !== 'object') {
    return null;
  }
  const providerConfig = formProviders[endpointKey];
  if (providerConfig === undefined || providerConfig === null || typeof providerConfig !== 'object') {
    return null;
  }
  return providerConfig;
}

function buildFormPayload(payload) {
  return {
    ...payload,
    sourcePage: window.location.pathname,
    submittedAtIso: new Date(payload.createdAt).toISOString(),
  };
}

async function submitToRemoteEndpoint(endpointKey, payload) {
  const normalizedPayload = buildFormPayload(payload);
  try {
    const providerConfig = getFormProviderConfig(endpointKey);
    if (providerConfig !== null) {
      const providerName = String(providerConfig.provider ?? '').toLowerCase();
      const endpointUrl = typeof providerConfig.endpoint === 'string' ? providerConfig.endpoint : '';
      if (endpointUrl.length === 0) return false;

      if (providerName === 'formspree') {
        const response = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(normalizedPayload),
        });
        return response.ok;
      }

      if (providerName === 'supabase') {
        const anonKey = typeof providerConfig.anonKey === 'string' ? providerConfig.anonKey : '';
        const headers = {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        };
        const response = await fetch(endpointUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(normalizedPayload),
        });
        return response.ok;
      }
    }

    const endpointUrl = getFormEndpoint(endpointKey);
    if (endpointUrl === null) return false;
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedPayload),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function initWaitlistForm() {
  const waitlistFormElement = document.getElementById('js-waitlist-form');
  if (waitlistFormElement === null) return;
  const statusElement = document.getElementById('js-waitlist-status');
  waitlistFormElement.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(waitlistFormElement);
    const waitlistEntry = {
      email: String(formData.get('email') ?? ''),
      focus: String(formData.get('focus') ?? ''),
      company: String(formData.get('company') ?? ''),
      createdAt: Date.now(),
    };
    const submittedRemotely = await submitToRemoteEndpoint(WAITLIST_ENDPOINT_KEY, waitlistEntry);
    try {
      const raw = localStorage.getItem(STORAGE_KEY_WAITLIST);
      const entries = raw !== null ? JSON.parse(raw) : [];
      entries.push(waitlistEntry);
      localStorage.setItem(STORAGE_KEY_WAITLIST, JSON.stringify(entries.slice(-1000)));
      appendAnalyticsEvent({ event: 'waitlist_signup', path: window.location.pathname, timestamp: Date.now() });
      waitlistFormElement.reset();
      if (statusElement !== null) {
        statusElement.textContent = submittedRemotely
          ? 'Thanks — your waitlist request was sent.'
          : 'Thanks — your request is saved locally until remote endpoint is configured.';
      }
    } catch {
      if (statusElement !== null) statusElement.textContent = 'Unable to save your waitlist request right now.';
    }
  });
}

function initFeedbackForm() {
  const feedbackFormElement = document.getElementById('js-feedback-form');
  if (feedbackFormElement === null) return;
  const statusElement = document.getElementById('js-feedback-status');
  feedbackFormElement.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(feedbackFormElement);
    const feedbackEntry = {
      type: String(formData.get('type') ?? ''),
      email: String(formData.get('email') ?? ''),
      message: String(formData.get('message') ?? ''),
      company: String(formData.get('company') ?? ''),
      createdAt: Date.now(),
    };
    const submittedRemotely = await submitToRemoteEndpoint(FEEDBACK_ENDPOINT_KEY, feedbackEntry);
    try {
      const raw = localStorage.getItem(STORAGE_KEY_FEEDBACK);
      const entries = raw !== null ? JSON.parse(raw) : [];
      entries.push(feedbackEntry);
      localStorage.setItem(STORAGE_KEY_FEEDBACK, JSON.stringify(entries.slice(-1000)));
      appendAnalyticsEvent({ event: 'feedback_submit', type: feedbackEntry.type, path: window.location.pathname, timestamp: Date.now() });
      feedbackFormElement.reset();
      if (statusElement !== null) {
        statusElement.textContent = submittedRemotely
          ? 'Feedback sent successfully. Thank you.'
          : 'Feedback saved locally until remote endpoint is configured.';
      }
    } catch {
      if (statusElement !== null) statusElement.textContent = 'Unable to save feedback right now.';
    }
  });
}

// ── Inline Quiz Engine (alternative format with data-correct on buttons) ──
function initInlineQuizzes() {
  const quizContainerElements = document.querySelectorAll('.quiz');
  quizContainerElements.forEach(containerElement => {
    const questionElements = Array.from(containerElement.querySelectorAll('.quiz__question'));
    if (questionElements.length === 0) return;
    const hasInlineOptionButtons = containerElement.querySelector('.quiz__option[data-correct]') !== null;
    const hasDataQuestionNodes = containerElement.querySelector('[data-question]') !== null;
    if (!hasInlineOptionButtons || hasDataQuestionNodes) return;

    let currentQuestionIndex = 0;
    let correctCount = 0;
    const quizDifficulty = getQuizDifficultySettings();
    const quizStorageKey = containerElement.dataset.quizKey ?? containerElement.dataset.quizId;

    ensureInlineQuizControls(containerElement);

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

    function handleInlineAnswerSelection(optionButtonElement) {
      const questionElement = optionButtonElement.closest('.quiz__question');
      if (questionElement === null) return;
      const questionIndex = questionElements.findIndex(element => element === questionElement);
      if (questionIndex < 0) return;

      const isAlreadyAnswered = questionElement.querySelector('.quiz__option--correct') !== null ||
                                questionElement.querySelector('.quiz__option--wrong') !== null;
      if (isAlreadyAnswered) return;

      const optionButtonElements = questionElement.querySelectorAll('.quiz__option');
      const isCorrect = optionButtonElement.dataset.correct === 'true';
      if (isCorrect) {
        optionButtonElement.classList.add('quiz__option--correct');
        correctCount++;
      } else {
        optionButtonElement.classList.add('quiz__option--wrong');
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
      if (questionIndex + 1 < questionElements.length && dotElements[questionIndex + 1] !== undefined) {
        dotElements[questionIndex + 1].classList.add('quiz__progress-dot--current');
      }

      const nextButtonElement = containerElement.querySelector('.js-quiz-next');
      if (nextButtonElement !== null) nextButtonElement.classList.remove('is-hidden');

      const explanationElement = questionElement.querySelector('.quiz__explanation');
      if (explanationElement !== null) {
        if (explanationElement.textContent === null || explanationElement.textContent.trim() === '') {
          explanationElement.textContent = isCorrect
            ? 'Correct. Great job — move to the next question.'
            : 'Not quite. Review the highlighted correct option, then continue.';
        }
        explanationElement.classList.add('quiz__explanation--visible');
      }
    }

    containerElement.addEventListener('click', event => {
      const targetElement = event.target;
      if (!(targetElement instanceof Element)) return;
      const optionButtonElement = targetElement.closest('.quiz__option');
      if (optionButtonElement === null) return;
      if (!containerElement.contains(optionButtonElement)) return;
      handleInlineAnswerSelection(optionButtonElement);
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
          if (quizStorageKey !== undefined && quizStorageKey !== null) {
            try {
              const raw = localStorage.getItem(STORAGE_KEY_QUIZ);
              const scores = raw !== null ? JSON.parse(raw) : {};
              scores[quizStorageKey] = { score: percentage, takenAt: Date.now() };
              localStorage.setItem(STORAGE_KEY_QUIZ, JSON.stringify(scores));
            } catch {
              // Non-critical; ignore storage failures
            }
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

function ensureInlineQuizControls(containerElement) {
  const progressElement = containerElement.querySelector('.quiz__progress');
  if (progressElement === null) {
    const injectedProgressElement = document.createElement('div');
    injectedProgressElement.className = 'quiz__progress';
    injectedProgressElement.setAttribute('aria-label', 'Quiz progress');
    injectedProgressElement.setAttribute('role', 'progressbar');
    containerElement.appendChild(injectedProgressElement);
  }

  const actionsElement = containerElement.querySelector('.quiz__actions');
  if (actionsElement === null) {
    const injectedActionsElement = document.createElement('div');
    injectedActionsElement.className = 'quiz__actions';
    injectedActionsElement.innerHTML = `
      <div></div>
      <button class="btn btn--primary btn--sm js-quiz-next is-hidden" type="button">Next →</button>
    `;
    containerElement.appendChild(injectedActionsElement);
  } else if (actionsElement.querySelector('.js-quiz-next') === null) {
    const nextButtonElement = document.createElement('button');
    nextButtonElement.className = 'btn btn--primary btn--sm js-quiz-next is-hidden';
    nextButtonElement.setAttribute('type', 'button');
    nextButtonElement.textContent = 'Next →';
    actionsElement.appendChild(nextButtonElement);
  }

  const resultElement = containerElement.querySelector('.quiz__result');
  if (resultElement === null) {
    const injectedResultElement = document.createElement('div');
    injectedResultElement.className = 'quiz__result is-hidden';
    injectedResultElement.setAttribute('aria-live', 'polite');
    injectedResultElement.innerHTML = `
      <div class="quiz__result-score"></div>
      <div class="quiz__result-label"></div>
      <div style="margin-top:var(--space-4)">
        <button class="btn btn--outline btn--sm js-quiz-retry" type="button">Try Again</button>
      </div>
    `;
    containerElement.appendChild(injectedResultElement);
  }
}

// ── Page Init ─────────────────────────────────────────────────────
function initPage() {
  const runSafely = (initializerFunction) => {
    try {
      initializerFunction();
    } catch (error) {
      console.error('[shared.initPage] initializer failed:', error);
    }
  };

  runSafely(initPhaseZeroLaunch);
  runSafely(initCodeCopyButtons);
  runSafely(initTocHighlighting);
  runSafely(initCompletionButton);
  runSafely(initGuideToggles);
  runSafely(initNavActiveState);
  runSafely(initProblemCardBadges);
  runSafely(initInterviewModeBlocks);
  runSafely(initPhaseOneLaunch);
  runSafely(initDiagramMotionEnhancer);
  runSafely(initDiagramInteractivityEnhancer);

  runSafely(() => {
    const quizContainerElements = document.querySelectorAll('.quiz[data-quiz-id]');
    quizContainerElements.forEach(containerElement => {
      convertDataQuizToInlineQuiz(containerElement);
    });
  });

  runSafely(() => {
    const quizContainerElements = document.querySelectorAll('.quiz[data-quiz-id]');
    quizContainerElements.forEach(containerElement => new QuizEngine(containerElement));
  });

  runSafely(initInlineQuizzes);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}

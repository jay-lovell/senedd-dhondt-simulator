/* ============================================================
   Senedd D'Hondt Simulator – script.js
   ============================================================ */
'use strict';

// ── Party data (alphabetical) ────────────────────────────
const PARTIES = [
  { name: 'Conservative',      abbr: 'CON', color: '#0087DC', text: '#fff' },
  { name: 'Green',             abbr: 'GRN', color: '#00B140', text: '#fff' },
  { name: 'Independents',      abbr: 'IND', color: '#6B7280', text: '#fff' },
  { name: 'Labour',            abbr: 'LAB', color: '#E4003B', text: '#fff' },
  { name: 'Lib Dems',          abbr: 'LD',  color: '#FAA61A', text: '#000' },
  { name: 'Plaid Cymru',       abbr: 'PC',  color: '#005B54', text: '#fff' },
  { name: 'Reform UK',         abbr: 'REF', color: '#12B6CF', text: '#fff' },
];

const IND_IDX            = PARTIES.findIndex(p => p.abbr === 'IND');
const NUM_SEATS          = 6;
const ELECTORATE_MIN     = 122883;
const ELECTORATE_MAX     = 152545;

// ── Application state ────────────────────────────────────
const state = {
  percentages:    Array(PARTIES.length).fill(0),
  turnout:        60,
  electorate:     0,
  totalVotes:     0,
  partyVotes:     Array(PARTIES.length).fill(0),
  dhondtSteps:    [],
  stepIndex:      0,
  seatHistory:    [],   // party index for each seat, in order
  indCandidates:  2,    // max seats Independents can win
};

// ── Utilities ────────────────────────────────────────────
const fmt = n => Math.round(n).toLocaleString('en-GB');
const rand = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function showPhase(id) {
  document.querySelectorAll('.phase').forEach(p => p.classList.remove('active'));
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  });
}

// ════════════════════════════════════════════════════════════
// PHASE 1 – INPUT
// ════════════════════════════════════════════════════════════
function initInputPhase() {
  // Reset state
  state.percentages = Array(PARTIES.length).fill(0);
  state.turnout = 60;

  const grid = document.getElementById('party-inputs');
  grid.innerHTML = '';

  PARTIES.forEach((party, i) => {
    const card = document.createElement('div');
    card.className = 'party-input-card';
    const isIND = i === IND_IDX;
    card.innerHTML = `
      <div class="party-input-label">
        <div class="party-dot" style="background:${party.color}"></div>
        <span>${party.name}</span>
      </div>
      <div class="pct-input-wrapper">
        <input type="number" class="party-number-input"
               id="pct-num-${i}" data-idx="${i}"
               min="0" max="100" step="1" value="0"
               aria-label="${party.name} vote percentage">
        <span class="pct-suffix">%</span>
      </div>
      <input type="range" class="party-slider"
             id="pct-slider-${i}" data-idx="${i}"
             min="0" max="100" step="1" value="0"
             style="accent-color:${party.color}"
             aria-label="${party.name} vote percentage slider">
      ${isIND ? `
      <div class="ind-cand-row">
        <label class="ind-cand-label" for="ind-candidates">Candidates:</label>
        <input type="number" id="ind-candidates" class="ind-cand-input"
               min="0" max="${NUM_SEATS}" step="1" value="${state.indCandidates}"
               aria-label="Number of independent candidates standing">
      </div>` : ''}
    `;
    grid.appendChild(card);
  });

  grid.addEventListener('input', e => {
    if (e.target.id === 'ind-candidates') {
      state.indCandidates = Math.max(0, Math.min(NUM_SEATS,
        Number.parseInt(e.target.value, 10) || 0));
      return;
    }
    const isSlider = e.target.classList.contains('party-slider');
    const isNumber = e.target.classList.contains('party-number-input');
    if (!isSlider && !isNumber) return;
    const i = +e.target.dataset.idx;
    const otherSum = state.percentages.reduce((a, b, j) => j === i ? a : a + b, 0);
    const maxAllowed = 100 - otherSum;
    const rawVal = +e.target.value;
    const newVal = Math.max(0, Math.min(isNaN(rawVal) ? 0 : rawVal, maxAllowed));
    state.percentages[i] = newVal;
    document.getElementById(`pct-slider-${i}`).value = newVal;
    document.getElementById(`pct-num-${i}`).value = newVal;
    updateTotal();
  });

  const turnoutSlider  = document.getElementById('turnout-slider');
  const turnoutDisplay = document.getElementById('turnout-display');
  turnoutSlider.value = 60;
  turnoutDisplay.textContent = '60%';
  turnoutSlider.oninput = () => {
    state.turnout = +turnoutSlider.value;
    turnoutDisplay.textContent = `${state.turnout}%`;
  };

  document.getElementById('btn-reset').onclick   = resetInputs;
  document.getElementById('btn-confirm').onclick = confirmInputs;

  updateTotal();
}

function updateTotal() {
  const total = state.percentages.reduce((a, b) => a + b, 0);
  document.getElementById('total-pct').textContent = total;
  const warn = document.getElementById('total-warning');
  if (total > 100) {
    warn.className = 'warning';
    warn.textContent = '⚠ Exceeds 100%';
  } else if (total === 100) {
    warn.className = 'ok';
    warn.textContent = '✓';
  } else {
    warn.className = '';
    warn.textContent = `(${100 - total}% unallocated)`;
  }
}

function resetInputs() {
  state.percentages = Array(PARTIES.length).fill(0);
  PARTIES.forEach((_, i) => {
    document.getElementById(`pct-slider-${i}`).value = 0;
    document.getElementById(`pct-num-${i}`).value = 0;
  });
  document.getElementById('turnout-slider').value = 60;
  document.getElementById('turnout-display').textContent = '60%';
  state.turnout = 60;
  state.indCandidates = 2;
  const indCandEl = document.getElementById('ind-candidates');
  if (indCandEl) indCandEl.value = 2;
  clearInputError();
  updateTotal();
}

function showInputError(msg) {
  let err = document.getElementById('input-error');
  if (!err) {
    err = document.createElement('p');
    err.id = 'input-error';
    err.className = 'input-error';
    // Insert before the panel footer
    const footer = document.querySelector('.panel-footer');
    footer.parentNode.insertBefore(err, footer);
  }
  err.textContent = msg;
  err.style.display = 'block';
}

function clearInputError() {
  const err = document.getElementById('input-error');
  if (err) err.style.display = 'none';
}

function confirmInputs() {
  const total = state.percentages.reduce((a, b) => a + b, 0);
  if (total === 0) {
    showInputError('Enter vote percentages for at least one party.');
    return;
  }
  clearInputError();
  state.electorate    = rand(ELECTORATE_MIN, ELECTORATE_MAX);
  state.turnout       = +document.getElementById('turnout-slider').value;
  state.indCandidates = Math.max(0, Math.min(NUM_SEATS,
    Number.parseInt(document.getElementById('ind-candidates')?.value ?? '2', 10) || 0));
  state.totalVotes = Math.round(state.electorate * (state.turnout / 100));
  state.partyVotes = state.percentages.map(pct =>
    Math.round(state.totalVotes * (pct / 100))
  );
  initCalcPhase();
}

// ════════════════════════════════════════════════════════════
// PHASE 2 – CALCULATION TABLE
// ════════════════════════════════════════════════════════════
async function initCalcPhase() {
  showPhase('phase-calc');

  const tbody = document.getElementById('calc-tbody');
  tbody.innerHTML = '';

  // Build rows
  const rows = [
    { label: 'Pontypandy Population',  value: fmt(state.electorate),  cls: '' },
    { label: 'Turnout',                value: `${state.turnout}%`,    cls: '' },
    { label: 'Total Votes Cast',       value: fmt(state.totalVotes),  cls: 'total-row' },
    { label: '',                       value: '',                     cls: 'sep-row' },
    ...PARTIES.map((p, i) => ({
      label: p.name, value: fmt(state.partyVotes[i]),
      cls: 'party-row', color: p.color,
    })),
  ];

  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = row.cls;
    if (row.color) tr.style.borderLeft = `3px solid ${row.color}`;
    tr.innerHTML = `<td>${row.label}</td><td>${row.value}</td>`;
    tbody.appendChild(tr);
  });

  // Stagger rows in
  const trs = tbody.querySelectorAll('tr');
  for (const tr of trs) {
    await sleep(220);
    tr.classList.add('visible');
  }

  const proceedBtn = document.getElementById('btn-to-ballot');
  proceedBtn.style.display = 'inline-block';
  // Remove any old listener first
  proceedBtn.replaceWith(proceedBtn.cloneNode(true));
  document.getElementById('btn-to-ballot').onclick = initBallotPhase;
}

// ════════════════════════════════════════════════════════════
// PHASE 3 – BALLOT BOXES  (falling votes + sort)
// ════════════════════════════════════════════════════════════
async function initBallotPhase() {
  showPhase('phase-ballot');

  const heading   = document.getElementById('ballot-heading');
  const container = document.getElementById('ballot-boxes-row');
  container.innerHTML = '';

  // Create ballot boxes (in party order initially)
  PARTIES.forEach((party, i) => {
    const box = document.createElement('div');
    box.className  = 'ballot-box';
    box.id         = `bbox-${i}`;
    box.role       = 'listitem';
    box.setAttribute('aria-label', `${party.name} ballot box`);
    box.innerHTML  = `
      <div class="bbox-logo" style="background:${party.color};color:${party.text}">${party.abbr}</div>
      <div class="bbox-name">${party.name}</div>
      <div class="bbox-votes" id="bbox-votes-${i}" aria-live="polite">0</div>
    `;
    container.appendChild(box);
  });

  heading.textContent = 'Counting the votes…';

  // Let the DOM settle before measuring positions
  await sleep(120);

  await animateFallingVotes();
  await animateVoteCounts(1000);

  heading.textContent = 'All votes counted!';
  await sleep(600);

  const sortBtn = document.getElementById('btn-sort-boxes');
  sortBtn.style.display = 'inline-block';
  sortBtn.replaceWith(sortBtn.cloneNode(true));
  document.getElementById('btn-sort-boxes').onclick = async () => {
    document.getElementById('btn-sort-boxes').style.display = 'none';
    await sortBallotBoxes();
    heading.textContent = 'Votes sorted — ready to allocate seats!';
    await sleep(400);
    const dhondtBtn = document.getElementById('btn-to-dhondt');
    dhondtBtn.style.display = 'inline-block';
    dhondtBtn.replaceWith(dhondtBtn.cloneNode(true));
    document.getElementById('btn-to-dhondt').onclick = initDhondtPhase;
  };
}

// Drop coloured paper slips into each ballot box
async function animateFallingVotes() {
  const layer = document.getElementById('particle-layer');
  layer.innerHTML = '';

  const total      = state.partyVotes.reduce((a, b) => a + b, 0) || 1;
  const maxSlips   = 72;
  let   allSlips   = [];

  PARTIES.forEach((party, pi) => {
    const share = state.partyVotes[pi] / total;
    const count = Math.max(state.partyVotes[pi] > 0 ? 1 : 0,
                           Math.round(share * maxSlips));
    const boxEl = document.getElementById(`bbox-${pi}`);
    if (!boxEl) return;

    const br       = boxEl.getBoundingClientRect();
    const centerX  = br.left + br.width  / 2;
    const targetY  = br.top  + br.height * 0.45;

    for (let j = 0; j < count; j++) {
      const slip  = document.createElement('div');
      slip.className = 'vote-particle';

      const startX  = centerX + (Math.random() - 0.5) * 120;
      const startY  = -18;
      const fallDist = targetY - startY;
      const dur      = (0.7 + Math.random() * 0.5).toFixed(2);
      const delay    = (pi * 0.13 + j * 0.045 + Math.random() * 0.08).toFixed(2);
      const spin     = `${Math.round((Math.random() - 0.5) * 40)}deg`;

      slip.style.cssText = `
        left: ${startX}px; top: ${startY}px;
        background: ${party.color};
        --fall-dist: ${fallDist}px;
        --dur: ${dur}s;
        --delay: ${delay}s;
        --spin: ${spin};
      `;
      layer.appendChild(slip);
      allSlips.push({ delay: +delay, dur: +dur });
    }
  });

  // Wait for the last slip to finish
  if (allSlips.length) {
    const maxTime = Math.max(...allSlips.map(s => s.delay + s.dur));
    await sleep((maxTime + 0.3) * 1000);
  }
  layer.innerHTML = '';
}

// Animate vote counts from 0 up to real values
function animateVoteCounts(durationMs) {
  return new Promise(resolve => {
    const start  = performance.now();
    const target = [...state.partyVotes];

    function frame(now) {
      const t      = Math.min((now - start) / durationMs, 1);
      const eased  = 1 - Math.pow(1 - t, 3);  // ease-out cubic

      PARTIES.forEach((_, i) => {
        const el = document.getElementById(`bbox-votes-${i}`);
        if (el) el.textContent = fmt(Math.round(target[i] * eased));
      });

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        PARTIES.forEach((_, i) => {
          const el = document.getElementById(`bbox-votes-${i}`);
          if (el) el.textContent = fmt(target[i]);
        });
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

// Sort ballot boxes highest→lowest using FLIP animation
async function sortBallotBoxes() {
  const container = document.getElementById('ballot-boxes-row');
  const boxes     = PARTIES.map((_, i) => document.getElementById(`bbox-${i}`));

  // Record positions BEFORE re-ordering (First)
  const beforeRects = boxes.map(b => b.getBoundingClientRect());

  // Build sorted order (descending votes)
  const sorted = [...boxes].sort((a, b) => {
    const ai = +a.id.split('-')[1];
    const bi = +b.id.split('-')[1];
    return state.partyVotes[bi] - state.partyVotes[ai];
  });

  // Add rank badges
  sorted.forEach((box, rank) => {
    let badge = box.querySelector('.bbox-rank');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'bbox-rank';
      box.appendChild(badge);
    }
    badge.textContent = `#${rank + 1}`;
  });

  // Re-insert in sorted order (Last)
  sorted.forEach(box => container.appendChild(box));

  // Measure new positions
  await sleep(10);
  const afterRects = boxes.map(b => b.getBoundingClientRect());

  // Apply inverse transform so they visually stay in old positions (Invert)
  boxes.forEach((box, i) => {
    const dx = beforeRects[i].left - afterRects[i].left;
    const dy = beforeRects[i].top  - afterRects[i].top;
    box.style.transition = 'none';
    box.style.transform  = `translate(${dx}px, ${dy}px)`;
  });

  // Force reflow
  container.getBoundingClientRect();

  // Animate to natural position (Play)
  boxes.forEach(box => {
    box.style.transition = 'transform 0.65s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    box.style.transform  = '';
  });

  await sleep(750);
  // Clean up
  boxes.forEach(box => { box.style.transition = ''; });
}

// ════════════════════════════════════════════════════════════
// PHASE 4 – D'HONDT
// ════════════════════════════════════════════════════════════

// Pre-compute every step the user will click through
function computeDhondtSteps() {
  const steps    = [];
  const divisors = Array(PARTIES.length).fill(1);
  const seatsWon = Array(PARTIES.length).fill(0);
  const history  = [];

  // Helper: find index of eligible party with highest adjusted votes
  function leader(divs) {
    const partyMaxSeats = PARTIES.map((_, i) => i === IND_IDX ? state.indCandidates : NUM_SEATS);
    let best = -1;
    for (let i = 0; i < PARTIES.length; i++) {
      if (state.partyVotes[i] === 0) continue;
      if (seatsWon[i] >= partyMaxSeats[i]) continue;
      if (best === -1 || state.partyVotes[i] / divs[i] > state.partyVotes[best] / divs[best]) {
        best = i;
      }
    }
    return best;
  }

  // ── Step 0: Intro ──────────────────────────────────────
  steps.push({
    kind:        'intro',
    divisors:    [...divisors],
    adjusted:    state.partyVotes.map((v, i) => Math.round(v / divisors[i])),
    seatsWon:    [...seatsWon],
    history:     [],
    message:     "In the <strong>D'Hondt method</strong>, each party's votes are divided by a divisor — starting at <strong>1</strong>. The party with the highest adjusted total wins the next seat. When a party wins a seat, their divisor increases by 1, reducing their adjusted total for future rounds.",
    btnText:     'Allocate Seat 1 →',
    highlight:   -1,
  });

  for (let seat = 1; seat <= NUM_SEATS; seat++) {
    const win = leader(divisors);
    if (win === -1) break;  // no eligible parties remain
    const prevWin   = history.length ? history[history.length - 1] : -1;
    const adjVotes  = state.partyVotes.map((v, i) => Math.round(v / divisors[i]));

    let leadMsg;
    if (seat === 1) {
      leadMsg = `<strong>${PARTIES[win].name}</strong> has the highest adjusted total (${fmt(adjVotes[win])}) — they receive <strong>Seat ${seat}</strong>! 🎉`;
    } else if (win === prevWin) {
      leadMsg = `<strong>${PARTIES[win].name}</strong> is <em>still</em> in the lead with an adjusted total of <strong>${fmt(adjVotes[win])}</strong> — they receive <strong>Seat ${seat}</strong>! 🎉`;
    } else {
      leadMsg = `<strong>${PARTIES[win].name}</strong> is now in the lead with an adjusted total of <strong>${fmt(adjVotes[win])}</strong> — they receive <strong>Seat ${seat}</strong>! 🎉`;
    }

    history.push(win);
    seatsWon[win]++;

    // ── Allocation step ──────────────────────────────────
    steps.push({
      kind:      'allocate',
      seatNum:   seat,
      winner:    win,
      divisors:  [...divisors],
      adjusted:  adjVotes,
      seatsWon:  [...seatsWon],
      history:   [...history],
      message:   leadMsg,
      btnText:   seat < NUM_SEATS ? 'Update Divisor →' : 'See Final Results →',
      highlight: win,
    });

    if (seat < NUM_SEATS) {
      const oldDiv = divisors[win];
      divisors[win]++;

      // ── Increment step ───────────────────────────────
      steps.push({
        kind:      'increment',
        winner:    win,
        oldDiv,
        newDiv:    divisors[win],
        divisors:  [...divisors],
        adjusted:  state.partyVotes.map((v, i) => Math.round(v / divisors[i])),
        seatsWon:  [...seatsWon],
        history:   [...history],
        message:   `<strong>${PARTIES[win].name}</strong> now has ${seatsWon[win]} seat${seatsWon[win] > 1 ? 's' : ''}. Their divisor increases from <strong>${oldDiv}</strong> to <strong>${divisors[win]}</strong> — their next adjusted total will be their votes ÷ ${divisors[win]}.`,
        btnText:   'Recalculate & Sort →',
        highlight: win,
      });

      // ── Resort step ──────────────────────────────────
      const newLeader = leader(divisors);
      const newAdj    = state.partyVotes.map((v, i) => Math.round(v / divisors[i]));

      let resortMsg;
      if (newLeader === win) {
        resortMsg = `After recalculating, <strong>${PARTIES[win].name}</strong> is still in the lead with ${fmt(newAdj[newLeader])}. The ballot boxes have been resorted.`;
      } else {
        resortMsg = `After recalculating, <strong>${PARTIES[newLeader].name}</strong> is now in the lead with ${fmt(newAdj[newLeader])}. The ballot boxes have been resorted.`;
      }

      steps.push({
        kind:      'resort',
        divisors:  [...divisors],
        adjusted:  newAdj,
        seatsWon:  [...seatsWon],
        history:   [...history],
        message:   resortMsg,
        btnText:   `Allocate Seat ${seat + 1} →`,
        highlight: newLeader,
      });
    }
  }

  // ── Final complete step ──────────────────────────────
  steps.push({
    kind:      'complete',
    divisors:  [...divisors],
    adjusted:  state.partyVotes.map((v, i) => Math.round(v / divisors[i])),
    seatsWon:  [...seatsWon],
    history:   [...history],
    message:   '🎉 <strong>Election complete!</strong> All six seats have been allocated.',
    btnText:   'View Full Results →',
    highlight: -1,
  });

  return steps;
}

// Build and show the D'Hondt phase
function initDhondtPhase() {
  showPhase('phase-dhondt');

  state.dhondtSteps = computeDhondtSteps();
  state.stepIndex   = 0;
  state.seatHistory = [];

  renderSeats([]);
  applyStep(state.dhondtSteps[0]);

  const btn = document.getElementById('btn-dhondt-next');
  btn.onclick = advanceDhondt;
}

// Advance to the next D'Hondt step when the user clicks "Next"
async function advanceDhondt() {
  state.stepIndex++;
  const step = state.dhondtSteps[state.stepIndex];
  if (!step) { showComplete(); return; }

  if (step.kind === 'complete') {
    showComplete();
    return;
  }

  applyStep(step);

  // Seat win animation
  if (step.kind === 'allocate') {
    const seatEl = document.getElementById(`seat-${step.seatNum - 1}`);
    if (seatEl) {
      seatEl.classList.remove('seat-flash');
      // Reading offsetWidth forces a layout reflow, which resets the CSS
      // animation so it replays cleanly when the class is re-added.
      const _triggerReflow = seatEl.offsetWidth; // eslint-disable-line no-unused-vars
      seatEl.classList.add('seat-flash');
      setTimeout(() => seatEl.classList.remove('seat-flash'), 800);
    }
  }

  // Divisor bump animation
  if (step.kind === 'increment') {
    await sleep(100);
    const divEl = document.getElementById(`div-label-${step.winner}`);
    if (divEl) {
      divEl.classList.remove('divisor-bump');
      // Force reflow to restart the CSS animation (same technique as above).
      const _triggerReflow = divEl.offsetWidth; // eslint-disable-line no-unused-vars
      divEl.classList.add('divisor-bump');
      setTimeout(() => divEl.classList.remove('divisor-bump'), 600);
    }
  }
}

// Render seats and ballot boxes for the given step
function applyStep(step) {
  document.getElementById('dhondt-message').innerHTML = step.message;
  const btn = document.getElementById('btn-dhondt-next');
  btn.textContent = step.btnText || 'Next →';

  renderSeats(step.history || []);
  renderDhondtBoxes(step.divisors, step.adjusted, step.history || [], step.highlight);
}

// Render the 6 seat slots
function renderSeats(history) {
  const row = document.getElementById('seats-row');
  row.innerHTML = '';

  for (let i = 0; i < NUM_SEATS; i++) {
    const div = document.createElement('div');
    div.className = 'seat';
    div.id        = `seat-${i}`;
    div.setAttribute('role', 'listitem');

    if (i < history.length) {
      const p = PARTIES[history[i]];
      div.classList.add('won');
      div.style.background   = p.color;
      div.style.borderColor  = p.color;
      div.setAttribute('aria-label', `Seat ${i + 1}: ${p.name}`);
      div.innerHTML = `<div class="seat-abbr">${p.abbr}</div><div class="seat-num">${i + 1}</div>`;
    } else {
      div.setAttribute('aria-label', `Seat ${i + 1}: empty`);
      div.innerHTML = `<div class="seat-num">${i + 1}</div>`;
    }
    row.appendChild(div);
  }
}

// Render D'Hondt ballot boxes sorted by adjusted votes (using FLIP animation)
function renderDhondtBoxes(divisors, adjusted, history, highlightIdx) {
  const container = document.getElementById('dhondt-boxes-row');

  // Capture old positions for boxes already in DOM
  const existing = {};
  container.querySelectorAll('.ballot-box').forEach(el => {
    const idx = +el.dataset.partyIdx;
    existing[idx] = el.getBoundingClientRect();
  });

  container.innerHTML = '';

  // Sort indices by adjusted votes descending
  const order = PARTIES.map((_, i) => i)
    .sort((a, b) => adjusted[b] - adjusted[a]);

  order.forEach((pi, rank) => {
    const party    = PARTIES[pi];
    const seatsWon = history.filter(h => h === pi).length;
    const box      = document.createElement('div');
    box.className  = 'ballot-box';
    box.id         = `dbbox-${pi}`;
    box.dataset.partyIdx = pi;
    box.setAttribute('role', 'listitem');
    box.setAttribute('aria-label', `${party.name}: ${fmt(adjusted[pi])} adjusted votes, divisor ${divisors[pi]}`);

    const isCapped = pi === IND_IDX && seatsWon >= state.indCandidates;
    if (pi === highlightIdx) box.classList.add('highlight');
    if (isCapped) box.classList.add('dim');

    const seatWord = state.indCandidates === 1 ? 'seat' : 'seats';
    const capBadge = (pi === IND_IDX && state.indCandidates < NUM_SEATS)
      ? `<div class="bbox-cap">Cap: ${state.indCandidates} ${seatWord}</div>`
      : '';

    box.innerHTML = `
      <div class="bbox-rank">#${rank + 1}</div>
      <div class="bbox-logo" style="background:${party.color};color:${party.text}">${party.abbr}</div>
      <div class="bbox-name">${party.name}</div>
      ${capBadge}
      <div class="bbox-votes">${fmt(state.partyVotes[pi])}</div>
      <div class="bbox-div-label">÷ divisor</div>
      <div class="bbox-divisor" id="div-label-${pi}">${divisors[pi]}</div>
      <div class="bbox-div-label">= effective</div>
      <div class="bbox-adjusted">${fmt(adjusted[pi])}</div>
      ${seatsWon > 0 ? `<div class="bbox-seats-icons">${'🟡'.repeat(seatsWon)}</div>` : ''}
    `;
    container.appendChild(box);
  });

  // FLIP animation for boxes that existed before
  requestAnimationFrame(() => {
    order.forEach(pi => {
      if (!existing[pi]) return;
      const el       = document.getElementById(`dbbox-${pi}`);
      if (!el) return;
      const newRect  = el.getBoundingClientRect();
      const dx       = existing[pi].left - newRect.left;
      const dy       = existing[pi].top  - newRect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      el.style.transition = 'none';
      el.style.transform  = `translate(${dx}px,${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        el.style.transform  = '';
      });
    });
  });
}

// ════════════════════════════════════════════════════════════
// PHASE 5 – COMPLETE
// ════════════════════════════════════════════════════════════
function showComplete() {
  showPhase('phase-complete');

  // Final history from the last allocate step
  const lastAlloc = [...state.dhondtSteps].reverse().find(s => s.kind === 'allocate');
  const history   = lastAlloc ? lastAlloc.history : [];

  // Seats row
  const seatsEl = document.getElementById('final-seats');
  seatsEl.innerHTML = '';
  history.forEach((pi, i) => {
    const p    = PARTIES[pi];
    const div  = document.createElement('div');
    div.className = 'final-seat';
    div.setAttribute('role', 'listitem');
    div.setAttribute('aria-label', `Seat ${i + 1}: ${p.name}`);
    div.style.background = p.color;
    div.innerHTML = `<div class="fs-abbr">${p.abbr}</div><div class="fs-num">Seat ${i + 1}</div>`;
    seatsEl.appendChild(div);
  });

  // Summary by party
  const counts = Array(PARTIES.length).fill(0);
  history.forEach(pi => counts[pi]++);

  const totalVotesCast = state.partyVotes.reduce((a, b) => a + b, 0) || 1;
  const summaryEl = document.getElementById('final-summary');
  summaryEl.innerHTML = '';

  // Sort by seats descending, then votes descending
  const sortedIndices = PARTIES.map((_, i) => i)
    .filter(i => counts[i] > 0)
    .sort((a, b) => counts[b] - counts[a] || state.partyVotes[b] - state.partyVotes[a]);

  sortedIndices.forEach(i => {
    const p = PARTIES[i];
    const votePct = (state.partyVotes[i] / totalVotesCast * 100).toFixed(1);
    const seatPct = (counts[i] / NUM_SEATS * 100).toFixed(1);
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.setAttribute('role', 'listitem');
    card.style.borderLeftColor = p.color;
    card.innerHTML = `
      <div class="summary-seats" style="color:${p.color}">${counts[i]}</div>
      <div class="summary-name">${p.name}</div>
      <div class="summary-votes">${fmt(state.partyVotes[i])} votes</div>
      <div class="summary-comparison">
        <div class="cmp-row">
          <span class="cmp-label">Votes</span>
          <span class="cmp-bar-wrap"><span class="cmp-bar" style="width:${votePct}%;background:${p.color};opacity:0.55"></span></span>
          <span class="cmp-pct">${votePct}%</span>
        </div>
        <div class="cmp-row">
          <span class="cmp-label">Seats</span>
          <span class="cmp-bar-wrap"><span class="cmp-bar" style="width:${seatPct}%;background:${p.color}"></span></span>
          <span class="cmp-pct">${seatPct}%</span>
        </div>
      </div>
    `;
    summaryEl.appendChild(card);
  });

  // Restart
  const btn = document.getElementById('btn-restart');
  btn.replaceWith(btn.cloneNode(true));
  document.getElementById('btn-restart').onclick = () => {
    showPhase('phase-input');
    initInputPhase();
  };
}

// ════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', initInputPhase);

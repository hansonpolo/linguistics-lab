/**
 * FSRS-5 调度器（纯 JS 实现，无第三方依赖）
 * 参考 FSRS-5 公开算法与默认参数；状态机采用 Anki 风格：
 *   New → (Again) Learning → (Good/Easy) Review → (Again) Relearning → Review
 * 评分：1=Again 2=Hard 3=Good 4=Easy
 */
export const State = { New: 0, Learning: 1, Review: 2, Relearning: 3 };
export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };

/** FSRS-5 默认 19 参数（w17/w18 为短期记忆稳定性参数） */
export const DEFAULT_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
const DAY = 86400000;
const MIN = 60000;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function initDifficulty(g, w) {
  return clamp(w[4] - Math.exp(w[5] * (g - 1)) + 1, 1, 10);
}
function initStability(g, w) {
  return Math.max(0.1, w[g - 1]);
}
/** 可提取性 R(t,S) */
export function retrievability(elapsedDays, stability) {
  if (!stability || stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}
/** 由稳定性反推间隔（天） */
export function nextInterval(stability, retention = 0.9) {
  const ivl = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.round(ivl), 1, 36500);
}
function nextDifficulty(d, g, w) {
  const delta = -w[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9;
  return clamp(w[7] * initDifficulty(4, w) + (1 - w[7]) * damped, 1, 10);
}
function stabilityAfterRecall(d, s, r, g, w) {
  const hardPenalty = g === Rating.Hard ? w[15] : 1;
  const easyBonus = g === Rating.Easy ? w[16] : 1;
  const inc =
    Math.exp(w[8]) *
    (11 - d) *
    Math.pow(s, -w[9]) *
    (Math.exp(w[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return Math.max(0.1, s * (1 + inc));
}
function stabilityAfterForget(d, s, r, w) {
  return Math.max(
    0.1,
    w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r))
  );
}
function shortTermStability(s, g, w) {
  return Math.max(0.1, s * Math.exp(w[17] * (g - 3 + w[18])));
}

function iso(ms) {
  return new Date(ms).toISOString();
}
function elapsedDays(sinceIso, nowMs) {
  if (!sinceIso) return 0;
  return Math.max(0, (nowMs - new Date(sinceIso).getTime()) / DAY);
}

/**
 * 计算评分后的卡片新状态（纯函数）
 * @param {object} card  {state, stability, difficulty, due, last_review, reps, lapses, scheduled_days, elapsed_days}
 * @param {number} rating 1..4
 * @param {object} opts { retention, weights, now }
 */
export function schedule(card, rating, opts = {}) {
  const w = opts.weights || DEFAULT_WEIGHTS;
  const retention = clamp(opts.retention ?? 0.9, 0.7, 0.97);
  const now = opts.now ?? Date.now();
  const state = card.state ?? State.New;
  const lastReview = card.last_review || null;
  const elapsed = elapsedDays(lastReview, now);
  const reps = (card.reps || 0) + 1;

  let stability = card.stability || 0;
  let difficulty = card.difficulty || 0;
  let lapses = card.lapses || 0;
  let newState = state;
  let dueMs = now;
  let intervalDays = 0;
  let phase = "review";

  if (state === State.New) {
    difficulty = initDifficulty(rating, w);
    stability = initStability(rating, w);
    if (rating === Rating.Again) {
      newState = State.Learning;
      stability = shortTermStability(stability, rating, w);
      dueMs = now + 1 * MIN;
      phase = "learn";
    } else {
      newState = State.Review;
      intervalDays = nextInterval(stability, retention);
      dueMs = now + intervalDays * DAY;
    }
  } else if (state === State.Learning || state === State.Relearning) {
    const r = retrievability(elapsed, stability || 1);
    if (rating === Rating.Again) {
      stability = shortTermStability(stability || 1, rating, w);
      dueMs = now + 10 * MIN;
      intervalDays = 0;
      phase = "relearn";
    } else {
      stability = Math.max(
        shortTermStability(stability || 1, rating, w),
        stabilityAfterRecall(difficulty || 5, stability || 1, r, rating, w)
      );
      difficulty = nextDifficulty(difficulty || 5, rating, w);
      newState = State.Review;
      intervalDays = nextInterval(stability, retention);
      if (rating === Rating.Easy) intervalDays = Math.round(intervalDays * 1.3);
      dueMs = now + intervalDays * DAY;
    }
  } else {
    // Review
    const r = retrievability(elapsed, stability || 1);
    if (rating === Rating.Again) {
      lapses += 1;
      stability = stabilityAfterForget(difficulty || 5, stability || 1, r, w);
      difficulty = nextDifficulty(difficulty || 5, rating, w);
      newState = State.Relearning;
      dueMs = now + 10 * MIN;
      intervalDays = 0;
      phase = "relearn";
    } else {
      stability = stabilityAfterRecall(difficulty || 5, stability || 1, r, rating, w);
      difficulty = nextDifficulty(difficulty || 5, rating, w);
      newState = State.Review;
      intervalDays = nextInterval(stability, retention);
      if (rating === Rating.Easy) intervalDays = Math.round(intervalDays * 1.3);
      dueMs = now + intervalDays * DAY;
    }
  }

  const out = {
    due: iso(dueMs),
    stability: round(stability, 4),
    difficulty: round(difficulty, 3),
    elapsed_days: Math.round(elapsed),
    scheduled_days: intervalDays,
    reps,
    lapses,
    state: newState,
    last_review: iso(now),
  };
  return { card: out, log: { ...out, rating, phase, elapsed_days: Math.round(elapsed) } };
}

function round(n, d) {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}

/** 四个评分按钮对应的“下次间隔”预览（文本 + 天数） */
export function previewIntervals(card, opts = {}) {
  const now = opts.now ?? Date.now();
  const retention = opts.retention ?? 0.9;
  const res = {};
  for (const g of [1, 2, 3, 4]) {
    const { card: c } = schedule(card, g, { ...opts, now });
    const ms = new Date(c.due).getTime() - now;
    res[g] = { due: c.due, days: c.scheduled_days, label: humanize(ms) };
  }
  return res;
}

export function humanize(ms) {
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} 分钟`;
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))} 小时`;
  const d = ms / DAY;
  if (d < 30) return `${Math.round(d)} 天`;
  if (d < 365) return `${(d / 30).toFixed(1)} 个月`;
  return `${(d / 365).toFixed(1)} 年`;
}

/** 新卡初始 due 时间（现在） */
export function newCardState() {
  return {
    due: iso(Date.now()),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    last_review: null,
  };
}

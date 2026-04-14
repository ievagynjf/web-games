![1776134901990](image/entrance_generation_plan/1776134901990.png)# 入口生成方案（低开销版）

## 目标
在不使用网格碰撞模拟（如贪吃蛇占用表）的前提下，以低复杂度实现稳定的“自回避”入口路径生成。

- 时间复杂度：`O(n)`（n 为段数）
- 额外空间复杂度：`O(1)`
- 核心：动态单向边界锁定 + 离心采样 + 安全边距裁剪

---

## 核心策略

### 1) 空间主导选边（Directional Bias）
在 `V -> H` 转向时，不做纯随机左右二选一，而是优先选择空间更充裕的一侧。

- 计算：
  - `leftGap`
  - `rightGap`
- 规则：
  - 若 `leftGap > rightGap`，优先向左
  - 若 `rightGap > leftGap`，优先向右
  - 相等时才随机

**作用**：形成离心扩散趋势，减少向内回卷。

---

### 2) 安全边距裁剪（Margin Clipping）
步长上限不是直接随机上限，而是：

`stepMax = min(randomCap, gap - laneWidth)`

其中 `laneWidth` 是通道宽度（如 2）。

**作用**：预留墙体缓冲区，避免平行贴边导致后续墙体冲突。

---

### 3) 预算动态锁定（Budget Locking）
每完成一段位移后，立即锁定“背向预算”（单向阀）。

示例：
- 若本次水平段向右扩展，则左侧回撤预算锁死（置 0 或极小）
- 若向左扩展，则右侧回撤预算锁死
- 纵向同理

**作用**：从状态空间层面切断折返路径。

---

## 实施细节

### 状态变量（常数个）
- `topGap`, `bottomGap`
- `leftGap`, `rightGap`
- `axisLockX`, `axisLockY`（可选，表示某轴是否单向锁定）

### 每步流程（伪代码）
1. 判断当前应生成 `H` 还是 `V`（交替）
2. 按当前轴计算可行方向（结合锁定状态）
3. 用 Directional Bias 选方向
4. 用 Margin Clipping 计算步长上限
5. 若无合法步长，结束生成
6. 提交位移并更新 gap
7. 执行 Budget Locking（锁死背向预算）

---

## 轻量兜底（推荐）
为接近“工程上绝对稳定”，可加一个常数级本地检查：

- 在提交本步前，仅校验与“最近 1~2 段”的几何冲突
- 若冲突则重采当前步（不回溯）

这一步仍是 `O(1)`，但能显著提升鲁棒性。

---

## 对比说明

### 与贪吃蛇占用网格法相比
- 优点：更轻、无集合维护、常数开销小
- 代价：理论完备性稍弱（可由轻量兜底补齐）

### 适用场景
- 需要高帧率、低开销的实时关卡生成
- 规则明确、可接受“强约束下的随机性”

---

## 参数建议（初始值）
- `randomCap = 4`
- `laneWidth = 2`
- `margin = laneWidth`
- 离心偏置概率（同 gap 时）= `0.5`

可根据可玩性再微调。

---

## TypeScript 参考实现（可直接落地）

> 说明：这是按本文策略整理的最小可用实现骨架。

```ts
type Axis = 'H' | 'V';
type Dir = -1 | 1; // -1: 左/上, +1: 右/下

interface Config {
  randomCap: number;
  laneWidth: number;
  tieBreakBias: number; // gap 相等时，选择正方向概率，默认 0.5
}

interface State {
  x: number;
  y: number;
  axis: Axis;

  leftGap: number;
  rightGap: number;
  topGap: number;
  bottomGap: number;

  // 锁定“背向预算”：若 lockNegX=true，表示 X 轴禁止 -1 方向
  lockNegX: boolean;
  lockPosX: boolean;
  lockNegY: boolean;
  lockPosY: boolean;
}

interface Segment {
  axis: Axis;
  dir: Dir;
  step: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export function generateEntrance(
  maxSegments: number,
  init: {
    x: number;
    y: number;
    leftGap: number;
    rightGap: number;
    topGap: number;
    bottomGap: number;
    startAxis?: Axis;
  },
  cfg: Config = { randomCap: 4, laneWidth: 2, tieBreakBias: 0.5 }
): Segment[] {
  const s: State = {
    x: init.x,
    y: init.y,
    axis: init.startAxis ?? 'H',
    leftGap: init.leftGap,
    rightGap: init.rightGap,
    topGap: init.topGap,
    bottomGap: init.bottomGap,
    lockNegX: false,
    lockPosX: false,
    lockNegY: false,
    lockPosY: false,
  };

  const out: Segment[] = [];

  for (let i = 0; i < maxSegments; i++) {
    const axis = s.axis;

    // 1) 可行方向（结合锁）
    const dirs = getFeasibleDirs(s, axis, cfg.laneWidth);
    if (dirs.length === 0) break;

    // 2) Directional Bias
    const dir = pickDirWithBias(s, axis, dirs, cfg.tieBreakBias);

    // 3) Margin Clipping
    const gap = getGapByAxisDir(s, axis, dir);
    const stepMax = Math.min(cfg.randomCap, gap - cfg.laneWidth);
    if (stepMax <= 0) break;

    const step = randInt(1, stepMax);

    // 4) 可选轻量兜底：只检查最近 1~2 段（当前默认总是通过）
    if (!localCheckPass(out, s, axis, dir, step, cfg.laneWidth)) {
      continue;
    }

    // 5) 提交位移 + 更新 gap
    const seg = commitMoveAndUpdateGaps(s, axis, dir, step);
    out.push(seg);

    // 6) Budget Locking：锁背向
    applyBudgetLocking(s, axis, dir);

    // 7) 交替轴
    s.axis = axis === 'H' ? 'V' : 'H';
  }

  return out;
}

function getFeasibleDirs(s: State, axis: Axis, laneWidth: number): Dir[] {
  const result: Dir[] = [];

  if (axis === 'H') {
    // -1: 左, +1: 右
    const canNeg = !s.lockNegX && s.leftGap - laneWidth >= 1;
    const canPos = !s.lockPosX && s.rightGap - laneWidth >= 1;
    if (canNeg) result.push(-1);
    if (canPos) result.push(1);
  } else {
    // -1: 上, +1: 下
    const canNeg = !s.lockNegY && s.topGap - laneWidth >= 1;
    const canPos = !s.lockPosY && s.bottomGap - laneWidth >= 1;
    if (canNeg) result.push(-1);
    if (canPos) result.push(1);
  }

  return result;
}

function pickDirWithBias(
  s: State,
  axis: Axis,
  dirs: Dir[],
  tieBreakBias: number
): Dir {
  if (dirs.length === 1) return dirs[0];

  let negGap: number;
  let posGap: number;

  if (axis === 'H') {
    negGap = s.leftGap;
    posGap = s.rightGap;
  } else {
    negGap = s.topGap;
    posGap = s.bottomGap;
  }

  if (negGap > posGap) return -1;
  if (posGap > negGap) return 1;

  return Math.random() < tieBreakBias ? 1 : -1;
}

function getGapByAxisDir(s: State, axis: Axis, dir: Dir): number {
  if (axis === 'H') return dir === -1 ? s.leftGap : s.rightGap;
  return dir === -1 ? s.topGap : s.bottomGap;
}

function commitMoveAndUpdateGaps(
  s: State,
  axis: Axis,
  dir: Dir,
  step: number
): Segment {
  const from = { x: s.x, y: s.y };

  if (axis === 'H') {
    s.x += dir * step;

    if (dir === -1) {
      s.leftGap -= step;
      s.rightGap += step;
    } else {
      s.rightGap -= step;
      s.leftGap += step;
    }
  } else {
    s.y += dir * step;

    if (dir === -1) {
      s.topGap -= step;
      s.bottomGap += step;
    } else {
      s.bottomGap -= step;
      s.topGap += step;
    }
  }

  const to = { x: s.x, y: s.y };

  return { axis, dir, step, from, to };
}

function applyBudgetLocking(s: State, axis: Axis, dir: Dir): void {
  if (axis === 'H') {
    // 向右后锁死左回撤；向左后锁死右回撤
    if (dir === 1) s.lockNegX = true;
    else s.lockPosX = true;
  } else {
    // 向下后锁死上回撤；向上后锁死下回撤
    if (dir === 1) s.lockNegY = true;
    else s.lockPosY = true;
  }
}

function localCheckPass(
  _segments: Segment[],
  _s: State,
  _axis: Axis,
  _dir: Dir,
  _step: number,
  _laneWidth: number
): boolean {
  // 这里可扩展为“仅检查最近 1~2 段”的几何冲突
  return true;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
```

### 接入说明
- 初始化时把当前点坐标与四向可用 gap 传入 `generateEntrance`。
- 返回的 `Segment[]` 即入口折线路径，可直接用于后续墙体/通道构造。
- 若要更稳，优先完善 `localCheckPass`（仅检查最近 1~2 段即可）。
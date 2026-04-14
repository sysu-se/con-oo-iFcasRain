# 数独领域对象与 Svelte 接入设计说明

## 1. `Sudoku` 与 `Game` 的职责边界

- **`Sudoku`（局面）**  
  - 持有题目初始局面 `initial`（深拷贝）与当前盘面 `grid`。  
  - `initial` 中非零格视为「题目给定」，`guess` 不会修改这些格。  
  - 提供 `getGrid()`、`guess(move)`、`clone()`、`toJSON()`、`toString()`，以及便于协作的 `isLocked` / `peek`（作业要求之外的辅助接口）。

- **`Game`（一局会话）**  
  - 持有一个 `Sudoku` 实例。  
  - 维护撤销栈与重做栈；用户操作只应通过 `Game.guess` 进入，以便记录历史。  
  - 提供 `undo` / `redo`、`canUndo` / `canRedo` 与 `toJSON()`。  
  - `undo` / `redo` 内部通过再次调用 `Sudoku.guess` 写回旧值或新值（目标格均为非给定格，不会与 `initial` 冲突）。

## 2. `Move` 是值对象还是实体？

本实现将每一步历史存为**值对象**：`{ row, col, oldValue, newValue }`（语义上等价于「在 `(row,col)` 上从 `oldValue` 变为 `newValue`」）。

- 无标识符、无生命周期管理需求，与格子坐标和数字绑定即可重放。  
- 不作为聚合根；核心实体仍是 `Sudoku` 与 `Game`。

## 3. history 里存的是什么？为什么？

- **存的是「坐标 + 前后数字」**，而不是完整 `Sudoku` 快照。  
- **理由**：数独单步操作信息量小，用 move 序列足以还原；内存占用小，且与「撤销最近一次输入」语义一致。  
- **新开一局**：`createGame` 重新创建，`Game` 内栈清空（见 `grid.js` 中 `bootstrapNewPuzzle`）。

## 4. 复制策略与深拷贝

| 场景 | 策略 |
|------|------|
| `createSudoku(input)` | 对输入 `number[][]` 做行级深拷贝，避免外部改数组破坏局面。 |
| `getGrid()` | 返回新的二维数组，避免 UI 或测试持有内部引用。 |
| `clone()` | 复制 `initial` 与 `grid`，得到独立 `Sudoku`。 |
| `Sudoku.toJSON()` | 结构化数据，便于 `JSON.stringify`。 |
| **若误用浅拷贝** | 多处共享同一行数组时，一次 `guess` 可能通过外部引用污染其它副本或历史回放结果。 |

## 5. 序列化 / 反序列化设计

- **`Sudoku.toJSON()`**  
  - 包含：`version`、`kind: 'Sudoku'`、`initial`、`grid`。  
  - `initial` 用于区分给定格；`grid` 为当前进度。

- **`createSudokuFromJSON(json)`**  
  - 从 `initial` 与 `grid` 重建 `Sudoku`（均做校验与拷贝）。

- **`Game.toJSON()`**  
  - 包含嵌套的 `sudoku` 与可选的 `undoStack` / `redoStack`（便于将来扩展完整恢复会话）。

- **`createGameFromJSON(json)`**  
  - 当前实现：恢复 `Sudoku` 局面后**新建** `Game`，历史栈为空（与作业测试「只校验当前盘面一致」一致；若需完整会话恢复，可后续根据栈字段重放或扩展构造逻辑）。

## 6. 外表化接口

- **`Sudoku.toString()`**：输出带宫格分隔的文本盘面，`.` 表示空格，便于调试与日志。  
- **`Sudoku.toJSON()` / `Game.toJSON()`**：供持久化与自动化测试做 round-trip。

---

## 7.（HW 1.1）领域对象如何被 View 消费？

### 7.1 View 直接消费的是什么？

- 组件仍订阅 **`@sudoku/stores/grid`** 中的 **`grid`（题目）**、**`userGrid`（当前完整盘面）**、**`invalidCells`** 等。  
- **领域对象**由 `grid.js` 内部模块级变量 `gameInstance` 持有；UI 不直接 import `Game`，而是通过 **store 适配层** 调用 `gameInstance.guess` / `undo` / `redo`。

### 7.2 用户操作如何进入领域对象？

- **填数 / 擦除**：`Keyboard.svelte` 等调用 `userGrid.set(pos, value)` → 内部 `gameInstance.guess({ row, col, value })`。  
- **撤销 / 重做**：`Actions.svelte` 调用 `userGrid.undo()` / `userGrid.redo()` → 内部 `gameInstance.undo()` / `redo()`。  
- **提示**：`userGrid.applyHint` 在求解后调用 `gameInstance.guess`，仍走同一领域路径。

### 7.3 领域变化后，Svelte 为何会更新？

- 每次领域操作后调用 **`syncUserGridFromDomain()`**：用 `writable` 的 **`userGridInner.set(新二维数组)`** 整体替换引用。  
- Svelte 3 对「赋值新引用」能可靠触发依赖 `userGrid` / `invalidCells` / `gameWon` 的更新；若仅原地修改嵌套数组元素，可能无法触发订阅者。

### 7.4 若直接 mutate 领域对象或共享数组会怎样？

- 可能 **界面不刷新**（未触发 store `set`），或 **derived（如冲突格）与真实局面不一致**。因此适配层在同步 UI 时统一 **深拷贝 grid** 再写入 store。

---

## 8.（HW 1.1）相比 HW1 的改进与取舍

- **改进**：在保留 `src/domain/index.js` 统一评分接口的前提下，将 **`@sudoku/stores/grid.js` 明确为 Store Adapter**，使真实游戏流程必须经过 `Game`，避免「领域对象仅测试可用」。  
- **取舍**：未单独导出 `createGameStore()` 工厂函数，而是把 **同一职责** 写在 `grid.js` 内，减少一层文件；若项目变大，可将 `syncUserGridFromDomain` 与 `bootstrapNewPuzzle` 抽成 `createGameStore()` 以便复用与单测。

---

## 9. 与 Svelte 机制的关系（简要）

- 依赖 **`writable` + `derived`**：`userGridInner` 为源，`invalidCells` / `gameWon` 等派生自用户盘面。  
- 依赖 **`$store` 自动订阅**：组件中 `$userGrid`、`$canUndoGame` 等随 store 更新而重算。  
- **响应式边界**：领域逻辑在 `domain/index.js`；**与 UI 同步的边界**在 `syncUserGridFromDomain`（每次领域变更后显式 `set`）。

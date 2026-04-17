# con-oo-iFcasRain - Review

## Review 结论

代码已经把 `Game`/`Sudoku` 接入了真实的 Svelte 交互链路，开局、输入、撤销重做和界面刷新都不再直接改棋盘数组，这一点达到了作业的基本目标。但当前设计仍未把“数独业务规则”真正收口到领域模型内，且 `Game` 与 Svelte 适配层之间存在封装泄漏和双数据源问题，因此整体属于“已接入、但领域建模和 OOD 仍明显不够稳”的状态。

## 总体评价

| 维度 | 评价 |
| --- | --- |
| OOP | fair |
| JS Convention | fair |
| Sudoku Business | fair |
| OOD | fair |

## 缺点

### 1. 数独规则校验和胜负判定没有进入领域模型

- 严重程度：core
- 位置：src/domain/index.js:73-146; src/node_modules/@sudoku/stores/grid.js:140-184; src/node_modules/@sudoku/stores/game.js:7-18
- 原因：`Sudoku` 当前只负责 9x9 形状检查、读写和 given cell 保护，没有提供行/列/宫冲突校验，也没有“已完成/已获胜”等业务语义。结果 `invalidCells` 和 `gameWon` 只能在 store 层重新扫描二维数组完成，核心业务规则散落在领域外，`Sudoku` 无法独立代表一个“合法或非法的数独局面”，不符合题目要求中“提供校验能力”的职责边界。

### 2. Game 暴露了可变的内部 Sudoku，破坏封装边界

- 严重程度：major
- 位置：src/domain/index.js:225-228; src/node_modules/@sudoku/stores/grid.js:43-46,114-116
- 原因：`getSudoku()` 直接返回内部 `_sudoku` 实例，而这个实例本身还暴露 `guess()`。这意味着任何调用方都可以绕过 `Game.guess()` 直接改局面，从而跳过 undo/redo 记账，也跳过 `syncUserGridFromDomain()` 的 UI 同步约束。当前 store 虽然暂时只读 `getGrid()`，但接口设计本身已经允许外部破坏 `Game` 的一致性。

### 3. View 仍依赖平行的 puzzle store，而不是完整消费领域导出状态

- 严重程度：major
- 位置：src/node_modules/@sudoku/stores/grid.js:28-30,56-59; src/components/Board/index.svelte:48-51; src/node_modules/@sudoku/stores/keyboard.js:6-10
- 原因：当前棋盘当前值来自 `gameInstance.getSudoku().getGrid()`，但 given cell / 是否可编辑 等信息却仍通过独立的 `$grid` store 判断，如 `Board` 的 `userNumber`、`conflictingNumber` 和 `keyboardDisabled`。这说明 UI 还在同时依赖两套状态来源，而不是由领域对象或其单一 adapter 一次性导出完整视图状态；一旦两者未来演化不一致，就会出现难排查的偏差。

### 4. Game 的序列化协议前后不一致

- 严重程度：major
- 位置：src/domain/index.js:282-304
- 原因：`toJSON()` 明确输出了 `undoStack` 和 `redoStack`，但 `createGameFromJSON()` 却直接丢弃历史栈，只恢复当前 `sudoku`。这会让序列化后的对象无法反序列化回等价状态，也使“Undo/Redo 所需的状态演进”在持久化场景下失真，属于不完整的领域契约设计。

### 5. Svelte 响应式桥接依赖手工同步，适配层脆弱

- 严重程度：minor
- 位置：src/node_modules/@sudoku/stores/grid.js:43-47,103-134
- 原因：当前 UI 刷新完全依赖每个命令后都显式调用 `syncUserGridFromDomain()`。这证明作者理解了“Svelte 不会追踪对象内部 mutation”，但这种做法也要求未来所有改动路径都不能漏掉同步调用，否则界面就会静默失效。更稳妥的 OOD 通常会把变更和通知收敛到单一更新入口，或让领域对象自身提供订阅能力。

### 6. 组件内手工订阅 store 而不清理，不符合常见 Svelte 用法

- 严重程度：minor
- 位置：src/App.svelte:12-17
- 原因：`gameWon.subscribe(...)` 写在组件脚本顶层，但没有在 `onDestroy` 中取消订阅，也没有用 `$gameWon` 配合 reactive statement 处理。作为根组件问题不一定立刻暴露，但从 Svelte 编程惯例看，这种手工订阅方式可维护性较差，也容易在组件复用时留下泄漏或重复触发问题。

## 优点

### 1. 开局流程已真正创建并切换领域 Game

- 位置：src/node_modules/@sudoku/game.js:13-33; src/node_modules/@sudoku/stores/grid.js:56-60; src/components/Modal/Types/Welcome.svelte:16-24
- 原因：欢迎弹窗触发 `startNew`/`startCustom`，最终进入 `bootstrapNewPuzzle()` 重建 `Game(createSudoku(...))`。这说明“开始一局游戏”已经接到真实 UI 流程，而不是只在测试里存在领域对象。

### 2. 主要用户操作都通过领域接口进入

- 位置：src/node_modules/@sudoku/stores/grid.js:103-134; src/components/Controls/Keyboard.svelte:10-25; src/components/Controls/ActionBar/Actions.svelte:13-32
- 原因：键盘输入、提示、Undo、Redo 都先调用 `userGrid` adapter，再委派给 `gameInstance.guess()/undo()/redo()`，组件没有直接改二维数组，满足了“View 真正消费领域对象”的核心要求。

### 3. Sudoku 对外暴露快照而非内部数组引用

- 位置：src/domain/index.js:74-127
- 原因：`getGrid()`、`clone()`、`toJSON()` 都基于深拷贝返回数据，避免 UI 或其他调用方直接拿到内部数组后随意 mutate，这一点体现了基本的封装意识。

### 4. Undo/Redo 被集中建模在 Game 中

- 位置：src/domain/index.js:236-271
- 原因：`Game` 负责记录 `{row,col,oldValue,newValue}` 历史并实现撤销重做，`Sudoku` 只处理局面变更，这个职责划分总体上比把历史逻辑塞进 UI 或直接塞进 `Sudoku` 更清晰。

### 5. 适配层清楚地回答了 Svelte 为什么会刷新

- 位置：src/node_modules/@sudoku/stores/grid.js:43-47
- 原因：`syncUserGridFromDomain()` 每次从领域对象导出新网格并写入 `writable`，是一个明确的 Store Adapter 方案，也体现了对 Svelte 3 store 响应式机制的正确理解。

## 补充说明

- 本次结论完全基于静态代码阅读，未运行测试，也未实际操作界面；涉及运行时行为、solver/hint 实际效果和异常路径的判断均属于静态推断。
- 评审范围按要求收敛在 `src/domain/index.js` 及其关联的 Svelte 接入代码：`src/node_modules/@sudoku/stores/grid.js`、`src/node_modules/@sudoku/stores/game.js`、`src/node_modules/@sudoku/stores/keyboard.js`、`src/node_modules/@sudoku/game.js`、`src/components/Board/index.svelte`、`src/components/Controls/Keyboard.svelte`、`src/components/Controls/ActionBar/Actions.svelte`、`src/components/Modal/Types/Welcome.svelte`、`src/App.svelte`。
- 由于没有实际运行，关于“UI 是否会在所有边界输入下稳定刷新”的结论来自对 store 更新路径和 `$store` 消费方式的静态审查，而不是运行验证。

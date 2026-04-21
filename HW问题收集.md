## HW 问题收集

列举在HW 1、HW1.1过程里，你所遇到的2\~3个通过自己学习已经解决的问题，和2\~3个尚未解决的问题与挑战

### 已解决

1. 啥是”标量derived store“ 有啥作用？
   1. **上下文**：Coding Agent 说：”UI 的棋盘、输入、Undo/Redo、胜利判断、分享编码全部直接读取领域对象公开接口；允许保留少量标量 derived store，但不再生成板级 view model。“ 
   2. **解决手段**：直接询问 CA + 查看资料后理解为：标量 derived store 是从主状态（如 `userGrid`）推导出来的“单值状态”（如 `gameWon`、`canUndoGame`），目的是减少重复状态、避免手动同步错误。只要源 store 更新，派生值会自动重算，适合做 UI 开关和状态提示。
2. 为啥“直接改二维数组元素”有时界面不刷新？
   1. **上下文**：在 HW1.1 接入时，最初尝试对已有数组做原地修改，发现 `invalidCells`、`gameWon` 等显示不稳定。
   2. **解决手段**：回看 Svelte 3 的 store 触发机制后，改成在领域对象变化后统一调用 `syncUserGridFromDomain()`，通过 `userGridInner.set(新的二维数组引用)` 同步；并在必要处做深拷贝，避免共享引用导致的“改了但没触发订阅”。
3. Undo/Redo 的历史到底该存什么？
   1. **上下文**：HW1 初版纠结要不要整盘 snapshot，还是只存一步操作。
   2. **解决手段**：结合 `DESIGN.md` 的反思与测试需求，最终使用 move 值对象 `{ row, col, oldValue, newValue }`。这样内存开销更小，语义贴合“回退一步”，并且 `undo/redo` 时复用 `Sudoku.guess` 即可完成状态回放。

### 未解决

1. 这个sameArea有啥用啊？

   1. **上下文**：`src/components/Board/index.svelte`

      ```javascript
      sameArea={$settings.highlightCells && !isSelected($cursor, x, y) && isSameArea($cursor, x, y)}
      ```

   2. **尝试解决手段**：问CA未果

2. `createGameFromJSON` 是否应该完整恢复历史栈？

   1. **上下文**：当前实现重点保证恢复当前盘面；`undoStack/redoStack` 暂未完整恢复。虽然满足当前测试，但不确定是否符合“完整会话恢复”的最佳实践。
   2. **尝试解决手段**：看了作业要求和现有测试，确认“当前盘面一致”可过；但对生产级设计（跨端同步、断点续玩）仍缺少明确结论。
3. `grid.js` 作为 store adapter 的边界还能怎么优化？

   1. **上下文**：目前 `gameInstance`、`syncUserGridFromDomain`、`bootstrapNewPuzzle` 都集中在 `grid.js`，功能可用但文件职责偏重。
   2. **尝试解决手段**：尝试从“可运行优先”角度先保持单文件；后续想探索拆出 `createGameStore()` 工厂与更清晰的模块边界，但还没形成可验证的重构方案（担心影响现有组件依赖）。
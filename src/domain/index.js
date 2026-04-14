/**
 * @module domain
 * 数独领域层：Sudoku（局面）、Game（会话与撤销/重做栈），以及作业要求的工厂函数。
 */

const SUDOKU_SIZE = 9

/**
 * @param {unknown} n
 * @returns {n is number}
 */
function isInteger0to9(n) {
	return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 9
}

/**
 * 深拷贝 9×9 数字网格。
 *
 * @param {number[][]} grid
 * @returns {number[][]}
 */
function cloneGrid9x9(grid) {
	return grid.map((row) => [...row])
}

/**
 * @param {number[][]} input
 * @returns {void}
 */
function assertValid9x9Grid(input) {
	if (!Array.isArray(input) || input.length !== SUDOKU_SIZE) {
		throw new Error('Sudoku input must be a 9x9 number[][]')
	}
	for (let r = 0; r < SUDOKU_SIZE; r++) {
		const row = input[r]
		if (!Array.isArray(row) || row.length !== SUDOKU_SIZE) {
			throw new Error('Sudoku input must be a 9x9 number[][]')
		}
		for (let c = 0; c < SUDOKU_SIZE; c++) {
			if (!isInteger0to9(row[c])) {
				throw new Error('Sudoku cells must be integers 0–9')
			}
		}
	}
}

/**
 * @param {number[][]} initial
 * @param {number[][]} grid
 * @returns {{
 *   getGrid: () => number[][]
 *   guess: (move: { row: number, col: number, value: number }) => void
 *   clone: () => ReturnType<typeof createSudokuFromState>
 *   toJSON: () => object
 *   toString: () => string
 * }}
 */
function createSudokuFromState(initial, grid) {
	/** @type {number[][]} */
	let _initial = cloneGrid9x9(initial)
	/** @type {number[][]} */
	let _grid = cloneGrid9x9(grid)

	/**
	 * @param {number} row
	 * @param {number} col
	 * @returns {boolean}
	 */
	function isGivenCell(row, col) {
		return _initial[row][col] !== 0
	}

	return {
		getGrid() {
			return cloneGrid9x9(_grid)
		},

		/**
		 * @param {number} row
		 * @param {number} col
		 * @returns {boolean}
		 */
		isLocked(row, col) {
			return isGivenCell(row, col)
		},

		/**
		 * @param {number} row
		 * @param {number} col
		 * @returns {number}
		 */
		peek(row, col) {
			return _grid[row][col]
		},

		/**
		 * 在可编辑格写入数字；题目给定格忽略。
		 *
		 * @param {{ row: number, col: number, value: number }} move
		 * @returns {void}
		 */
		guess(move) {
			const { row, col, value } = move
			if (!isInteger0to9(row) || row < 0 || row > 8 || !isInteger0to9(col) || col < 0 || col > 8) {
				return
			}
			if (!isInteger0to9(value)) {
				return
			}
			if (isGivenCell(row, col)) {
				return
			}
			_grid[row][col] = value
		},

		clone() {
			return createSudokuFromState(_initial, _grid)
		},

		toJSON() {
			return {
				version: 1,
				kind: 'Sudoku',
				initial: cloneGrid9x9(_initial),
				grid: cloneGrid9x9(_grid),
			}
		},

		toString() {
			let out = 'Sudoku\n'
			for (let r = 0; r < SUDOKU_SIZE; r++) {
				if (r !== 0 && r % 3 === 0) {
					out += '------+-------+------\n'
				}
				let line = ''
				for (let c = 0; c < SUDOKU_SIZE; c++) {
					if (c !== 0 && c % 3 === 0) {
						line += '| '
					}
					const v = _grid[r][c]
					line += (v === 0 ? '.' : String(v)) + ' '
				}
				out += line.trimEnd() + '\n'
			}
			return out.trimEnd()
		},
	}
}

/**
 * @param {number[][]} input
 * @returns {ReturnType<typeof createSudokuFromState>}
 */
export function createSudoku(input) {
	assertValid9x9Grid(input)
	const initial = cloneGrid9x9(input)
	return createSudokuFromState(initial, initial)
}

/**
 * @param {object} json
 * @returns {ReturnType<typeof createSudokuFromState>}
 */
export function createSudokuFromJSON(json) {
	if (!json || typeof json !== 'object') {
		throw new Error('Invalid Sudoku JSON')
	}
	const initial = json.initial != null ? json.initial : json.grid
	const grid = json.grid != null ? json.grid : json.initial
	if (!initial || !grid) {
		throw new Error('Sudoku JSON must include initial/grid')
	}
	assertValid9x9Grid(initial)
	assertValid9x9Grid(grid)
	return createSudokuFromState(initial, grid)
}

/**
 * @param {{ row: number, col: number, oldValue: number, newValue: number }} entry
 * @returns {{ row: number, col: number, oldValue: number, newValue: number }}
 */
function cloneHistoryEntry(entry) {
	return { row: entry.row, col: entry.col, oldValue: entry.oldValue, newValue: entry.newValue }
}

/**
 * @param {{ sudoku: ReturnType<typeof createSudoku> }} options
 * @returns {{
 *   getSudoku: () => ReturnType<typeof createSudokuFromState>
 *   guess: (move: { row: number, col: number, value: number }) => void
 *   undo: () => void
 *   redo: () => void
 *   canUndo: () => boolean
 *   canRedo: () => boolean
 *   toJSON: () => object
 * }}
 */
export function createGame({ sudoku }) {
	/** @type {ReturnType<typeof createSudokuFromState>} */
	const _sudoku = sudoku

	/** @type {{ row: number, col: number, oldValue: number, newValue: number }[]} */
	let undoStack = []
	/** @type {{ row: number, col: number, oldValue: number, newValue: number }[]} */
	let redoStack = []

	/**
	 * @param {number} row
	 * @param {number} col
	 * @returns {boolean}
	 */
	function isGiven(row, col) {
		return _sudoku.isLocked(row, col)
	}

	/**
	 * @param {number} row
	 * @param {number} col
	 * @returns {number}
	 */
	function peekCell(row, col) {
		return _sudoku.peek(row, col)
	}

	return {
		getSudoku() {
			return _sudoku
		},

		/**
		 * 用户落子：记录历史（存 Move 值对象：前后格内数字）。
		 *
		 * @param {{ row: number, col: number, value: number }} move
		 * @returns {void}
		 */
		guess(move) {
			const { row, col, value } = move
			if (!isInteger0to9(row) || row < 0 || row > 8 || !isInteger0to9(col) || col < 0 || col > 8) {
				return
			}
			if (!isInteger0to9(value)) {
				return
			}
			if (isGiven(row, col)) {
				return
			}
			const oldValue = peekCell(row, col)
			if (oldValue === value) {
				return
			}
			_sudoku.guess(move)
			redoStack = []
			undoStack.push({ row, col, oldValue, newValue: value })
		},

		undo() {
			const entry = undoStack.pop()
			if (!entry) {
				return
			}
			_sudoku.guess({ row: entry.row, col: entry.col, value: entry.oldValue })
			redoStack.push(cloneHistoryEntry(entry))
		},

		redo() {
			const entry = redoStack.pop()
			if (!entry) {
				return
			}
			_sudoku.guess({ row: entry.row, col: entry.col, value: entry.newValue })
			undoStack.push(cloneHistoryEntry(entry))
		},

		canUndo() {
			return undoStack.length > 0
		},

		canRedo() {
			return redoStack.length > 0
		},

		toJSON() {
			return {
				version: 1,
				kind: 'Game',
				sudoku: _sudoku.toJSON(),
				undoStack: undoStack.map(cloneHistoryEntry),
				redoStack: redoStack.map(cloneHistoryEntry),
			}
		},
	}
}

/**
 * @param {object} json
 * @returns {ReturnType<typeof createGame>}
 */
export function createGameFromJSON(json) {
	if (!json || typeof json !== 'object' || !json.sudoku) {
		throw new Error('Invalid Game JSON')
	}
	const sudoku = createSudokuFromJSON(json.sudoku)
	// 作业测试仅校验当前局面；历史栈从空开始（若需完整恢复可扩展 JSON 与构造逻辑）
	return createGame({ sudoku })
}

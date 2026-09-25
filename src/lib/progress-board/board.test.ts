import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BOARD_FORMAT,
  BOARD_VERSION,
  MAX_IMPORT_BYTES,
  BoardValidationError,
  assertImportSize,
  calculateCountdown,
  makeBackup,
  parseBackupText,
  summarizeBoard,
  type ProgressBoard,
} from "./board";

const board: ProgressBoard = {
  id: "board-1",
  eventName: "秋季 Hack Day",
  deadline: "2026-10-01T10:00:00.000Z",
  createdAt: "2026-09-26T10:00:00.000Z",
  updatedAt: "2026-09-26T10:00:00.000Z",
  teams: [
    {
      id: "team-1",
      name: "北极星",
      tasks: [
        { id: "task-1", title: "完成原型", priority: "high", status: "done" },
        { id: "task-2", title: "准备路演", priority: "medium", status: "doing" },
      ],
    },
    {
      id: "team-2",
      name: "纸飞机",
      tasks: [{ id: "task-3", title: "部署演示", priority: "low", status: "todo" }],
    },
  ],
};

test("aggregates progress across multiple teams", () => {
  assert.deepEqual(summarizeBoard(board), {
    total: 3,
    done: 1,
    doing: 1,
    todo: 1,
    percent: 33,
  });
});

test("countdown never becomes negative after the deadline", () => {
  const active = calculateCountdown("2026-09-28T12:02:03.000Z", Date.parse("2026-09-26T10:00:00.000Z"));
  assert.deepEqual(active, {
    ended: false,
    days: 2,
    hours: 2,
    minutes: 2,
    seconds: 3,
    totalMilliseconds: 180_123_000,
  });

  assert.deepEqual(calculateCountdown("2026-09-25T00:00:00.000Z", Date.parse("2026-09-26T00:00:00.000Z")), {
    ended: true,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    totalMilliseconds: 0,
  });
});

test("round-trips a valid versioned backup", () => {
  const backup = makeBackup(board, "2026-09-26T12:00:00.000Z");
  assert.equal(backup.format, BOARD_FORMAT);
  assert.equal(backup.version, BOARD_VERSION);
  assert.deepEqual(parseBackupText(JSON.stringify(backup)), board);
});

test("rejects malformed, incompatible and duplicate untrusted data", () => {
  assert.throws(() => parseBackupText("{not-json"), BoardValidationError);
  assert.throws(
    () => parseBackupText(JSON.stringify({ ...makeBackup(board), version: 99 })),
    /版本不兼容/,
  );
  const duplicate = structuredClone(makeBackup(board));
  duplicate.board.teams[1].name = "  北极星  ";
  assert.throws(() => parseBackupText(JSON.stringify(duplicate)), /队伍名称.*重复/);
});

test("enforces the import byte ceiling before parsing", () => {
  assert.doesNotThrow(() => assertImportSize(MAX_IMPORT_BYTES));
  assert.throws(() => assertImportSize(MAX_IMPORT_BYTES + 1), /不能超过 512 KB/);
});

test("rejects invalid task enums and impossible timestamps", () => {
  const invalidStatus = structuredClone(makeBackup(board)) as unknown as {
    board: { teams: Array<{ tasks: Array<{ status: string }> }> };
  };
  invalidStatus.board.teams[0].tasks[0].status = "blocked";
  assert.throws(() => parseBackupText(JSON.stringify(invalidStatus)), /任务状态无效/);

  const invalidDate = structuredClone(makeBackup(board));
  invalidDate.board.deadline = "tomorrow-ish";
  assert.throws(() => parseBackupText(JSON.stringify(invalidDate)), /截止时间格式无效/);
});

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateAnswer } = require("../server");

const validAnswer = {
  user_id: "study-001",
  session_id: "550e8400-e29b-41d4-a716-446655440000",
  question_id: "k_q1",
  selected_option: "測試答案",
  is_correct: true,
  quiz_id: "pregnant_ch2",
};

test("accepts a valid quiz answer", () => {
  assert.deepEqual(validateAnswer(validAnswer), validAnswer);
});

test("rejects unknown quizzes and malformed question IDs", () => {
  assert.equal(validateAnswer({ ...validAnswer, quiz_id: "unknown" }), null);
  assert.equal(validateAnswer({ ...validAnswer, question_id: "DROP TABLE" }), null);
});

test("rejects oversized and incorrectly typed values", () => {
  assert.equal(validateAnswer({ ...validAnswer, selected_option: "x".repeat(501) }), null);
  assert.equal(validateAnswer({ ...validAnswer, is_correct: "true" }), null);
  assert.equal(validateAnswer({ ...validAnswer, user_id: "" }), null);
});

import assert from "node:assert/strict";
import { isProgressOnlyReply, selectRecentHistory } from "./demo-src/conversationContext.ts";

const transcript = [
  { role: "user", content: "My favorite color is cobalt blue." },
  { role: "assistant", content: "Hello!" },
  { role: "user", content: "What color did I tell you?" },
];
assert.deepEqual(selectRecentHistory(transcript), transcript);
assert.deepEqual(selectRecentHistory([...transcript, { role: "assistant", content: "Thinking on this device…" }]), transcript);
assert.deepEqual(selectRecentHistory(transcript, 30), transcript.slice(2));
assert.equal(isProgressOnlyReply("Testing new capabilities."), true);
assert.equal(isProgressOnlyReply("I'm checking that now."), true);
assert.equal(isProgressOnlyReply("Testing new capabilities can expose missing tools."), false);
assert.equal(isProgressOnlyReply("The answer is 4."), false);
assert.deepEqual(selectRecentHistory([...transcript, { role: "assistant", content: "Testing new capabilities." }]), transcript);
console.log("Local chat transcript selection: PASS");

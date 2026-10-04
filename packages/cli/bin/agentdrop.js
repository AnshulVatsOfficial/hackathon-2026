#!/usr/bin/env node
import("../dist/src/index.js").catch(err => {
  console.error("AgentDrop CLI Error:", err);
  process.exit(1);
});

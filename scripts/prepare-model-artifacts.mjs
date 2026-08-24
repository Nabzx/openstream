#!/usr/bin/env node
import { prepareModelArtifacts } from "./model-artifacts.mjs";

try {
  await prepareModelArtifacts();
  console.log("==> done");
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}

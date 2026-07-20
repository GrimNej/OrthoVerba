const major = Number(process.versions.node.split(".")[0]);
if (major < 22 || major >= 25) {
  console.error(`Node 22–24 is required; detected ${process.versions.node}.`);
  process.exit(1);
}
console.log(`Node ${process.versions.node} is supported.`);
console.log("No API keys or environment secrets are required.");

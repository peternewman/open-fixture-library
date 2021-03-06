#!/usr/bin/node

const path = require(`path`);
const colors = require(`colors`);
const childProcess = require(`child_process`);


// run make unconditionally
// (we can't rely on make's detection which builds are needed as git doesn't store the modification dates)
try {
  childProcess.execSync(`make --always-make --directory=${path.join(__dirname, `..`)}`);
}
catch (error) {
  console.error(`${colors.red(`[FAIL]`)} Unable to run Makefile:`, error);
  process.exit(1);
}

// check whether there are unstaged changes (probably created by running make before)
const result = childProcess.spawnSync(`git diff --exit-code`, {
  cwd: path.join(__dirname, `..`),
  shell: true,
  stdio: `inherit`
});
console.log(`\n`);


if (result.status !== 0) {
  console.error(`${colors.red(`[FAIL]`)} Make targets are not up-to-date or there are other unstaged changes. Please run \`make -B\` and stage (git add) all changes.`);
  process.exit(1);
}

console.log(`${colors.green(`[PASS]`)} Make targets are up-to-date.`);
process.exit(0);

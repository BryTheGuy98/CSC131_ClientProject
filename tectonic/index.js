const {exec} = require("child_process");
const {arch, platform} = require("os");
const path = require("path");
const {promisify} = require("node:util")
const execPromise = promisify(exec)
const binaries = {
  darwin: {
    arm64 : path.join(__dirname, "./bin/tectonic-mac-aarch64"),
    x64: path.join(__dirname, "./bin/tectonic-mac-x64")
  },
  linux: {
    x64: path.join(__dirname, "./bin/tectonic-linux-x64")
  }
}

const executable = binaries[platform()][arch()];

async function tectonic(args, options) {
  let command = `${executable} ${args}`;

  return await execPromise(command, options)
}

module.exports = tectonic
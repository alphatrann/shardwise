/** @type {import('jest').Config} */
module.exports = {
  transform: { "^.+\\.ts$": "ts-jest" },
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "/examples/"],
};

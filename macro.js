const path = require('path');
const child_process = require('child_process');
const { createMacro } = require("babel-plugin-macros");

/*
USAGE:
const loadRoutes = require("meta-router/macro");
app.use(require('meta-router/middleware').match(loadRoutes("/path/to/routes.json")));
*/
module.exports = createMacro(loadRoutesMacro);

function loadRoutesMacro({ references, state, babel }) {
  const filename = state.file.opts.filename;
  const dirname = path.dirname(filename);
  references.default.forEach(referencePath => {
    if (referencePath.parentPath.type === "CallExpression") {
      const callExpressionPath = referencePath.parentPath;
      const routesPath = getArguments(callExpressionPath)[0];

      if (routesPath === undefined) {
        throw new Error(`There was no path passed to the meta-router/macro: ${callExpressionPath.getSource()}.`);
      }

      const resolvedRoutesPath = path.resolve(dirname, routesPath);
      const replacementAST = loadRoutesAsAST(resolvedRoutesPath, dirname, babel.types);

      callExpressionPath.replaceWith(replacementAST);
    } else {
      throw new Error(
        `The meta-router/macro must be used as a function: \`${referencePath
          .findParent(babel.types.isExpression)
          .getSource()}\`.`,
      );
    }
  });
}

function getArguments(callExpressionPath) {
  let args;
  try {
    args = callExpressionPath.get("arguments").map(arg => arg.evaluate().value);
  } catch (err) {
    // swallow error, print better error below
  }
  if (args === undefined) {
    throw new Error(
      `There was a problem evaluating the arguments for the code: ${callExpressionPath.getSource()}. ` +
        `If the arguments are dynamic, please make sure that their values are statically deterministic.`,
    );
  }
  return args;
}

function loadRoutesAsAST(routesPath, dirname, types) {
  const config = evalSync(cb => `require("./lib/routes-loader").loadWithoutRequire(${JSON.stringify(routesPath)}, ${cb})`);
  return toASTWithRequires(config, dirname, types);
}

function evalSync(getCode) {
  const cb = "(err, value) => process.stdout.write(JSON.stringify(value))";
  const code = getCode(cb);
  const json = child_process.spawnSync(process.argv[0], ['-e', code], { cwd:__dirname }).stdout.toString();
  return JSON.parse(json);
}

function toASTWithRequires(value, dirname, t) {
  if (value === null) {
    return t.nullLiteral();
  }
  switch (typeof value) {
  case 'number':
    return t.numericLiteral(value);
  case 'string':
    return t.stringLiteral(value);
  case 'boolean':
    return t.booleanLiteral(value);
  case 'undefined':
    return t.unaryExpression('void', t.numericLiteral(0), true);
  default:
    if (Array.isArray(value)) {
      return t.arrayExpression(value.map(v => toASTWithRequires(v, dirname, t)));
    }
    if (value.require && value.path) {
      value.path = path.relative(dirname, value.path);
      if (value.path !== '.') {
        value.path = './' + value.path;
      }
      const requireCall = t.callExpression(t.identifier('require'), [t.stringLiteral(value.path)]);
      if (value.methodName) {
        return t.memberExpression(requireCall, t.identifier(value.methodName));
      }
      return requireCall;
    }
    return t.objectExpression(Object.keys(value)
      .filter((k) => {
        return typeof value[k] !== 'undefined';
      })
      .map((k) => {
        return t.objectProperty(
          t.stringLiteral(k),
          toASTWithRequires(value[k], dirname, t)
        );
      }));
  }
}
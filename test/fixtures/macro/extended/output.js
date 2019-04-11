module.exports = [{
  "path": "GET /users/:user",
  "foo": "bar",
  "handler": require("./../../user.js")
}, {
  "path": "GET /foo",
  "handler": require("./../../user.js").foo
}, {
  "path": "GET /bar",
  "handler": require("./../../user.js").bar
}];
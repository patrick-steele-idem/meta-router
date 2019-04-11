module.exports = [{
  "path": "GET /users/:user",
  "handler": require("./../../user-with-meta.js")
}, {
  "path": "GET /foo",
  "handler": require("./../../user-with-meta.js").foo
}, {
  "bar": true,
  "path": "GET /bar",
  "handler": require("./../../user-with-meta.js").bar
}];
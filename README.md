
## ff-devtools-libs

This is an experimental repo whose sole purpose is to allow developing
Firefox Developer Tools code in a normal HTML context. It originated
from the [devtools.html](https://github.com/joewalker/devtools.html)
experiment.

The most important piece is a WebSocket transport that allows the page
to connect to a remote Firefox debugger instance. This lets a normal
HTML page access a real live debugging environment.

A lot of other dependencies are provided as well. **If you develop
against this, your code should run without changes just fine in the
Firefox DevTools context as well**.

Install it via npm:

```
npm install ff-devtools-libs
```

The version published to npm has been compiled with babel to ensure
that it will run in all environments (particularly node). See [1] for
how it was compiled.

Connecting a remote is as easy as (see below for aliasing `devtools`
to `ff-devtools-libs`):

```js
const { DebuggerClient } = require('ff-devtools-libs/shared/client/main');
const { DebuggerTransport } = require('ff-devtools-libs/transport/transport');
const { TargetFactory } = require("ff-devtools-libs/client/framework/target");
const socket = new WebSocket("ws://localhost:9000");
const transport = new DebuggerTransport(socket);
const client = new DebuggerClient(transport);
```

And then you can make whatever API calls you need:

```js
yield client.connect();
const response = yield client.listTabs();
const tab = response.tabs[response.selected];
const options = { form: tab, client, chrome: false };
const target = yield TargetFactory.forRemoteTab(options);

target.activeTab.attachThread({}, (res, threadClient) => {
  threadClient.resume();
});
```

Lastly, you need to run a separate proxy for this to work. This sets
up a websocket connection that forwards everything to the native
devtools TCP connection.

```
firefox-proxy [--web-socket-port 9000] [--tcp-port 6080]
```

`firefox-proxy` is installed with this module, and it exists at
`node_modules/.bin/firefox-proxy`. It is recommend to run it in
whatever `run` task you have in your npm scripts or gulpfile. It's a
simple JS file in the `bin` directory, so you may run `node
node_modules/ff-devtools-libs/bin/firefox-proxy` as well.

[1] The babel command to compile all the files:

```
babel --plugins transform-es2015-spread,transform-es2015-block-scoping,transform-es2015-destructuring,transform-async-to-generator,transform-es2015-parameters \
  -d ff-devtools-libs ff-devtools-libs-src
```
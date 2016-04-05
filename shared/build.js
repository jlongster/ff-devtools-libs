var Client =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
	/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
	/* This Source Code Form is subject to the terms of the Mozilla Public
	 * License, v. 2.0. If a copy of the MPL was not distributed with this
	 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

	"use strict";

	var _require = __webpack_require__(1);

	const Ci = _require.Ci;
	const Cu = _require.Cu;
	const components = _require.components;

	const Services = __webpack_require__(6);
	const DevToolsUtils = __webpack_require__(12);

	// WARNING I swapped the sync one for the async one here
	//const promise = require("resource://devtools/shared/deprecated-sync-thenables.js", {}).Promise;
	const promise = __webpack_require__(13);

	const events = __webpack_require__(19);

	var _require2 = __webpack_require__(22);

	const WebConsoleClient = _require2.WebConsoleClient;
	/*const { DebuggerSocket } = require("devtools/shared/security/socket");*/
	/*const Authentication = require("devtools/shared/security/auth");*/

	const noop = function () {};

	/**
	 * TODO: Get rid of this API in favor of EventTarget (bug 1042642)
	 *
	 * Add simple event notification to a prototype object. Any object that has
	 * some use for event notifications or the observer pattern in general can be
	 * augmented with the necessary facilities by passing its prototype to this
	 * function.
	 *
	 * @param aProto object
	 *        The prototype object that will be modified.
	 */
	function eventSource(aProto) {
	  /**
	   * Add a listener to the event source for a given event.
	   *
	   * @param aName string
	   *        The event to listen for.
	   * @param aListener function
	   *        Called when the event is fired. If the same listener
	   *        is added more than once, it will be called once per
	   *        addListener call.
	   */
	  aProto.addListener = function (aName, aListener) {
	    if (typeof aListener != "function") {
	      throw TypeError("Listeners must be functions.");
	    }

	    if (!this._listeners) {
	      this._listeners = {};
	    }

	    this._getListeners(aName).push(aListener);
	  };

	  /**
	   * Add a listener to the event source for a given event. The
	   * listener will be removed after it is called for the first time.
	   *
	   * @param aName string
	   *        The event to listen for.
	   * @param aListener function
	   *        Called when the event is fired.
	   */
	  aProto.addOneTimeListener = function (aName, aListener) {
	    var _this = this;

	    let l = function (...args) {
	      _this.removeListener(aName, l);
	      aListener.apply(null, args);
	    };
	    this.addListener(aName, l);
	  };

	  /**
	   * Remove a listener from the event source previously added with
	   * addListener().
	   *
	   * @param aName string
	   *        The event name used during addListener to add the listener.
	   * @param aListener function
	   *        The callback to remove. If addListener was called multiple
	   *        times, all instances will be removed.
	   */
	  aProto.removeListener = function (aName, aListener) {
	    if (!this._listeners || aListener && !this._listeners[aName]) {
	      return;
	    }

	    if (!aListener) {
	      this._listeners[aName] = [];
	    } else {
	      this._listeners[aName] = this._listeners[aName].filter(function (l) {
	        return l != aListener;
	      });
	    }
	  };

	  /**
	   * Returns the listeners for the specified event name. If none are defined it
	   * initializes an empty list and returns that.
	   *
	   * @param aName string
	   *        The event name.
	   */
	  aProto._getListeners = function (aName) {
	    if (aName in this._listeners) {
	      return this._listeners[aName];
	    }
	    this._listeners[aName] = [];
	    return this._listeners[aName];
	  };

	  /**
	   * Notify listeners of an event.
	   *
	   * @param aName string
	   *        The event to fire.
	   * @param arguments
	   *        All arguments will be passed along to the listeners,
	   *        including the name argument.
	   */
	  aProto.emit = function () {
	    if (!this._listeners) {
	      return;
	    }

	    let name = arguments[0];
	    let listeners = this._getListeners(name).slice(0);

	    for (let listener of listeners) {
	      try {
	        listener.apply(null, arguments);
	      } catch (e) {
	        // Prevent a bad listener from interfering with the others.
	        DevToolsUtils.reportException("notify event '" + name + "'", e);
	      }
	    }
	  };
	}

	/**
	 * Set of protocol messages that affect thread state, and the
	 * state the actor is in after each message.
	 */
	const ThreadStateTypes = {
	  "paused": "paused",
	  "resumed": "attached",
	  "detached": "detached"
	};

	/**
	 * Set of protocol messages that are sent by the server without a prior request
	 * by the client.
	 */
	const UnsolicitedNotifications = {
	  "consoleAPICall": "consoleAPICall",
	  "eventNotification": "eventNotification",
	  "fileActivity": "fileActivity",
	  "lastPrivateContextExited": "lastPrivateContextExited",
	  "logMessage": "logMessage",
	  "networkEvent": "networkEvent",
	  "networkEventUpdate": "networkEventUpdate",
	  "newGlobal": "newGlobal",
	  "newScript": "newScript",
	  "tabDetached": "tabDetached",
	  "tabListChanged": "tabListChanged",
	  "reflowActivity": "reflowActivity",
	  "addonListChanged": "addonListChanged",
	  "workerListChanged": "workerListChanged",
	  "tabNavigated": "tabNavigated",
	  "frameUpdate": "frameUpdate",
	  "pageError": "pageError",
	  "documentLoad": "documentLoad",
	  "enteredFrame": "enteredFrame",
	  "exitedFrame": "exitedFrame",
	  "appOpen": "appOpen",
	  "appClose": "appClose",
	  "appInstall": "appInstall",
	  "appUninstall": "appUninstall",
	  "evaluationResult": "evaluationResult"
	};

	/**
	 * Set of pause types that are sent by the server and not as an immediate
	 * response to a client request.
	 */
	const UnsolicitedPauses = {
	  "resumeLimit": "resumeLimit",
	  "debuggerStatement": "debuggerStatement",
	  "breakpoint": "breakpoint",
	  "DOMEvent": "DOMEvent",
	  "watchpoint": "watchpoint",
	  "exception": "exception"
	};

	/**
	 * Creates a client for the remote debugging protocol server. This client
	 * provides the means to communicate with the server and exchange the messages
	 * required by the protocol in a traditional JavaScript API.
	 */
	const DebuggerClient = exports.DebuggerClient = function (aTransport) {
	  var _this2 = this;

	  this._transport = aTransport;
	  this._transport.hooks = this;

	  // Map actor ID to client instance for each actor type.
	  this._clients = new Map();

	  this._pendingRequests = new Map();
	  this._activeRequests = new Map();
	  this._eventsEnabled = true;

	  this.traits = {};

	  this.request = this.request.bind(this);
	  this.localTransport = this._transport.onOutputStreamReady === undefined;

	  /*
	   * As the first thing on the connection, expect a greeting packet from
	   * the connection's root actor.
	   */
	  this.mainRoot = null;
	  this.expectReply("root", function (aPacket) {
	    _this2.mainRoot = new RootClient(_this2, aPacket);
	    _this2.emit("connected", aPacket.applicationType, aPacket.traits);
	  });
	};

	/**
	 * A declarative helper for defining methods that send requests to the server.
	 *
	 * @param aPacketSkeleton
	 *        The form of the packet to send. Can specify fields to be filled from
	 *        the parameters by using the |args| function.
	 * @param telemetry
	 *        The unique suffix of the telemetry histogram id.
	 * @param before
	 *        The function to call before sending the packet. Is passed the packet,
	 *        and the return value is used as the new packet. The |this| context is
	 *        the instance of the client object we are defining a method for.
	 * @param after
	 *        The function to call after the response is received. It is passed the
	 *        response, and the return value is considered the new response that
	 *        will be passed to the callback. The |this| context is the instance of
	 *        the client object we are defining a method for.
	 */
	DebuggerClient.requester = function (aPacketSkeleton, { telemetry, before, after }) {
	  return DevToolsUtils.makeInfallible(function (...args) {
	    var _this3 = this;

	    let histogram, startTime;
	    if (telemetry) {
	      let transportType = this._transport.onOutputStreamReady === undefined ? "LOCAL_" : "REMOTE_";
	      let histogramId = "DEVTOOLS_DEBUGGER_RDP_" + transportType + telemetry + "_MS";
	      // histogram = Services.telemetry.getHistogramById(histogramId);
	      startTime = +new Date();
	    }
	    let outgoingPacket = {
	      to: aPacketSkeleton.to || this.actor
	    };

	    let maxPosition = -1;
	    for (let k of Object.keys(aPacketSkeleton)) {
	      if (aPacketSkeleton[k] instanceof DebuggerClient.Argument) {
	        let position = aPacketSkeleton[k].position;

	        outgoingPacket[k] = aPacketSkeleton[k].getArgument(args);
	        maxPosition = Math.max(position, maxPosition);
	      } else {
	        outgoingPacket[k] = aPacketSkeleton[k];
	      }
	    }

	    if (before) {
	      outgoingPacket = before.call(this, outgoingPacket);
	    }

	    return this.request(outgoingPacket, DevToolsUtils.makeInfallible(function (aResponse) {
	      if (after) {
	        var _aResponse = aResponse;
	        let from = _aResponse.from;

	        aResponse = after.call(_this3, aResponse);
	        if (!aResponse.from) {
	          aResponse.from = from;
	        }
	      }

	      // The callback is always the last parameter.
	      let thisCallback = args[maxPosition + 1];
	      if (thisCallback) {
	        thisCallback(aResponse);
	      }

	      if (histogram) {
	        histogram.add(+new Date() - startTime);
	      }
	    }, "DebuggerClient.requester request callback"));
	  }, "DebuggerClient.requester");
	};

	function args(aPos) {
	  return new DebuggerClient.Argument(aPos);
	}

	DebuggerClient.Argument = function (aPosition) {
	  this.position = aPosition;
	};

	DebuggerClient.Argument.prototype.getArgument = function (aParams) {
	  if (!(this.position in aParams)) {
	    throw new Error("Bad index into params: " + this.position);
	  }
	  return aParams[this.position];
	};

	// Expose these to save callers the trouble of importing DebuggerSocket
	DebuggerClient.socketConnect = function (options) {
	  // Defined here instead of just copying the function to allow lazy-load
	  return DebuggerSocket.connect(options);
	};
	DevToolsUtils.defineLazyGetter(DebuggerClient, "Authenticators", function () {
	  return Authentication.Authenticators;
	});
	DevToolsUtils.defineLazyGetter(DebuggerClient, "AuthenticationResult", function () {
	  return Authentication.AuthenticationResult;
	});

	DebuggerClient.prototype = {
	  /**
	   * Connect to the server and start exchanging protocol messages.
	   *
	   * @param aOnConnected function
	   *        If specified, will be called when the greeting packet is
	   *        received from the debugging server.
	   */
	  connect: function (aOnConnected) {
	    var _this4 = this;

	    let deferred = promise.defer();

	    this.emit("connect");

	    // Also emit the event on the |DebuggerServer| object (not on
	    // the instance), so it's possible to track all instances.
	    events.emit(DebuggerClient, "connect", this);

	    this.addOneTimeListener("connected", function (aName, aApplicationType, aTraits) {
	      _this4.traits = aTraits;
	      if (aOnConnected) {
	        aOnConnected(aApplicationType, aTraits);
	      }
	      deferred.resolve();
	    });

	    this._transport.ready();
	    return deferred.promise;
	  },

	  /**
	   * Shut down communication with the debugging server.
	   *
	   * @param aOnClosed function
	   *        If specified, will be called when the debugging connection
	   *        has been closed.
	   */
	  close: function (aOnClosed) {
	    var _this5 = this;

	    // Disable detach event notifications, because event handlers will be in a
	    // cleared scope by the time they run.
	    this._eventsEnabled = false;

	    let cleanup = function () {
	      _this5._transport.close();
	      _this5._transport = null;
	    };

	    // If the connection is already closed,
	    // there is no need to detach client
	    // as we won't be able to send any message.
	    if (this._closed) {
	      cleanup();
	      if (aOnClosed) {
	        aOnClosed();
	      }
	      return;
	    }

	    if (aOnClosed) {
	      this.addOneTimeListener('closed', function (aEvent) {
	        aOnClosed();
	      });
	    }

	    // Call each client's `detach` method by calling
	    // lastly registered ones first to give a chance
	    // to detach child clients first.
	    let clients = [...this._clients.values()];
	    this._clients.clear();
	    const detachClients = function () {
	      let client = clients.pop();
	      if (!client) {
	        // All clients detached.
	        cleanup();
	        return;
	      }
	      if (client.detach) {
	        client.detach(detachClients);
	        return;
	      }
	      detachClients();
	    };
	    detachClients();
	  },

	  /*
	   * This function exists only to preserve DebuggerClient's interface;
	   * new code should say 'client.mainRoot.listTabs()'.
	   */
	  listTabs: function (aOnResponse) {
	    return this.mainRoot.listTabs(aOnResponse);
	  },

	  /*
	   * This function exists only to preserve DebuggerClient's interface;
	   * new code should say 'client.mainRoot.listAddons()'.
	   */
	  listAddons: function (aOnResponse) {
	    return this.mainRoot.listAddons(aOnResponse);
	  },

	  getTab: function (aFilter) {
	    return this.mainRoot.getTab(aFilter);
	  },

	  /**
	   * Attach to a tab actor.
	   *
	   * @param string aTabActor
	   *        The actor ID for the tab to attach.
	   * @param function aOnResponse
	   *        Called with the response packet and a TabClient
	   *        (which will be undefined on error).
	   */
	  attachTab: function (aTabActor, aOnResponse = noop) {
	    var _this6 = this;

	    if (this._clients.has(aTabActor)) {
	      let cachedTab = this._clients.get(aTabActor);
	      let cachedResponse = {
	        cacheDisabled: cachedTab.cacheDisabled,
	        javascriptEnabled: cachedTab.javascriptEnabled,
	        traits: cachedTab.traits
	      };
	      DevToolsUtils.executeSoon(function () {
	        return aOnResponse(cachedResponse, cachedTab);
	      });
	      return;
	    }

	    let packet = {
	      to: aTabActor,
	      type: "attach"
	    };
	    this.request(packet, function (aResponse) {
	      let tabClient;
	      if (!aResponse.error) {
	        tabClient = new TabClient(_this6, aResponse);
	        _this6.registerClient(tabClient);
	      }
	      aOnResponse(aResponse, tabClient);
	    });
	  },

	  attachWorker: function DC_attachWorker(aWorkerActor, aOnResponse = noop) {
	    var _this7 = this;

	    let workerClient = this._clients.get(aWorkerActor);
	    if (workerClient !== undefined) {
	      DevToolsUtils.executeSoon(function () {
	        return aOnResponse({
	          from: workerClient.actor,
	          type: "attached",
	          url: workerClient.url
	        }, workerClient);
	      });
	      return;
	    }

	    this.request({ to: aWorkerActor, type: "attach" }, function (aResponse) {
	      if (aResponse.error) {
	        aOnResponse(aResponse, null);
	        return;
	      }

	      let workerClient = new WorkerClient(_this7, aResponse);
	      _this7.registerClient(workerClient);
	      aOnResponse(aResponse, workerClient);
	    });
	  },

	  /**
	   * Attach to an addon actor.
	   *
	   * @param string aAddonActor
	   *        The actor ID for the addon to attach.
	   * @param function aOnResponse
	   *        Called with the response packet and a AddonClient
	   *        (which will be undefined on error).
	   */
	  attachAddon: function DC_attachAddon(aAddonActor, aOnResponse = noop) {
	    var _this8 = this;

	    let packet = {
	      to: aAddonActor,
	      type: "attach"
	    };
	    this.request(packet, function (aResponse) {
	      let addonClient;
	      if (!aResponse.error) {
	        addonClient = new AddonClient(_this8, aAddonActor);
	        _this8.registerClient(addonClient);
	        _this8.activeAddon = addonClient;
	      }
	      aOnResponse(aResponse, addonClient);
	    });
	  },

	  /**
	   * Attach to a Web Console actor.
	   *
	   * @param string aConsoleActor
	   *        The ID for the console actor to attach to.
	   * @param array aListeners
	   *        The console listeners you want to start.
	   * @param function aOnResponse
	   *        Called with the response packet and a WebConsoleClient
	   *        instance (which will be undefined on error).
	   */
	  attachConsole: function (aConsoleActor, aListeners, aOnResponse = noop) {
	    var _this9 = this;

	    let packet = {
	      to: aConsoleActor,
	      type: "startListeners",
	      listeners: aListeners
	    };

	    this.request(packet, function (aResponse) {
	      let consoleClient;
	      if (!aResponse.error) {
	        if (_this9._clients.has(aConsoleActor)) {
	          consoleClient = _this9._clients.get(aConsoleActor);
	        } else {
	          consoleClient = new WebConsoleClient(_this9, aResponse);
	          _this9.registerClient(consoleClient);
	        }
	      }
	      aOnResponse(aResponse, consoleClient);
	    });
	  },

	  /**
	   * Attach to a global-scoped thread actor for chrome debugging.
	   *
	   * @param string aThreadActor
	   *        The actor ID for the thread to attach.
	   * @param function aOnResponse
	   *        Called with the response packet and a ThreadClient
	   *        (which will be undefined on error).
	   * @param object aOptions
	   *        Configuration options.
	   *        - useSourceMaps: whether to use source maps or not.
	   */
	  attachThread: function (aThreadActor, aOnResponse = noop, aOptions = {}) {
	    var _this10 = this;

	    if (this._clients.has(aThreadActor)) {
	      DevToolsUtils.executeSoon(function () {
	        return aOnResponse({}, _this10._clients.get(aThreadActor));
	      });
	      return;
	    }

	    let packet = {
	      to: aThreadActor,
	      type: "attach",
	      options: aOptions
	    };
	    this.request(packet, function (aResponse) {
	      if (!aResponse.error) {
	        var threadClient = new ThreadClient(_this10, aThreadActor);
	        _this10.registerClient(threadClient);
	      }
	      aOnResponse(aResponse, threadClient);
	    });
	  },

	  /**
	   * Attach to a trace actor.
	   *
	   * @param string aTraceActor
	   *        The actor ID for the tracer to attach.
	   * @param function aOnResponse
	   *        Called with the response packet and a TraceClient
	   *        (which will be undefined on error).
	   */
	  attachTracer: function (aTraceActor, aOnResponse = noop) {
	    var _this11 = this;

	    if (this._clients.has(aTraceActor)) {
	      DevToolsUtils.executeSoon(function () {
	        return aOnResponse({}, _this11._clients.get(aTraceActor));
	      });
	      return;
	    }

	    let packet = {
	      to: aTraceActor,
	      type: "attach"
	    };
	    this.request(packet, function (aResponse) {
	      if (!aResponse.error) {
	        var traceClient = new TraceClient(_this11, aTraceActor);
	        _this11.registerClient(traceClient);
	      }
	      aOnResponse(aResponse, traceClient);
	    });
	  },

	  /**
	   * Fetch the ChromeActor for the main process or ChildProcessActor for a
	   * a given child process ID.
	   *
	   * @param number aId
	   *        The ID for the process to attach (returned by `listProcesses`).
	   *        Connected to the main process if omitted, or is 0.
	   */
	  getProcess: function (aId) {
	    let packet = {
	      to: "root",
	      type: "getProcess"
	    };
	    if (typeof aId == "number") {
	      packet.id = aId;
	    }
	    return this.request(packet);
	  },

	  /**
	   * Release an object actor.
	   *
	   * @param string aActor
	   *        The actor ID to send the request to.
	   * @param aOnResponse function
	   *        If specified, will be called with the response packet when
	   *        debugging server responds.
	   */
	  release: DebuggerClient.requester({
	    to: args(0),
	    type: "release"
	  }, {
	    telemetry: "RELEASE"
	  }),

	  /**
	   * Send a request to the debugging server.
	   *
	   * @param aRequest object
	   *        A JSON packet to send to the debugging server.
	   * @param aOnResponse function
	   *        If specified, will be called with the JSON response packet when
	   *        debugging server responds.
	   * @return Request
	   *         This object emits a number of events to allow you to respond to
	   *         different parts of the request lifecycle.
	   *         It is also a Promise object, with a `then` method, that is resolved
	   *         whenever a JSON or a Bulk response is received; and is rejected
	   *         if the response is an error.
	   *         Note: This return value can be ignored if you are using JSON alone,
	   *         because the callback provided in |aOnResponse| will be bound to the
	   *         "json-reply" event automatically.
	   *
	   *         Events emitted:
	   *         * json-reply: The server replied with a JSON packet, which is
	   *           passed as event data.
	   *         * bulk-reply: The server replied with bulk data, which you can read
	   *           using the event data object containing:
	   *           * actor:  Name of actor that received the packet
	   *           * type:   Name of actor's method that was called on receipt
	   *           * length: Size of the data to be read
	   *           * stream: This input stream should only be used directly if you
	   *                     can ensure that you will read exactly |length| bytes
	   *                     and will not close the stream when reading is complete
	   *           * done:   If you use the stream directly (instead of |copyTo|
	   *                     below), you must signal completion by resolving /
	   *                     rejecting this deferred.  If it's rejected, the
	   *                     transport will be closed.  If an Error is supplied as a
	   *                     rejection value, it will be logged via |dumpn|.  If you
	   *                     do use |copyTo|, resolving is taken care of for you
	   *                     when copying completes.
	   *           * copyTo: A helper function for getting your data out of the
	   *                     stream that meets the stream handling requirements
	   *                     above, and has the following signature:
	   *             @param  output nsIAsyncOutputStream
	   *                     The stream to copy to.
	   *             @return Promise
	   *                     The promise is resolved when copying completes or
	   *                     rejected if any (unexpected) errors occur.
	   *                     This object also emits "progress" events for each chunk
	   *                     that is copied.  See stream-utils.js.
	   */
	  request: function (aRequest, aOnResponse) {
	    if (!this.mainRoot) {
	      throw Error("Have not yet received a hello packet from the server.");
	    }
	    let type = aRequest.type || "";
	    if (!aRequest.to) {
	      throw Error("'" + type + "' request packet has no destination.");
	    }
	    if (this._closed) {
	      let msg = "'" + type + "' request packet to " + "'" + aRequest.to + "' " + "can't be sent as the connection is closed.";
	      let resp = { error: "connectionClosed", message: msg };
	      if (aOnResponse) {
	        aOnResponse(resp);
	      }
	      return promise.reject(resp);
	    }

	    let request = new Request(aRequest);
	    request.format = "json";
	    request.stack = components.stack;
	    if (aOnResponse) {
	      request.on("json-reply", aOnResponse);
	    }

	    this._sendOrQueueRequest(request);

	    // Implement a Promise like API on the returned object
	    // that resolves/rejects on request response
	    let deferred = promise.defer();
	    function listenerJson(resp) {
	      request.off("json-reply", listenerJson);
	      request.off("bulk-reply", listenerBulk);
	      if (resp.error) {
	        deferred.reject(resp);
	      } else {
	        deferred.resolve(resp);
	      }
	    }
	    function listenerBulk(resp) {
	      request.off("json-reply", listenerJson);
	      request.off("bulk-reply", listenerBulk);
	      deferred.resolve(resp);
	    }
	    request.on("json-reply", listenerJson);
	    request.on("bulk-reply", listenerBulk);
	    request.then = deferred.promise.then.bind(deferred.promise);

	    return request;
	  },

	  /**
	   * Transmit streaming data via a bulk request.
	   *
	   * This method initiates the bulk send process by queuing up the header data.
	   * The caller receives eventual access to a stream for writing.
	   *
	   * Since this opens up more options for how the server might respond (it could
	   * send back either JSON or bulk data), and the returned Request object emits
	   * events for different stages of the request process that you may want to
	   * react to.
	   *
	   * @param request Object
	   *        This is modeled after the format of JSON packets above, but does not
	   *        actually contain the data, but is instead just a routing header:
	   *          * actor:  Name of actor that will receive the packet
	   *          * type:   Name of actor's method that should be called on receipt
	   *          * length: Size of the data to be sent
	   * @return Request
	   *         This object emits a number of events to allow you to respond to
	   *         different parts of the request lifecycle.
	   *
	   *         Events emitted:
	   *         * bulk-send-ready: Ready to send bulk data to the server, using the
	   *           event data object containing:
	   *           * stream:   This output stream should only be used directly if
	   *                       you can ensure that you will write exactly |length|
	   *                       bytes and will not close the stream when writing is
	   *                       complete
	   *           * done:     If you use the stream directly (instead of |copyFrom|
	   *                       below), you must signal completion by resolving /
	   *                       rejecting this deferred.  If it's rejected, the
	   *                       transport will be closed.  If an Error is supplied as
	   *                       a rejection value, it will be logged via |dumpn|.  If
	   *                       you do use |copyFrom|, resolving is taken care of for
	   *                       you when copying completes.
	   *           * copyFrom: A helper function for getting your data onto the
	   *                       stream that meets the stream handling requirements
	   *                       above, and has the following signature:
	   *             @param  input nsIAsyncInputStream
	   *                     The stream to copy from.
	   *             @return Promise
	   *                     The promise is resolved when copying completes or
	   *                     rejected if any (unexpected) errors occur.
	   *                     This object also emits "progress" events for each chunk
	   *                     that is copied.  See stream-utils.js.
	   *         * json-reply: The server replied with a JSON packet, which is
	   *           passed as event data.
	   *         * bulk-reply: The server replied with bulk data, which you can read
	   *           using the event data object containing:
	   *           * actor:  Name of actor that received the packet
	   *           * type:   Name of actor's method that was called on receipt
	   *           * length: Size of the data to be read
	   *           * stream: This input stream should only be used directly if you
	   *                     can ensure that you will read exactly |length| bytes
	   *                     and will not close the stream when reading is complete
	   *           * done:   If you use the stream directly (instead of |copyTo|
	   *                     below), you must signal completion by resolving /
	   *                     rejecting this deferred.  If it's rejected, the
	   *                     transport will be closed.  If an Error is supplied as a
	   *                     rejection value, it will be logged via |dumpn|.  If you
	   *                     do use |copyTo|, resolving is taken care of for you
	   *                     when copying completes.
	   *           * copyTo: A helper function for getting your data out of the
	   *                     stream that meets the stream handling requirements
	   *                     above, and has the following signature:
	   *             @param  output nsIAsyncOutputStream
	   *                     The stream to copy to.
	   *             @return Promise
	   *                     The promise is resolved when copying completes or
	   *                     rejected if any (unexpected) errors occur.
	   *                     This object also emits "progress" events for each chunk
	   *                     that is copied.  See stream-utils.js.
	   */
	  startBulkRequest: function (request) {
	    if (!this.traits.bulk) {
	      throw Error("Server doesn't support bulk transfers");
	    }
	    if (!this.mainRoot) {
	      throw Error("Have not yet received a hello packet from the server.");
	    }
	    if (!request.type) {
	      throw Error("Bulk packet is missing the required 'type' field.");
	    }
	    if (!request.actor) {
	      throw Error("'" + request.type + "' bulk packet has no destination.");
	    }
	    if (!request.length) {
	      throw Error("'" + request.type + "' bulk packet has no length.");
	    }

	    request = new Request(request);
	    request.format = "bulk";

	    this._sendOrQueueRequest(request);

	    return request;
	  },

	  /**
	   * If a new request can be sent immediately, do so.  Otherwise, queue it.
	   */
	  _sendOrQueueRequest(request) {
	    let actor = request.actor;
	    if (!this._activeRequests.has(actor)) {
	      this._sendRequest(request);
	    } else {
	      this._queueRequest(request);
	    }
	  },

	  /**
	   * Send a request.
	   * @throws Error if there is already an active request in flight for the same
	   *         actor.
	   */
	  _sendRequest(request) {
	    let actor = request.actor;
	    this.expectReply(actor, request);

	    if (request.format === "json") {
	      this._transport.send(request.request);
	      return false;
	    }

	    this._transport.startBulkSend(request.request).then(function (...args) {
	      request.emit("bulk-send-ready", ...args);
	    });
	  },

	  /**
	   * Queue a request to be sent later.  Queues are only drained when an in
	   * flight request to a given actor completes.
	   */
	  _queueRequest(request) {
	    let actor = request.actor;
	    let queue = this._pendingRequests.get(actor) || [];
	    queue.push(request);
	    this._pendingRequests.set(actor, queue);
	  },

	  /**
	   * Attempt the next request to a given actor (if any).
	   */
	  _attemptNextRequest(actor) {
	    if (this._activeRequests.has(actor)) {
	      return;
	    }
	    let queue = this._pendingRequests.get(actor);
	    if (!queue) {
	      return;
	    }
	    let request = queue.shift();
	    if (queue.length === 0) {
	      this._pendingRequests.delete(actor);
	    }
	    this._sendRequest(request);
	  },

	  /**
	   * Arrange to hand the next reply from |aActor| to the handler bound to
	   * |aRequest|.
	   *
	   * DebuggerClient.prototype.request / startBulkRequest usually takes care of
	   * establishing the handler for a given request, but in rare cases (well,
	   * greetings from new root actors, is the only case at the moment) we must be
	   * prepared for a "reply" that doesn't correspond to any request we sent.
	   */
	  expectReply: function (aActor, aRequest) {
	    if (this._activeRequests.has(aActor)) {
	      throw Error("clashing handlers for next reply from " + uneval(aActor));
	    }

	    // If a handler is passed directly (as it is with the handler for the root
	    // actor greeting), create a dummy request to bind this to.
	    if (typeof aRequest === "function") {
	      let handler = aRequest;
	      aRequest = new Request();
	      aRequest.on("json-reply", handler);
	    }

	    this._activeRequests.set(aActor, aRequest);
	  },

	  // Transport hooks.

	  /**
	   * Called by DebuggerTransport to dispatch incoming packets as appropriate.
	   *
	   * @param aPacket object
	   *        The incoming packet.
	   */
	  onPacket: function (aPacket) {
	    if (!aPacket.from) {
	      DevToolsUtils.reportException("onPacket", new Error("Server did not specify an actor, dropping packet: " + JSON.stringify(aPacket)));
	      return;
	    }

	    // If we have a registered Front for this actor, let it handle the packet
	    // and skip all the rest of this unpleasantness.
	    let front = this.getActor(aPacket.from);
	    if (front) {
	      front.onPacket(aPacket);
	      return;
	    }

	    console.log('JWL PACKET');

	    if (this._clients.has(aPacket.from) && aPacket.type) {
	      let client = this._clients.get(aPacket.from);
	      let type = aPacket.type;
	      if (client.events.indexOf(type) != -1) {
	        client.emit(type, aPacket);
	        // we ignore the rest, as the client is expected to handle this packet.
	        return;
	      }
	    }

	    let activeRequest;
	    // See if we have a handler function waiting for a reply from this
	    // actor. (Don't count unsolicited notifications or pauses as
	    // replies.)
	    if (this._activeRequests.has(aPacket.from) && !(aPacket.type in UnsolicitedNotifications) && !(aPacket.type == ThreadStateTypes.paused && aPacket.why.type in UnsolicitedPauses)) {
	      activeRequest = this._activeRequests.get(aPacket.from);
	      this._activeRequests.delete(aPacket.from);
	    }

	    // If there is a subsequent request for the same actor, hand it off to the
	    // transport.  Delivery of packets on the other end is always async, even
	    // in the local transport case.
	    this._attemptNextRequest(aPacket.from);

	    // Packets that indicate thread state changes get special treatment.
	    if (aPacket.type in ThreadStateTypes && this._clients.has(aPacket.from) && typeof this._clients.get(aPacket.from)._onThreadState == "function") {
	      this._clients.get(aPacket.from)._onThreadState(aPacket);
	    }

	    // TODO: Bug 1151156 - Remove once Gecko 40 is on b2g-stable.
	    if (!this.traits.noNeedToFakeResumptionOnNavigation) {
	      // On navigation the server resumes, so the client must resume as well.
	      // We achieve that by generating a fake resumption packet that triggers
	      // the client's thread state change listeners.
	      if (aPacket.type == UnsolicitedNotifications.tabNavigated && this._clients.has(aPacket.from) && this._clients.get(aPacket.from).thread) {
	        let thread = this._clients.get(aPacket.from).thread;
	        let resumption = { from: thread._actor, type: "resumed" };
	        thread._onThreadState(resumption);
	      }
	    }

	    // Only try to notify listeners on events, not responses to requests
	    // that lack a packet type.
	    if (aPacket.type) {
	      this.emit(aPacket.type, aPacket);
	    }

	    if (activeRequest) {
	      let emitReply = function () {
	        return activeRequest.emit("json-reply", aPacket);
	      };
	      if (activeRequest.stack) {
	        Cu.callFunctionWithAsyncStack(emitReply, activeRequest.stack, "DevTools RDP");
	      } else {
	        emitReply();
	      }
	    }
	  },

	  /**
	   * Called by the DebuggerTransport to dispatch incoming bulk packets as
	   * appropriate.
	   *
	   * @param packet object
	   *        The incoming packet, which contains:
	   *        * actor:  Name of actor that will receive the packet
	   *        * type:   Name of actor's method that should be called on receipt
	   *        * length: Size of the data to be read
	   *        * stream: This input stream should only be used directly if you can
	   *                  ensure that you will read exactly |length| bytes and will
	   *                  not close the stream when reading is complete
	   *        * done:   If you use the stream directly (instead of |copyTo|
	   *                  below), you must signal completion by resolving /
	   *                  rejecting this deferred.  If it's rejected, the transport
	   *                  will be closed.  If an Error is supplied as a rejection
	   *                  value, it will be logged via |dumpn|.  If you do use
	   *                  |copyTo|, resolving is taken care of for you when copying
	   *                  completes.
	   *        * copyTo: A helper function for getting your data out of the stream
	   *                  that meets the stream handling requirements above, and has
	   *                  the following signature:
	   *          @param  output nsIAsyncOutputStream
	   *                  The stream to copy to.
	   *          @return Promise
	   *                  The promise is resolved when copying completes or rejected
	   *                  if any (unexpected) errors occur.
	   *                  This object also emits "progress" events for each chunk
	   *                  that is copied.  See stream-utils.js.
	   */
	  onBulkPacket: function (packet) {
	    let actor = packet.actor;
	    let type = packet.type;
	    let length = packet.length;

	    if (!actor) {
	      DevToolsUtils.reportException("onBulkPacket", new Error("Server did not specify an actor, dropping bulk packet: " + JSON.stringify(packet)));
	      return;
	    }

	    // See if we have a handler function waiting for a reply from this
	    // actor.
	    if (!this._activeRequests.has(actor)) {
	      return;
	    }

	    let activeRequest = this._activeRequests.get(actor);
	    this._activeRequests.delete(actor);

	    // If there is a subsequent request for the same actor, hand it off to the
	    // transport.  Delivery of packets on the other end is always async, even
	    // in the local transport case.
	    this._attemptNextRequest(actor);

	    activeRequest.emit("bulk-reply", packet);
	  },

	  /**
	   * Called by DebuggerTransport when the underlying stream is closed.
	   *
	   * @param aStatus nsresult
	   *        The status code that corresponds to the reason for closing
	   *        the stream.
	   */
	  onClosed: function (aStatus) {
	    this._closed = true;
	    this.emit("closed");

	    // Reject all pending and active requests
	    let reject = function (type, request, actor) {
	      // Server can send packets on its own and client only pass a callback
	      // to expectReply, so that there is no request object.
	      let msg;
	      if (request.request) {
	        msg = "'" + request.request.type + "' " + type + " request packet" + " to '" + actor + "' " + "can't be sent as the connection just closed.";
	      } else {
	        msg = "server side packet from '" + actor + "' can't be received " + "as the connection just closed.";
	      }
	      let packet = { error: "connectionClosed", message: msg };
	      request.emit("json-reply", packet);
	    };

	    this._pendingRequests.forEach(function (list, actor) {
	      list.forEach(function (request) {
	        return reject("pending", request, actor);
	      });
	    });
	    this._pendingRequests.clear();
	    this._activeRequests.forEach(reject.bind(null, "active"));
	    this._activeRequests.clear();

	    // The |_pools| array on the client-side currently is used only by
	    // protocol.js to store active fronts, mirroring the actor pools found in
	    // the server.  So, read all usages of "pool" as "protocol.js front".
	    //
	    // In the normal case where we shutdown cleanly, the toolbox tells each tool
	    // to close, and they each call |destroy| on any fronts they were using.
	    // When |destroy| or |cleanup| is called on a protocol.js front, it also
	    // removes itself from the |_pools| array.  Once the toolbox has shutdown,
	    // the connection is closed, and we reach here.  All fronts (should have
	    // been) |destroy|ed, so |_pools| should empty.
	    //
	    // If the connection instead aborts unexpectedly, we may end up here with
	    // all fronts used during the life of the connection.  So, we call |cleanup|
	    // on them clear their state, reject pending requests, and remove themselves
	    // from |_pools|.  This saves the toolbox from hanging indefinitely, in case
	    // it waits for some server response before shutdown that will now never
	    // arrive.
	    for (let pool of this._pools) {
	      pool.cleanup();
	    }
	  },

	  registerClient: function (client) {
	    let actorID = client.actor;
	    if (!actorID) {
	      throw new Error("DebuggerServer.registerClient expects " + "a client instance with an `actor` attribute.");
	    }
	    if (!Array.isArray(client.events)) {
	      throw new Error("DebuggerServer.registerClient expects " + "a client instance with an `events` attribute " + "that is an array.");
	    }
	    if (client.events.length > 0 && typeof client.emit != "function") {
	      throw new Error("DebuggerServer.registerClient expects " + "a client instance with non-empty `events` array to" + "have an `emit` function.");
	    }
	    if (this._clients.has(actorID)) {
	      throw new Error("DebuggerServer.registerClient already registered " + "a client for this actor.");
	    }
	    this._clients.set(actorID, client);
	  },

	  unregisterClient: function (client) {
	    let actorID = client.actor;
	    if (!actorID) {
	      throw new Error("DebuggerServer.unregisterClient expects " + "a Client instance with a `actor` attribute.");
	    }
	    this._clients.delete(actorID);
	  },

	  /**
	   * Actor lifetime management, echos the server's actor pools.
	   */
	  __pools: null,
	  get _pools() {
	    if (this.__pools) {
	      return this.__pools;
	    }
	    this.__pools = new Set();
	    return this.__pools;
	  },

	  addActorPool: function (pool) {
	    this._pools.add(pool);
	  },
	  removeActorPool: function (pool) {
	    this._pools.delete(pool);
	  },
	  getActor: function (actorID) {
	    let pool = this.poolFor(actorID);
	    return pool ? pool.get(actorID) : null;
	  },

	  poolFor: function (actorID) {
	    for (let pool of this._pools) {
	      if (pool.has(actorID)) return pool;
	    }
	    return null;
	  },

	  /**
	   * Currently attached addon.
	   */
	  activeAddon: null
	};

	eventSource(DebuggerClient.prototype);

	function Request(request) {
	  this.request = request;
	}

	Request.prototype = {

	  on: function (type, listener) {
	    events.on(this, type, listener);
	  },

	  off: function (type, listener) {
	    events.off(this, type, listener);
	  },

	  once: function (type, listener) {
	    events.once(this, type, listener);
	  },

	  emit: function (type, ...args) {
	    events.emit(this, type, ...args);
	  },

	  get actor() {
	    return this.request.to || this.request.actor;
	  }

	};

	/**
	 * Creates a tab client for the remote debugging protocol server. This client
	 * is a front to the tab actor created in the server side, hiding the protocol
	 * details in a traditional JavaScript API.
	 *
	 * @param aClient DebuggerClient
	 *        The debugger client parent.
	 * @param aForm object
	 *        The protocol form for this tab.
	 */
	function TabClient(aClient, aForm) {
	  this.client = aClient;
	  this._actor = aForm.from;
	  this._threadActor = aForm.threadActor;
	  this.javascriptEnabled = aForm.javascriptEnabled;
	  this.cacheDisabled = aForm.cacheDisabled;
	  this.thread = null;
	  this.request = this.client.request;
	  this.traits = aForm.traits || {};
	  this.events = ["workerListChanged"];
	}

	TabClient.prototype = {
	  get actor() {
	    return this._actor;
	  },
	  get _transport() {
	    return this.client._transport;
	  },

	  /**
	   * Attach to a thread actor.
	   *
	   * @param object aOptions
	   *        Configuration options.
	   *        - useSourceMaps: whether to use source maps or not.
	   * @param function aOnResponse
	   *        Called with the response packet and a ThreadClient
	   *        (which will be undefined on error).
	   */
	  attachThread: function (aOptions = {}, aOnResponse = noop) {
	    var _this12 = this;

	    if (this.thread) {
	      DevToolsUtils.executeSoon(function () {
	        return aOnResponse({}, _this12.thread);
	      });
	      return;
	    }

	    let packet = {
	      to: this._threadActor,
	      type: "attach",
	      options: aOptions
	    };
	    this.request(packet, function (aResponse) {
	      console.log('res', aResponse);
	      if (!aResponse.error) {
	        _this12.thread = new ThreadClient(_this12, _this12._threadActor);
	        _this12.client.registerClient(_this12.thread);
	      }
	      aOnResponse(aResponse, _this12.thread);
	    });
	  },

	  /**
	   * Detach the client from the tab actor.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  detach: DebuggerClient.requester({
	    type: "detach"
	  }, {
	    before: function (aPacket) {
	      if (this.thread) {
	        this.thread.detach();
	      }
	      return aPacket;
	    },
	    after: function (aResponse) {
	      this.client.unregisterClient(this);
	      return aResponse;
	    },
	    telemetry: "TABDETACH"
	  }),

	  /**
	   * Reload the page in this tab.
	   *
	   * @param [optional] object options
	   *        An object with a `force` property indicating whether or not
	   *        this reload should skip the cache
	   */
	  reload: function (options = { force: false }) {
	    return this._reload(options);
	  },
	  _reload: DebuggerClient.requester({
	    type: "reload",
	    options: args(0)
	  }, {
	    telemetry: "RELOAD"
	  }),

	  /**
	   * Navigate to another URL.
	   *
	   * @param string url
	   *        The URL to navigate to.
	   */
	  navigateTo: DebuggerClient.requester({
	    type: "navigateTo",
	    url: args(0)
	  }, {
	    telemetry: "NAVIGATETO"
	  }),

	  /**
	   * Reconfigure the tab actor.
	   *
	   * @param object aOptions
	   *        A dictionary object of the new options to use in the tab actor.
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  reconfigure: DebuggerClient.requester({
	    type: "reconfigure",
	    options: args(0)
	  }, {
	    telemetry: "RECONFIGURETAB"
	  }),

	  listWorkers: DebuggerClient.requester({
	    type: "listWorkers"
	  }, {
	    telemetry: "LISTWORKERS"
	  }),

	  attachWorker: function (aWorkerActor, aOnResponse) {
	    this.client.attachWorker(aWorkerActor, aOnResponse);
	  }
	};

	eventSource(TabClient.prototype);

	function WorkerClient(aClient, aForm) {
	  this.client = aClient;
	  this._actor = aForm.from;
	  this._isClosed = false;
	  this._url = aForm.url;

	  this._onClose = this._onClose.bind(this);

	  this.addListener("close", this._onClose);

	  this.traits = {};
	}

	WorkerClient.prototype = {
	  get _transport() {
	    return this.client._transport;
	  },

	  get request() {
	    return this.client.request;
	  },

	  get actor() {
	    return this._actor;
	  },

	  get url() {
	    return this._url;
	  },

	  get isClosed() {
	    return this._isClosed;
	  },

	  detach: DebuggerClient.requester({ type: "detach" }, {
	    after: function (aResponse) {
	      this.client.unregisterClient(this);
	      return aResponse;
	    },

	    telemetry: "WORKERDETACH"
	  }),

	  attachThread: function (aOptions = {}, aOnResponse = noop) {
	    var _this13 = this;

	    if (this.thread) {
	      DevToolsUtils.executeSoon(function () {
	        return aOnResponse({
	          type: "connected",
	          threadActor: _this13.thread._actor,
	          consoleActor: _this13.consoleActor
	        }, _this13.thread);
	      });
	      return;
	    }

	    // The connect call on server doesn't attach the thread as of version 44.
	    this.request({
	      to: this._actor,
	      type: "connect",
	      options: aOptions
	    }, function (connectReponse) {
	      if (connectReponse.error) {
	        aOnResponse(connectReponse, null);
	        return;
	      }

	      _this13.request({
	        to: connectReponse.threadActor,
	        type: "attach"
	      }, function (attachResponse) {
	        if (attachResponse.error) {
	          aOnResponse(attachResponse, null);
	        }

	        _this13.thread = new ThreadClient(_this13, connectReponse.threadActor);
	        _this13.consoleActor = connectReponse.consoleActor;
	        _this13.client.registerClient(_this13.thread);

	        aOnResponse(connectReponse, _this13.thread);
	      });
	    });
	  },

	  _onClose: function () {
	    this.removeListener("close", this._onClose);

	    this.client.unregisterClient(this);
	    this._isClosed = true;
	  },

	  reconfigure: function () {
	    return Promise.resolve();
	  },

	  events: ["close"]
	};

	eventSource(WorkerClient.prototype);

	function AddonClient(aClient, aActor) {
	  this._client = aClient;
	  this._actor = aActor;
	  this.request = this._client.request;
	  this.events = [];
	}

	AddonClient.prototype = {
	  get actor() {
	    return this._actor;
	  },
	  get _transport() {
	    return this._client._transport;
	  },

	  /**
	   * Detach the client from the addon actor.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  detach: DebuggerClient.requester({
	    type: "detach"
	  }, {
	    after: function (aResponse) {
	      if (this._client.activeAddon === this) {
	        this._client.activeAddon = null;
	      }
	      this._client.unregisterClient(this);
	      return aResponse;
	    },
	    telemetry: "ADDONDETACH"
	  })
	};

	/**
	 * A RootClient object represents a root actor on the server. Each
	 * DebuggerClient keeps a RootClient instance representing the root actor
	 * for the initial connection; DebuggerClient's 'listTabs' and
	 * 'listChildProcesses' methods forward to that root actor.
	 *
	 * @param aClient object
	 *      The client connection to which this actor belongs.
	 * @param aGreeting string
	 *      The greeting packet from the root actor we're to represent.
	 *
	 * Properties of a RootClient instance:
	 *
	 * @property actor string
	 *      The name of this child's root actor.
	 * @property applicationType string
	 *      The application type, as given in the root actor's greeting packet.
	 * @property traits object
	 *      The traits object, as given in the root actor's greeting packet.
	 */
	function RootClient(aClient, aGreeting) {
	  this._client = aClient;
	  this.actor = aGreeting.from;
	  this.applicationType = aGreeting.applicationType;
	  this.traits = aGreeting.traits;
	}
	exports.RootClient = RootClient;

	RootClient.prototype = {
	  constructor: RootClient,

	  /**
	   * List the open tabs.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  listTabs: DebuggerClient.requester({ type: "listTabs" }, { telemetry: "LISTTABS" }),

	  /**
	   * List the installed addons.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  listAddons: DebuggerClient.requester({ type: "listAddons" }, { telemetry: "LISTADDONS" }),

	  /**
	   * List the registered workers.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  listWorkers: DebuggerClient.requester({ type: "listWorkers" }, { telemetry: "LISTWORKERS" }),

	  /**
	   * List the running processes.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  listProcesses: DebuggerClient.requester({ type: "listProcesses" }, { telemetry: "LISTPROCESSES" }),

	  /**
	   * Fetch the TabActor for the currently selected tab, or for a specific
	   * tab given as first parameter.
	   *
	   * @param [optional] object aFilter
	   *        A dictionary object with following optional attributes:
	   *         - outerWindowID: used to match tabs in parent process
	   *         - tabId: used to match tabs in child processes
	   *         - tab: a reference to xul:tab element
	   *        If nothing is specified, returns the actor for the currently
	   *        selected tab.
	   */
	  getTab: function (aFilter) {
	    let packet = {
	      to: this.actor,
	      type: "getTab"
	    };

	    if (aFilter) {
	      if (typeof aFilter.outerWindowID == "number") {
	        packet.outerWindowID = aFilter.outerWindowID;
	      } else if (typeof aFilter.tabId == "number") {
	        packet.tabId = aFilter.tabId;
	      } else if ("tab" in aFilter) {
	        let browser = aFilter.tab.linkedBrowser;
	        if (browser.frameLoader.tabParent) {
	          // Tabs in child process
	          packet.tabId = browser.frameLoader.tabParent.tabId;
	        } else {
	          // Tabs in parent process
	          let windowUtils = browser.contentWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);
	          packet.outerWindowID = windowUtils.outerWindowID;
	        }
	      } else {
	        // Throw if a filter object have been passed but without
	        // any clearly idenfified filter.
	        throw new Error("Unsupported argument given to getTab request");
	      }
	    }

	    return this.request(packet);
	  },

	  /**
	   * Description of protocol's actors and methods.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  protocolDescription: DebuggerClient.requester({ type: "protocolDescription" }, { telemetry: "PROTOCOLDESCRIPTION" }),

	  /*
	   * Methods constructed by DebuggerClient.requester require these forwards
	   * on their 'this'.
	   */
	  get _transport() {
	    return this._client._transport;
	  },
	  get request() {
	    return this._client.request;
	  }
	};

	/**
	 * Creates a thread client for the remote debugging protocol server. This client
	 * is a front to the thread actor created in the server side, hiding the
	 * protocol details in a traditional JavaScript API.
	 *
	 * @param aClient DebuggerClient|TabClient
	 *        The parent of the thread (tab for tab-scoped debuggers, DebuggerClient
	 *        for chrome debuggers).
	 * @param aActor string
	 *        The actor ID for this thread.
	 */
	function ThreadClient(aClient, aActor) {
	  this._parent = aClient;
	  this.client = aClient instanceof DebuggerClient ? aClient : aClient.client;
	  this._actor = aActor;
	  this._frameCache = [];
	  this._scriptCache = {};
	  this._pauseGrips = {};
	  this._threadGrips = {};
	  this.request = this.client.request;
	}

	ThreadClient.prototype = {
	  _state: "paused",
	  get state() {
	    return this._state;
	  },
	  get paused() {
	    return this._state === "paused";
	  },

	  _pauseOnExceptions: false,
	  _ignoreCaughtExceptions: false,
	  _pauseOnDOMEvents: null,

	  _actor: null,
	  get actor() {
	    return this._actor;
	  },

	  get _transport() {
	    return this.client._transport;
	  },

	  _assertPaused: function (aCommand) {
	    if (!this.paused) {
	      throw Error(aCommand + " command sent while not paused. Currently " + this._state);
	    }
	  },

	  /**
	   * Resume a paused thread. If the optional aLimit parameter is present, then
	   * the thread will also pause when that limit is reached.
	   *
	   * @param [optional] object aLimit
	   *        An object with a type property set to the appropriate limit (next,
	   *        step, or finish) per the remote debugging protocol specification.
	   *        Use null to specify no limit.
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  _doResume: DebuggerClient.requester({
	    type: "resume",
	    resumeLimit: args(0)
	  }, {
	    before: function (aPacket) {
	      this._assertPaused("resume");

	      // Put the client in a tentative "resuming" state so we can prevent
	      // further requests that should only be sent in the paused state.
	      this._state = "resuming";

	      if (this._pauseOnExceptions) {
	        aPacket.pauseOnExceptions = this._pauseOnExceptions;
	      }
	      if (this._ignoreCaughtExceptions) {
	        aPacket.ignoreCaughtExceptions = this._ignoreCaughtExceptions;
	      }
	      if (this._pauseOnDOMEvents) {
	        aPacket.pauseOnDOMEvents = this._pauseOnDOMEvents;
	      }
	      return aPacket;
	    },
	    after: function (aResponse) {
	      if (aResponse.error) {
	        // There was an error resuming, back to paused state.
	        this._state = "paused";
	      }
	      return aResponse;
	    },
	    telemetry: "RESUME"
	  }),

	  /**
	   * Reconfigure the thread actor.
	   *
	   * @param object aOptions
	   *        A dictionary object of the new options to use in the thread actor.
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  reconfigure: DebuggerClient.requester({
	    type: "reconfigure",
	    options: args(0)
	  }, {
	    telemetry: "RECONFIGURETHREAD"
	  }),

	  /**
	   * Resume a paused thread.
	   */
	  resume: function (aOnResponse) {
	    this._doResume(null, aOnResponse);
	  },

	  /**
	   * Resume then pause without stepping.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  resumeThenPause: function (aOnResponse) {
	    this._doResume({ type: "break" }, aOnResponse);
	  },

	  /**
	   * Step over a function call.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  stepOver: function (aOnResponse) {
	    this._doResume({ type: "next" }, aOnResponse);
	  },

	  /**
	   * Step into a function call.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  stepIn: function (aOnResponse) {
	    this._doResume({ type: "step" }, aOnResponse);
	  },

	  /**
	   * Step out of a function call.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  stepOut: function (aOnResponse) {
	    this._doResume({ type: "finish" }, aOnResponse);
	  },

	  /**
	   * Immediately interrupt a running thread.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  interrupt: function (aOnResponse) {
	    this._doInterrupt(null, aOnResponse);
	  },

	  /**
	   * Pause execution right before the next JavaScript bytecode is executed.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  breakOnNext: function (aOnResponse) {
	    this._doInterrupt("onNext", aOnResponse);
	  },

	  /**
	   * Interrupt a running thread.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  _doInterrupt: DebuggerClient.requester({
	    type: "interrupt",
	    when: args(0)
	  }, {
	    telemetry: "INTERRUPT"
	  }),

	  /**
	   * Enable or disable pausing when an exception is thrown.
	   *
	   * @param boolean aFlag
	   *        Enables pausing if true, disables otherwise.
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  pauseOnExceptions: function (aPauseOnExceptions, aIgnoreCaughtExceptions, aOnResponse = noop) {
	    var _this14 = this;

	    this._pauseOnExceptions = aPauseOnExceptions;
	    this._ignoreCaughtExceptions = aIgnoreCaughtExceptions;

	    // If the debuggee is paused, we have to send the flag via a reconfigure
	    // request.
	    if (this.paused) {
	      this.reconfigure({
	        pauseOnExceptions: aPauseOnExceptions,
	        ignoreCaughtExceptions: aIgnoreCaughtExceptions
	      }, aOnResponse);
	      return;
	    }
	    // Otherwise send the flag using a standard resume request.
	    this.interrupt(function (aResponse) {
	      if (aResponse.error) {
	        // Can't continue if pausing failed.
	        aOnResponse(aResponse);
	        return;
	      }
	      _this14.resume(aOnResponse);
	    });
	  },

	  /**
	   * Enable pausing when the specified DOM events are triggered. Disabling
	   * pausing on an event can be realized by calling this method with the updated
	   * array of events that doesn't contain it.
	   *
	   * @param array|string events
	   *        An array of strings, representing the DOM event types to pause on,
	   *        or "*" to pause on all DOM events. Pass an empty array to
	   *        completely disable pausing on DOM events.
	   * @param function onResponse
	   *        Called with the response packet in a future turn of the event loop.
	   */
	  pauseOnDOMEvents: function (events, onResponse = noop) {
	    var _this15 = this;

	    this._pauseOnDOMEvents = events;
	    // If the debuggee is paused, the value of the array will be communicated in
	    // the next resumption. Otherwise we have to force a pause in order to send
	    // the array.
	    if (this.paused) {
	      DevToolsUtils.executeSoon(function () {
	        return onResponse({});
	      });
	      return;
	    }
	    this.interrupt(function (response) {
	      // Can't continue if pausing failed.
	      if (response.error) {
	        onResponse(response);
	        return;
	      }
	      _this15.resume(onResponse);
	    });
	  },

	  /**
	   * Send a clientEvaluate packet to the debuggee. Response
	   * will be a resume packet.
	   *
	   * @param string aFrame
	   *        The actor ID of the frame where the evaluation should take place.
	   * @param string aExpression
	   *        The expression that will be evaluated in the scope of the frame
	   *        above.
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  eval: DebuggerClient.requester({
	    type: "clientEvaluate",
	    frame: args(0),
	    expression: args(1)
	  }, {
	    before: function (aPacket) {
	      this._assertPaused("eval");
	      // Put the client in a tentative "resuming" state so we can prevent
	      // further requests that should only be sent in the paused state.
	      this._state = "resuming";
	      return aPacket;
	    },
	    after: function (aResponse) {
	      if (aResponse.error) {
	        // There was an error resuming, back to paused state.
	        this._state = "paused";
	      }
	      return aResponse;
	    },
	    telemetry: "CLIENTEVALUATE"
	  }),

	  /**
	   * Detach from the thread actor.
	   *
	   * @param function aOnResponse
	   *        Called with the response packet.
	   */
	  detach: DebuggerClient.requester({
	    type: "detach"
	  }, {
	    after: function (aResponse) {
	      this.client.unregisterClient(this);
	      this._parent.thread = null;
	      return aResponse;
	    },
	    telemetry: "THREADDETACH"
	  }),

	  /**
	   * Release multiple thread-lifetime object actors. If any pause-lifetime
	   * actors are included in the request, a |notReleasable| error will return,
	   * but all the thread-lifetime ones will have been released.
	   *
	   * @param array actors
	   *        An array with actor IDs to release.
	   */
	  releaseMany: DebuggerClient.requester({
	    type: "releaseMany",
	    actors: args(0)
	  }, {
	    telemetry: "RELEASEMANY"
	  }),

	  /**
	   * Promote multiple pause-lifetime object actors to thread-lifetime ones.
	   *
	   * @param array actors
	   *        An array with actor IDs to promote.
	   */
	  threadGrips: DebuggerClient.requester({
	    type: "threadGrips",
	    actors: args(0)
	  }, {
	    telemetry: "THREADGRIPS"
	  }),

	  /**
	   * Return the event listeners defined on the page.
	   *
	   * @param aOnResponse Function
	   *        Called with the thread's response.
	   */
	  eventListeners: DebuggerClient.requester({
	    type: "eventListeners"
	  }, {
	    telemetry: "EVENTLISTENERS"
	  }),

	  /**
	   * Request the loaded sources for the current thread.
	   *
	   * @param aOnResponse Function
	   *        Called with the thread's response.
	   */
	  getSources: DebuggerClient.requester({
	    type: "sources"
	  }, {
	    telemetry: "SOURCES"
	  }),

	  /**
	   * Clear the thread's source script cache. A scriptscleared event
	   * will be sent.
	   */
	  _clearScripts: function () {
	    if (Object.keys(this._scriptCache).length > 0) {
	      this._scriptCache = {};
	      this.emit("scriptscleared");
	    }
	  },

	  /**
	   * Request frames from the callstack for the current thread.
	   *
	   * @param aStart integer
	   *        The number of the youngest stack frame to return (the youngest
	   *        frame is 0).
	   * @param aCount integer
	   *        The maximum number of frames to return, or null to return all
	   *        frames.
	   * @param aOnResponse function
	   *        Called with the thread's response.
	   */
	  getFrames: DebuggerClient.requester({
	    type: "frames",
	    start: args(0),
	    count: args(1)
	  }, {
	    telemetry: "FRAMES"
	  }),

	  /**
	   * An array of cached frames. Clients can observe the framesadded and
	   * framescleared event to keep up to date on changes to this cache,
	   * and can fill it using the fillFrames method.
	   */
	  get cachedFrames() {
	    return this._frameCache;
	  },

	  /**
	   * true if there are more stack frames available on the server.
	   */
	  get moreFrames() {
	    return this.paused && (!this._frameCache || this._frameCache.length == 0 || !this._frameCache[this._frameCache.length - 1].oldest);
	  },

	  /**
	   * Ensure that at least aTotal stack frames have been loaded in the
	   * ThreadClient's stack frame cache. A framesadded event will be
	   * sent when the stack frame cache is updated.
	   *
	   * @param aTotal number
	   *        The minimum number of stack frames to be included.
	   * @param aCallback function
	   *        Optional callback function called when frames have been loaded
	   * @returns true if a framesadded notification should be expected.
	   */
	  fillFrames: function (aTotal, aCallback = noop) {
	    var _this16 = this;

	    this._assertPaused("fillFrames");
	    if (this._frameCache.length >= aTotal) {
	      return false;
	    }

	    let numFrames = this._frameCache.length;

	    this.getFrames(numFrames, aTotal - numFrames, function (aResponse) {
	      if (aResponse.error) {
	        aCallback(aResponse);
	        return;
	      }

	      let threadGrips = DevToolsUtils.values(_this16._threadGrips);

	      for (let i in aResponse.frames) {
	        let frame = aResponse.frames[i];
	        if (!frame.where.source) {
	          // Older servers use urls instead, so we need to resolve
	          // them to source actors
	          for (let grip of threadGrips) {
	            if (grip instanceof SourceClient && grip.url === frame.url) {
	              frame.where.source = grip._form;
	            }
	          }
	        }

	        _this16._frameCache[frame.depth] = frame;
	      }

	      // If we got as many frames as we asked for, there might be more
	      // frames available.
	      _this16.emit("framesadded");

	      aCallback(aResponse);
	    });

	    return true;
	  },

	  /**
	   * Clear the thread's stack frame cache. A framescleared event
	   * will be sent.
	   */
	  _clearFrames: function () {
	    if (this._frameCache.length > 0) {
	      this._frameCache = [];
	      this.emit("framescleared");
	    }
	  },

	  /**
	   * Return a ObjectClient object for the given object grip.
	   *
	   * @param aGrip object
	   *        A pause-lifetime object grip returned by the protocol.
	   */
	  pauseGrip: function (aGrip) {
	    if (aGrip.actor in this._pauseGrips) {
	      return this._pauseGrips[aGrip.actor];
	    }

	    let client = new ObjectClient(this.client, aGrip);
	    this._pauseGrips[aGrip.actor] = client;
	    return client;
	  },

	  /**
	   * Get or create a long string client, checking the grip client cache if it
	   * already exists.
	   *
	   * @param aGrip Object
	   *        The long string grip returned by the protocol.
	   * @param aGripCacheName String
	   *        The property name of the grip client cache to check for existing
	   *        clients in.
	   */
	  _longString: function (aGrip, aGripCacheName) {
	    if (aGrip.actor in this[aGripCacheName]) {
	      return this[aGripCacheName][aGrip.actor];
	    }

	    let client = new LongStringClient(this.client, aGrip);
	    this[aGripCacheName][aGrip.actor] = client;
	    return client;
	  },

	  /**
	   * Return an instance of LongStringClient for the given long string grip that
	   * is scoped to the current pause.
	   *
	   * @param aGrip Object
	   *        The long string grip returned by the protocol.
	   */
	  pauseLongString: function (aGrip) {
	    return this._longString(aGrip, "_pauseGrips");
	  },

	  /**
	   * Return an instance of LongStringClient for the given long string grip that
	   * is scoped to the thread lifetime.
	   *
	   * @param aGrip Object
	   *        The long string grip returned by the protocol.
	   */
	  threadLongString: function (aGrip) {
	    return this._longString(aGrip, "_threadGrips");
	  },

	  /**
	   * Clear and invalidate all the grip clients from the given cache.
	   *
	   * @param aGripCacheName
	   *        The property name of the grip cache we want to clear.
	   */
	  _clearObjectClients: function (aGripCacheName) {
	    for (let id in this[aGripCacheName]) {
	      this[aGripCacheName][id].valid = false;
	    }
	    this[aGripCacheName] = {};
	  },

	  /**
	   * Invalidate pause-lifetime grip clients and clear the list of current grip
	   * clients.
	   */
	  _clearPauseGrips: function () {
	    this._clearObjectClients("_pauseGrips");
	  },

	  /**
	   * Invalidate thread-lifetime grip clients and clear the list of current grip
	   * clients.
	   */
	  _clearThreadGrips: function () {
	    this._clearObjectClients("_threadGrips");
	  },

	  /**
	   * Handle thread state change by doing necessary cleanup and notifying all
	   * registered listeners.
	   */
	  _onThreadState: function (aPacket) {
	    this._state = ThreadStateTypes[aPacket.type];
	    this._clearFrames();
	    this._clearPauseGrips();
	    aPacket.type === ThreadStateTypes.detached && this._clearThreadGrips();
	    this.client._eventsEnabled && this.emit(aPacket.type, aPacket);
	  },

	  /**
	   * Return an EnvironmentClient instance for the given environment actor form.
	   */
	  environment: function (aForm) {
	    return new EnvironmentClient(this.client, aForm);
	  },

	  /**
	   * Return an instance of SourceClient for the given source actor form.
	   */
	  source: function (aForm) {
	    if (aForm.actor in this._threadGrips) {
	      return this._threadGrips[aForm.actor];
	    }

	    return this._threadGrips[aForm.actor] = new SourceClient(this, aForm);
	  },

	  /**
	   * Request the prototype and own properties of mutlipleObjects.
	   *
	   * @param aOnResponse function
	   *        Called with the request's response.
	   * @param actors [string]
	   *        List of actor ID of the queried objects.
	   */
	  getPrototypesAndProperties: DebuggerClient.requester({
	    type: "prototypesAndProperties",
	    actors: args(0)
	  }, {
	    telemetry: "PROTOTYPESANDPROPERTIES"
	  }),

	  events: ["newSource"]
	};

	eventSource(ThreadClient.prototype);

	/**
	 * Creates a tracing profiler client for the remote debugging protocol
	 * server. This client is a front to the trace actor created on the
	 * server side, hiding the protocol details in a traditional
	 * JavaScript API.
	 *
	 * @param aClient DebuggerClient
	 *        The debugger client parent.
	 * @param aActor string
	 *        The actor ID for this thread.
	 */
	function TraceClient(aClient, aActor) {
	  this._client = aClient;
	  this._actor = aActor;
	  this._activeTraces = new Set();
	  this._waitingPackets = new Map();
	  this._expectedPacket = 0;
	  this.request = this._client.request;
	  this.events = [];
	}

	TraceClient.prototype = {
	  get actor() {
	    return this._actor;
	  },
	  get tracing() {
	    return this._activeTraces.size > 0;
	  },

	  get _transport() {
	    return this._client._transport;
	  },

	  /**
	   * Detach from the trace actor.
	   */
	  detach: DebuggerClient.requester({
	    type: "detach"
	  }, {
	    after: function (aResponse) {
	      this._client.unregisterClient(this);
	      return aResponse;
	    },
	    telemetry: "TRACERDETACH"
	  }),

	  /**
	   * Start a new trace.
	   *
	   * @param aTrace [string]
	   *        An array of trace types to be recorded by the new trace.
	   *
	   * @param aName string
	   *        The name of the new trace.
	   *
	   * @param aOnResponse function
	   *        Called with the request's response.
	   */
	  startTrace: DebuggerClient.requester({
	    type: "startTrace",
	    name: args(1),
	    trace: args(0)
	  }, {
	    after: function (aResponse) {
	      if (aResponse.error) {
	        return aResponse;
	      }

	      if (!this.tracing) {
	        this._waitingPackets.clear();
	        this._expectedPacket = 0;
	      }
	      this._activeTraces.add(aResponse.name);

	      return aResponse;
	    },
	    telemetry: "STARTTRACE"
	  }),

	  /**
	   * End a trace. If a name is provided, stop the named
	   * trace. Otherwise, stop the most recently started trace.
	   *
	   * @param aName string
	   *        The name of the trace to stop.
	   *
	   * @param aOnResponse function
	   *        Called with the request's response.
	   */
	  stopTrace: DebuggerClient.requester({
	    type: "stopTrace",
	    name: args(0)
	  }, {
	    after: function (aResponse) {
	      if (aResponse.error) {
	        return aResponse;
	      }

	      this._activeTraces.delete(aResponse.name);

	      return aResponse;
	    },
	    telemetry: "STOPTRACE"
	  })
	};

	/**
	 * Grip clients are used to retrieve information about the relevant object.
	 *
	 * @param aClient DebuggerClient
	 *        The debugger client parent.
	 * @param aGrip object
	 *        A pause-lifetime object grip returned by the protocol.
	 */
	function ObjectClient(aClient, aGrip) {
	  this._grip = aGrip;
	  this._client = aClient;
	  this.request = this._client.request;
	}
	exports.ObjectClient = ObjectClient;

	ObjectClient.prototype = {
	  get actor() {
	    return this._grip.actor;
	  },
	  get _transport() {
	    return this._client._transport;
	  },

	  valid: true,

	  get isFrozen() {
	    return this._grip.frozen;
	  },
	  get isSealed() {
	    return this._grip.sealed;
	  },
	  get isExtensible() {
	    return this._grip.extensible;
	  },

	  getDefinitionSite: DebuggerClient.requester({
	    type: "definitionSite"
	  }, {
	    before: function (aPacket) {
	      if (this._grip.class != "Function") {
	        throw new Error("getDefinitionSite is only valid for function grips.");
	      }
	      return aPacket;
	    }
	  }),

	  /**
	   * Request the names of a function's formal parameters.
	   *
	   * @param aOnResponse function
	   *        Called with an object of the form:
	   *        { parameterNames:[<parameterName>, ...] }
	   *        where each <parameterName> is the name of a parameter.
	   */
	  getParameterNames: DebuggerClient.requester({
	    type: "parameterNames"
	  }, {
	    before: function (aPacket) {
	      if (this._grip["class"] !== "Function") {
	        throw new Error("getParameterNames is only valid for function grips.");
	      }
	      return aPacket;
	    },
	    telemetry: "PARAMETERNAMES"
	  }),

	  /**
	   * Request the names of the properties defined on the object and not its
	   * prototype.
	   *
	   * @param aOnResponse function Called with the request's response.
	   */
	  getOwnPropertyNames: DebuggerClient.requester({
	    type: "ownPropertyNames"
	  }, {
	    telemetry: "OWNPROPERTYNAMES"
	  }),

	  /**
	   * Request the prototype and own properties of the object.
	   *
	   * @param aOnResponse function Called with the request's response.
	   */
	  getPrototypeAndProperties: DebuggerClient.requester({
	    type: "prototypeAndProperties"
	  }, {
	    telemetry: "PROTOTYPEANDPROPERTIES"
	  }),

	  /**
	   * Request a PropertyIteratorClient instance to ease listing
	   * properties for this object.
	   *
	   * @param options Object
	   *        A dictionary object with various boolean attributes:
	   *        - ignoreSafeGetters Boolean
	   *          If true, do not iterate over safe getters.
	   *        - ignoreIndexedProperties Boolean
	   *          If true, filters out Array items.
	   *          e.g. properties names between `0` and `object.length`.
	   *        - ignoreNonIndexedProperties Boolean
	   *          If true, filters out items that aren't array items
	   *          e.g. properties names that are not a number between `0`
	   *          and `object.length`.
	   *        - sort Boolean
	   *          If true, the iterator will sort the properties by name
	   *          before dispatching them.
	   * @param aOnResponse function Called with the client instance.
	   */
	  enumProperties: DebuggerClient.requester({
	    type: "enumProperties",
	    options: args(0)
	  }, {
	    after: function (aResponse) {
	      if (aResponse.iterator) {
	        return { iterator: new PropertyIteratorClient(this._client, aResponse.iterator) };
	      }
	      return aResponse;
	    },
	    telemetry: "ENUMPROPERTIES"
	  }),

	  /**
	   * Request the property descriptor of the object's specified property.
	   *
	   * @param aName string The name of the requested property.
	   * @param aOnResponse function Called with the request's response.
	   */
	  getProperty: DebuggerClient.requester({
	    type: "property",
	    name: args(0)
	  }, {
	    telemetry: "PROPERTY"
	  }),

	  /**
	   * Request the prototype of the object.
	   *
	   * @param aOnResponse function Called with the request's response.
	   */
	  getPrototype: DebuggerClient.requester({
	    type: "prototype"
	  }, {
	    telemetry: "PROTOTYPE"
	  }),

	  /**
	   * Request the display string of the object.
	   *
	   * @param aOnResponse function Called with the request's response.
	   */
	  getDisplayString: DebuggerClient.requester({
	    type: "displayString"
	  }, {
	    telemetry: "DISPLAYSTRING"
	  }),

	  /**
	   * Request the scope of the object.
	   *
	   * @param aOnResponse function Called with the request's response.
	   */
	  getScope: DebuggerClient.requester({
	    type: "scope"
	  }, {
	    before: function (aPacket) {
	      if (this._grip.class !== "Function") {
	        throw new Error("scope is only valid for function grips.");
	      }
	      return aPacket;
	    },
	    telemetry: "SCOPE"
	  }),

	  /**
	   * Request the promises directly depending on the current promise.
	   */
	  getDependentPromises: DebuggerClient.requester({
	    type: "dependentPromises"
	  }, {
	    before: function (aPacket) {
	      if (this._grip.class !== "Promise") {
	        throw new Error("getDependentPromises is only valid for promise " + "grips.");
	      }
	      return aPacket;
	    }
	  }),

	  /**
	   * Request the stack to the promise's allocation point.
	   */
	  getPromiseAllocationStack: DebuggerClient.requester({
	    type: "allocationStack"
	  }, {
	    before: function (aPacket) {
	      if (this._grip.class !== "Promise") {
	        throw new Error("getAllocationStack is only valid for promise grips.");
	      }
	      return aPacket;
	    }
	  }),

	  /**
	   * Request the stack to the promise's fulfillment point.
	   */
	  getPromiseFulfillmentStack: DebuggerClient.requester({
	    type: "fulfillmentStack"
	  }, {
	    before: function (packet) {
	      if (this._grip.class !== "Promise") {
	        throw new Error("getPromiseFulfillmentStack is only valid for " + "promise grips.");
	      }
	      return packet;
	    }
	  }),

	  /**
	   * Request the stack to the promise's rejection point.
	   */
	  getPromiseRejectionStack: DebuggerClient.requester({
	    type: "rejectionStack"
	  }, {
	    before: function (packet) {
	      if (this._grip.class !== "Promise") {
	        throw new Error("getPromiseRejectionStack is only valid for " + "promise grips.");
	      }
	      return packet;
	    }
	  })
	};

	/**
	 * A PropertyIteratorClient provides a way to access to property names and
	 * values of an object efficiently, slice by slice.
	 * Note that the properties can be sorted in the backend,
	 * this is controled while creating the PropertyIteratorClient
	 * from ObjectClient.enumProperties.
	 *
	 * @param aClient DebuggerClient
	 *        The debugger client parent.
	 * @param aGrip Object
	 *        A PropertyIteratorActor grip returned by the protocol via
	 *        TabActor.enumProperties request.
	 */
	function PropertyIteratorClient(aClient, aGrip) {
	  this._grip = aGrip;
	  this._client = aClient;
	  this.request = this._client.request;
	}

	PropertyIteratorClient.prototype = {
	  get actor() {
	    return this._grip.actor;
	  },

	  /**
	   * Get the total number of properties available in the iterator.
	   */
	  get count() {
	    return this._grip.count;
	  },

	  /**
	   * Get one or more property names that correspond to the positions in the
	   * indexes parameter.
	   *
	   * @param indexes Array
	   *        An array of property indexes.
	   * @param aCallback Function
	   *        The function called when we receive the property names.
	   */
	  names: DebuggerClient.requester({
	    type: "names",
	    indexes: args(0)
	  }, {}),

	  /**
	   * Get a set of following property value(s).
	   *
	   * @param start Number
	   *        The index of the first property to fetch.
	   * @param count Number
	   *        The number of properties to fetch.
	   * @param aCallback Function
	   *        The function called when we receive the property values.
	   */
	  slice: DebuggerClient.requester({
	    type: "slice",
	    start: args(0),
	    count: args(1)
	  }, {}),

	  /**
	   * Get all the property values.
	   *
	   * @param aCallback Function
	   *        The function called when we receive the property values.
	   */
	  all: DebuggerClient.requester({
	    type: "all"
	  }, {})
	};

	/**
	 * A LongStringClient provides a way to access "very long" strings from the
	 * debugger server.
	 *
	 * @param aClient DebuggerClient
	 *        The debugger client parent.
	 * @param aGrip Object
	 *        A pause-lifetime long string grip returned by the protocol.
	 */
	function LongStringClient(aClient, aGrip) {
	  this._grip = aGrip;
	  this._client = aClient;
	  this.request = this._client.request;
	}
	exports.LongStringClient = LongStringClient;

	LongStringClient.prototype = {
	  get actor() {
	    return this._grip.actor;
	  },
	  get length() {
	    return this._grip.length;
	  },
	  get initial() {
	    return this._grip.initial;
	  },
	  get _transport() {
	    return this._client._transport;
	  },

	  valid: true,

	  /**
	   * Get the substring of this LongString from aStart to aEnd.
	   *
	   * @param aStart Number
	   *        The starting index.
	   * @param aEnd Number
	   *        The ending index.
	   * @param aCallback Function
	   *        The function called when we receive the substring.
	   */
	  substring: DebuggerClient.requester({
	    type: "substring",
	    start: args(0),
	    end: args(1)
	  }, {
	    telemetry: "SUBSTRING"
	  })
	};

	/**
	 * A SourceClient provides a way to access the source text of a script.
	 *
	 * @param aClient ThreadClient
	 *        The thread client parent.
	 * @param aForm Object
	 *        The form sent across the remote debugging protocol.
	 */
	function SourceClient(aClient, aForm) {
	  this._form = aForm;
	  this._isBlackBoxed = aForm.isBlackBoxed;
	  this._isPrettyPrinted = aForm.isPrettyPrinted;
	  this._activeThread = aClient;
	  this._client = aClient.client;
	}

	SourceClient.prototype = {
	  get _transport() {
	    return this._client._transport;
	  },
	  get isBlackBoxed() {
	    return this._isBlackBoxed;
	  },
	  get isPrettyPrinted() {
	    return this._isPrettyPrinted;
	  },
	  get actor() {
	    return this._form.actor;
	  },
	  get request() {
	    return this._client.request;
	  },
	  get url() {
	    return this._form.url;
	  },

	  /**
	   * Black box this SourceClient's source.
	   *
	   * @param aCallback Function
	   *        The callback function called when we receive the response from the server.
	   */
	  blackBox: DebuggerClient.requester({
	    type: "blackbox"
	  }, {
	    telemetry: "BLACKBOX",
	    after: function (aResponse) {
	      if (!aResponse.error) {
	        this._isBlackBoxed = true;
	        if (this._activeThread) {
	          this._activeThread.emit("blackboxchange", this);
	        }
	      }
	      return aResponse;
	    }
	  }),

	  /**
	   * Un-black box this SourceClient's source.
	   *
	   * @param aCallback Function
	   *        The callback function called when we receive the response from the server.
	   */
	  unblackBox: DebuggerClient.requester({
	    type: "unblackbox"
	  }, {
	    telemetry: "UNBLACKBOX",
	    after: function (aResponse) {
	      if (!aResponse.error) {
	        this._isBlackBoxed = false;
	        if (this._activeThread) {
	          this._activeThread.emit("blackboxchange", this);
	        }
	      }
	      return aResponse;
	    }
	  }),

	  /**
	   * Get Executable Lines from a source
	   *
	   * @param aCallback Function
	   *        The callback function called when we receive the response from the server.
	   */
	  getExecutableLines: function (cb) {
	    let packet = {
	      to: this._form.actor,
	      type: "getExecutableLines"
	    };

	    this._client.request(packet, function (res) {
	      cb(res.lines);
	    });
	  },

	  /**
	   * Get a long string grip for this SourceClient's source.
	   */
	  source: function (aCallback) {
	    var _this17 = this;

	    let packet = {
	      to: this._form.actor,
	      type: "source"
	    };
	    this._client.request(packet, function (aResponse) {
	      _this17._onSourceResponse(aResponse, aCallback);
	    });
	  },

	  /**
	   * Pretty print this source's text.
	   */
	  prettyPrint: function (aIndent, aCallback) {
	    var _this18 = this;

	    const packet = {
	      to: this._form.actor,
	      type: "prettyPrint",
	      indent: aIndent
	    };
	    this._client.request(packet, function (aResponse) {
	      if (!aResponse.error) {
	        _this18._isPrettyPrinted = true;
	        _this18._activeThread._clearFrames();
	        _this18._activeThread.emit("prettyprintchange", _this18);
	      }
	      _this18._onSourceResponse(aResponse, aCallback);
	    });
	  },

	  /**
	   * Stop pretty printing this source's text.
	   */
	  disablePrettyPrint: function (aCallback) {
	    var _this19 = this;

	    const packet = {
	      to: this._form.actor,
	      type: "disablePrettyPrint"
	    };
	    this._client.request(packet, function (aResponse) {
	      if (!aResponse.error) {
	        _this19._isPrettyPrinted = false;
	        _this19._activeThread._clearFrames();
	        _this19._activeThread.emit("prettyprintchange", _this19);
	      }
	      _this19._onSourceResponse(aResponse, aCallback);
	    });
	  },

	  _onSourceResponse: function (aResponse, aCallback) {
	    if (aResponse.error) {
	      aCallback(aResponse);
	      return;
	    }

	    if (typeof aResponse.source === "string") {
	      aCallback(aResponse);
	      return;
	    }

	    let contentType = aResponse.contentType;
	    let source = aResponse.source;

	    let longString = this._activeThread.threadLongString(source);
	    longString.substring(0, longString.length, function (aResponse) {
	      if (aResponse.error) {
	        aCallback(aResponse);
	        return;
	      }

	      aCallback({
	        source: aResponse.substring,
	        contentType: contentType
	      });
	    });
	  },

	  /**
	   * Request to set a breakpoint in the specified location.
	   *
	   * @param object aLocation
	   *        The location and condition of the breakpoint in
	   *        the form of { line[, column, condition] }.
	   * @param function aOnResponse
	   *        Called with the thread's response.
	   */
	  setBreakpoint: function ({ line, column, condition }, aOnResponse = noop) {
	    var _this20 = this;

	    // A helper function that sets the breakpoint.
	    let doSetBreakpoint = function (aCallback) {
	      let root = _this20._client.mainRoot;
	      let location = {
	        line: line,
	        column: column
	      };

	      let packet = {
	        to: _this20.actor,
	        type: "setBreakpoint",
	        location: location,
	        condition: condition
	      };

	      // Backwards compatibility: send the breakpoint request to the
	      // thread if the server doesn't support Debugger.Source actors.
	      if (!root.traits.debuggerSourceActors) {
	        packet.to = _this20._activeThread.actor;
	        packet.location.url = _this20.url;
	      }

	      _this20._client.request(packet, function (aResponse) {
	        // Ignoring errors, since the user may be setting a breakpoint in a
	        // dead script that will reappear on a page reload.
	        let bpClient;
	        if (aResponse.actor) {
	          bpClient = new BreakpointClient(_this20._client, _this20, aResponse.actor, location, root.traits.conditionalBreakpoints ? condition : undefined);
	        }
	        aOnResponse(aResponse, bpClient);
	        if (aCallback) {
	          aCallback();
	        }
	      });
	    };

	    // If the debuggee is paused, just set the breakpoint.
	    if (this._activeThread.paused) {
	      doSetBreakpoint();
	      return;
	    }
	    // Otherwise, force a pause in order to set the breakpoint.
	    this._activeThread.interrupt(function (aResponse) {
	      if (aResponse.error) {
	        // Can't set the breakpoint if pausing failed.
	        aOnResponse(aResponse);
	        return;
	      }

	      const type = aResponse.type;
	      const why = aResponse.why;

	      const cleanUp = type == "paused" && why.type == "interrupted" ? function () {
	        return _this20._activeThread.resume();
	      } : noop;

	      doSetBreakpoint(cleanUp);
	    });
	  }
	};

	/**
	 * Breakpoint clients are used to remove breakpoints that are no longer used.
	 *
	 * @param aClient DebuggerClient
	 *        The debugger client parent.
	 * @param aSourceClient SourceClient
	 *        The source where this breakpoint exists
	 * @param aActor string
	 *        The actor ID for this breakpoint.
	 * @param aLocation object
	 *        The location of the breakpoint. This is an object with two properties:
	 *        url and line.
	 * @param aCondition string
	 *        The conditional expression of the breakpoint
	 */
	function BreakpointClient(aClient, aSourceClient, aActor, aLocation, aCondition) {
	  this._client = aClient;
	  this._actor = aActor;
	  this.location = aLocation;
	  this.location.actor = aSourceClient.actor;
	  this.location.url = aSourceClient.url;
	  this.source = aSourceClient;
	  this.request = this._client.request;

	  // The condition property should only exist if it's a truthy value
	  if (aCondition) {
	    this.condition = aCondition;
	  }
	}

	BreakpointClient.prototype = {

	  _actor: null,
	  get actor() {
	    return this._actor;
	  },
	  get _transport() {
	    return this._client._transport;
	  },

	  /**
	   * Remove the breakpoint from the server.
	   */
	  remove: DebuggerClient.requester({
	    type: "delete"
	  }, {
	    telemetry: "DELETE"
	  }),

	  /**
	   * Determines if this breakpoint has a condition
	   */
	  hasCondition: function () {
	    let root = this._client.mainRoot;
	    // XXX bug 990137: We will remove support for client-side handling of
	    // conditional breakpoints
	    if (root.traits.conditionalBreakpoints) {
	      return "condition" in this;
	    } else {
	      return "conditionalExpression" in this;
	    }
	  },

	  /**
	   * Get the condition of this breakpoint. Currently we have to
	   * support locally emulated conditional breakpoints until the
	   * debugger servers are updated (see bug 990137). We used a
	   * different property when moving it server-side to ensure that we
	   * are testing the right code.
	   */
	  getCondition: function () {
	    let root = this._client.mainRoot;
	    if (root.traits.conditionalBreakpoints) {
	      return this.condition;
	    } else {
	      return this.conditionalExpression;
	    }
	  },

	  /**
	   * Set the condition of this breakpoint
	   */
	  setCondition: function (gThreadClient, aCondition) {
	    var _this21 = this;

	    let root = this._client.mainRoot;
	    let deferred = promise.defer();

	    if (root.traits.conditionalBreakpoints) {
	      let info = {
	        line: this.location.line,
	        column: this.location.column,
	        condition: aCondition
	      };

	      // Remove the current breakpoint and add a new one with the
	      // condition.
	      this.remove(function (aResponse) {
	        if (aResponse && aResponse.error) {
	          deferred.reject(aResponse);
	          return;
	        }

	        _this21.source.setBreakpoint(info, function (aResponse, aNewBreakpoint) {
	          if (aResponse && aResponse.error) {
	            deferred.reject(aResponse);
	          } else {
	            deferred.resolve(aNewBreakpoint);
	          }
	        });
	      });
	    } else {
	      // The property shouldn't even exist if the condition is blank
	      if (aCondition === "") {
	        delete this.conditionalExpression;
	      } else {
	        this.conditionalExpression = aCondition;
	      }
	      deferred.resolve(this);
	    }

	    return deferred.promise;
	  }
	};

	eventSource(BreakpointClient.prototype);

	/**
	 * Environment clients are used to manipulate the lexical environment actors.
	 *
	 * @param aClient DebuggerClient
	 *        The debugger client parent.
	 * @param aForm Object
	 *        The form sent across the remote debugging protocol.
	 */
	function EnvironmentClient(aClient, aForm) {
	  this._client = aClient;
	  this._form = aForm;
	  this.request = this._client.request;
	}
	exports.EnvironmentClient = EnvironmentClient;

	EnvironmentClient.prototype = {

	  get actor() {
	    return this._form.actor;
	  },
	  get _transport() {
	    return this._client._transport;
	  },

	  /**
	   * Fetches the bindings introduced by this lexical environment.
	   */
	  getBindings: DebuggerClient.requester({
	    type: "bindings"
	  }, {
	    telemetry: "BINDINGS"
	  }),

	  /**
	   * Changes the value of the identifier whose name is name (a string) to that
	   * represented by value (a grip).
	   */
	  assign: DebuggerClient.requester({
	    type: "assign",
	    name: args(0),
	    value: args(1)
	  }, {
	    telemetry: "ASSIGN"
	  })
	};

	eventSource(EnvironmentClient.prototype);

/***/ },
/* 1 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";

	/*
	 * A sham for https://developer.mozilla.org/en-US/Add-ons/SDK/Low-Level_APIs/chrome
	 */

	var inDOMUtils = __webpack_require__(2);

	var ourServices = {
	  inIDOMUtils: inDOMUtils,
	  nsIClipboardHelper: {
	    copyString: function () {}
	  },
	  nsIXULChromeRegistry: {
	    isLocaleRTL: function () {
	      return false;
	    }
	  }
	};

	module.exports = {
	  Cc: function (name) {
	    console.log('Sham for', name);
	    return {
	      getService: function (name) {
	        return ourServices[name];
	      }
	    };
	  },
	  Ci: {
	    nsIThread: {
	      "DISPATCH_NORMAL": 0,
	      "DISPATCH_SYNC": 1
	    },
	    nsIDOMNode: HTMLElement,
	    nsIFocusManager: {
	      MOVEFOCUS_BACKWARD: 2,
	      MOVEFOCUS_FORWARD: 1
	    },
	    nsIDOMKeyEvent: {},
	    inIDOMUtils: "inIDOMUtils",
	    nsIClipboardHelper: "nsIClipboardHelper",
	    nsIXULChromeRegistry: "nsIXULChromeRegistry"
	  },
	  Cu: {
	    reportError: function (msg) {
	      return console.error(msg);
	    },
	    callFunctionWithAsyncStack: function (fn) {
	      return fn();
	    }
	  },
	  Cr: {},
	  components: {
	    isSuccessCode: function () {
	      return (returnCode & 0x80000000) === 0;
	    }
	  }
	};

/***/ },
/* 2 */
/***/ function(module, exports, __webpack_require__) {

	// A sham for inDOMUtils.

	"use strict";

	var _require = __webpack_require__(3);

	var CSSLexer = _require.CSSLexer;

	var _require2 = __webpack_require__(4);

	var cssColors = _require2.cssColors;

	var _require3 = __webpack_require__(5);

	var cssProperties = _require3.cssProperties;

	var cssRGBMap;

	// From inIDOMUtils.idl.
	var EXCLUDE_SHORTHANDS = 1 << 0;
	var INCLUDE_ALIASES = 1 << 1;
	var TYPE_LENGTH = 0;
	var TYPE_PERCENTAGE = 1;
	var TYPE_COLOR = 2;
	var TYPE_URL = 3;
	var TYPE_ANGLE = 4;
	var TYPE_FREQUENCY = 5;
	var TYPE_TIME = 6;
	var TYPE_GRADIENT = 7;
	var TYPE_TIMING_FUNCTION = 8;
	var TYPE_IMAGE_RECT = 9;
	var TYPE_NUMBER = 10;

	function getCSSLexer(text) {
	  return new CSSLexer(text);
	}

	function rgbToColorName(r, g, b) {
	  if (!cssRGBMap) {
	    cssRGBMap = new Map();
	    for (let name in cssColors) {
	      cssRGBMap.set(JSON.stringify(cssColors[name]), name);
	    }
	  }
	  let value = cssRGBMap.get(JSON.stringify([r, g, b]));
	  if (!value) {
	    throw new Error("no such color");
	  }
	  return value;
	}

	// Taken from dom/tests/mochitest/ajax/mochikit/MochiKit/Color.js
	function _hslValue(n1, n2, hue) {
	  if (hue > 6.0) {
	    hue -= 6.0;
	  } else if (hue < 0.0) {
	    hue += 6.0;
	  }
	  var val;
	  if (hue < 1.0) {
	    val = n1 + (n2 - n1) * hue;
	  } else if (hue < 3.0) {
	    val = n2;
	  } else if (hue < 4.0) {
	    val = n1 + (n2 - n1) * (4.0 - hue);
	  } else {
	    val = n1;
	  }
	  return val;
	}

	// Taken from dom/tests/mochitest/ajax/mochikit/MochiKit/Color.js
	// and then modified.
	function hslToRGB([hue, saturation, lightness]) {
	  var red;
	  var green;
	  var blue;
	  if (saturation === 0) {
	    red = lightness;
	    green = lightness;
	    blue = lightness;
	  } else {
	    var m2;
	    if (lightness <= 0.5) {
	      m2 = lightness * (1.0 + saturation);
	    } else {
	      m2 = lightness + saturation - lightness * saturation;
	    }
	    var m1 = 2.0 * lightness - m2;
	    var f = _hslValue;
	    var h6 = hue * 6.0;
	    red = f(m1, m2, h6 + 2);
	    green = f(m1, m2, h6);
	    blue = f(m1, m2, h6 - 2);
	  }
	  return [red, green, blue];
	}

	function colorToRGBA(name) {
	  name = name.trim().toLowerCase();
	  if (name in cssColors) {
	    return cssColors[name];
	  }

	  if (name === "transparent") {
	    return [0, 0, 0, 0];
	  }

	  let lexer = getCSSLexer(name);

	  let getToken = function () {
	    while (true) {
	      let token = lexer.nextToken();
	      if (!token || token.tokenType !== "comment" || token.tokenType !== "whitespace") {
	        return token;
	      }
	    }
	  };

	  let requireComma = function (token) {
	    if (token.tokenType !== "symbol" || token.text !== ",") {
	      return null;
	    }
	    return getToken();
	  };

	  let func = getToken();
	  if (!func || func.tokenType !== "function") {
	    return null;
	  }
	  let alpha = false;
	  if (func.text === "rgb" || func.text === "hsl") {
	    // Nothing.
	  } else if (func.text === "rgba" || func.text === "hsla") {
	      alpha = true;
	    } else {
	      return null;
	    }

	  let vals = [];
	  for (let i = 0; i < 3; ++i) {
	    let token = getToken();
	    if (i > 0) {
	      token = requireComma(token);
	    }
	    if (token.tokenType !== "number" || !token.isInteger) {
	      return null;
	    }
	    let num = token.number;
	    if (num < 0) {
	      num = 0;
	    } else if (num > 255) {
	      num = 255;
	    }
	    vals.push(num);
	  }

	  if (func.text === "hsl" || func.text === "hsla") {
	    vals = hslToRGB(vals);
	  }

	  if (alpha) {
	    let token = requireComma(getToken());
	    if (token.tokenType !== "number") {
	      return null;
	    }
	    let num = token.number;
	    if (num < 0) {
	      num = 0;
	    } else if (num > 1) {
	      num = 1;
	    }
	    vals.push(num);
	  } else {
	    vals.push(1);
	  }

	  let parenToken = getToken();
	  if (!parenToken || parenToken.tokenType !== "symbol" || parenToken.text !== ")") {
	    return null;
	  }
	  if (getToken() !== null) {
	    return null;
	  }

	  return vals;
	}

	function isValidCSSColor(name) {
	  return colorToRGBA(name) !== null;
	}

	function isVariable(name) {
	  return name.startsWith("--");
	}

	function cssPropertyIsShorthand(name) {
	  if (isVariable(name)) {
	    return false;
	  }
	  if (!(name in cssProperties)) {
	    throw Error("unknown property " + name);
	  }
	  return !!cssProperties[name].subproperties;
	}

	function getSubpropertiesForCSSProperty(name) {
	  if (isVariable(name)) {
	    return [name];
	  }
	  if (!(name in cssProperties)) {
	    throw Error("unknown property " + name);
	  }
	  if ("subproperties" in cssProperties[name]) {
	    return cssProperties[name].subproperties.slice();
	  }
	  return [name];
	}

	function getCSSValuesForProperty(name) {
	  if (isVariable(name)) {
	    return ["initial", "inherit", "unset"];
	  }
	  if (!(name in cssProperties)) {
	    throw Error("unknown property " + name);
	  }
	  return cssProperties[name].values.slice();
	}

	function getCSSPropertyNames(flags) {
	  let names = Object.keys(cssProperties);
	  if ((flags & EXCLUDE_SHORTHANDS) !== 0) {
	    names = names.filter(function (name) {
	      return cssProperties[name].subproperties;
	    });
	  }
	  if ((flags & INCLUDE_ALIASES) === 0) {
	    names = names.filter(function (name) {
	      return !cssProperties[name].alias;
	    });
	  }
	  return names;
	}

	function cssPropertySupportsType(name, type) {
	  if (isVariable(name)) {
	    return false;
	  }
	  if (!(name in cssProperties)) {
	    throw Error("unknown property " + name);
	  }
	  return (cssProperties[name].supports & 1 << type) !== 0;
	}

	function isInheritedProperty(name) {
	  if (isVariable(name)) {
	    return true;
	  }
	  if (!(name in cssProperties)) {
	    return false;
	  }
	  return cssProperties[name].inherited;
	}

	function cssPropertyIsValid(name, value) {
	  if (isVariable(name)) {
	    return true;
	  }
	  if (!(name in cssProperties)) {
	    return false;
	  }
	  let elt = document.createElement("div");
	  elt.style = name + ":" + value;
	  return elt.style.length > 0;
	}

	module.exports = {
	  getCSSLexer,
	  rgbToColorName,
	  colorToRGBA,
	  isValidCSSColor,
	  cssPropertyIsShorthand,
	  getSubpropertiesForCSSProperty,
	  getCSSValuesForProperty,
	  getCSSPropertyNames,
	  cssPropertySupportsType,
	  isInheritedProperty,
	  cssPropertyIsValid,

	  // Constants.
	  EXCLUDE_SHORTHANDS,
	  INCLUDE_ALIASES,
	  TYPE_LENGTH,
	  TYPE_PERCENTAGE,
	  TYPE_COLOR,
	  TYPE_URL,
	  TYPE_ANGLE,
	  TYPE_FREQUENCY,
	  TYPE_TIME,
	  TYPE_GRADIENT,
	  TYPE_TIMING_FUNCTION,
	  TYPE_IMAGE_RECT,
	  TYPE_NUMBER
	};

/***/ },
/* 3 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;"use strict";

	(function (root, factory) {
		// Universal Module Definition (UMD) to support AMD, CommonJS/Node.js,
		// Rhino, and plain browser loading.
		if (true) {
			!(__WEBPACK_AMD_DEFINE_ARRAY__ = [exports], __WEBPACK_AMD_DEFINE_FACTORY__ = (factory), __WEBPACK_AMD_DEFINE_RESULT__ = (typeof __WEBPACK_AMD_DEFINE_FACTORY__ === 'function' ? (__WEBPACK_AMD_DEFINE_FACTORY__.apply(exports, __WEBPACK_AMD_DEFINE_ARRAY__)) : __WEBPACK_AMD_DEFINE_FACTORY__), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
		} else if (typeof exports !== 'undefined') {
			factory(exports);
		} else {
			factory(root);
		}
	})(this, function (exports) {

		function between(num, first, last) {
			return num >= first && num <= last;
		}
		function digit(code) {
			return between(code, 0x30, 0x39);
		}
		function hexdigit(code) {
			return digit(code) || between(code, 0x41, 0x46) || between(code, 0x61, 0x66);
		}
		function uppercaseletter(code) {
			return between(code, 0x41, 0x5a);
		}
		function lowercaseletter(code) {
			return between(code, 0x61, 0x7a);
		}
		function letter(code) {
			return uppercaseletter(code) || lowercaseletter(code);
		}
		function nonascii(code) {
			return code >= 0x80;
		}
		function namestartchar(code) {
			return letter(code) || nonascii(code) || code == 0x5f;
		}
		function namechar(code) {
			return namestartchar(code) || digit(code) || code == 0x2d;
		}
		function nonprintable(code) {
			return between(code, 0, 8) || code == 0xb || between(code, 0xe, 0x1f) || code == 0x7f;
		}
		function newline(code) {
			return code == 0xa;
		}
		function whitespace(code) {
			return newline(code) || code == 9 || code == 0x20;
		}

		var maximumallowedcodepoint = 0x10ffff;

		var InvalidCharacterError = function (message) {
			this.message = message;
		};
		InvalidCharacterError.prototype = new Error();
		InvalidCharacterError.prototype.name = 'InvalidCharacterError';

		function stringFromCode(code) {
			if (code <= 0xffff) return String.fromCharCode(code);
			// Otherwise, encode astral char as surrogate pair.
			code -= Math.pow(2, 20);
			var lead = Math.floor(code / Math.pow(2, 10)) + 0xd800;
			var trail = code % Math.pow(2, 10) + 0xdc00;
			return String.fromCharCode(lead) + String.fromCharCode(trail);
		}

		function* tokenize(str, options) {
			if (options === undefined) {
				options = {};
			}
			if (options.loc === undefined) {
				options.loc = false;
			}
			if (options.offsets === undefined) {
				options.offsets = false;
			}
			if (options.keepComments === undefined) {
				options.keepComments = false;
			}
			if (options.startOffset === undefined) {
				options.startOffset = 0;
			}

			var i = options.startOffset - 1;
			var code;

			// Line number information.
			var line = 0;
			var column = 0;
			// The only use of lastLineLength is in reconsume().
			var lastLineLength = 0;
			var incrLineno = function () {
				line += 1;
				lastLineLength = column;
				column = 0;
			};
			var locStart = { line: line, column: column };
			var offsetStart = i;

			var codepoint = function (i) {
				if (i >= str.length) {
					return -1;
				}
				return str.charCodeAt(i);
			};
			var next = function (num) {
				if (num === undefined) num = 1;
				if (num > 3) throw "Spec Error: no more than three codepoints of lookahead.";

				var rcode;
				for (var offset = i + 1; num-- > 0; ++offset) {
					rcode = codepoint(offset);
					if (rcode === 0xd && codepoint(offset + 1) === 0xa) {
						++offset;
						rcode = 0xa;
					} else if (rcode === 0xd || rcode === 0xc) {
						rcode = 0xa;
					} else if (rcode === 0x0) {
						rcode = 0xfffd;
					}
				}

				return rcode;
			};
			var consume = function (num) {
				if (num === undefined) num = 1;
				while (num-- > 0) {
					++i;
					code = codepoint(i);
					if (code === 0xd && codepoint(i + 1) === 0xa) {
						++i;
						code = 0xa;
					} else if (code === 0xd || code === 0xc) {
						code = 0xa;
					} else if (code === 0x0) {
						code = 0xfffd;
					}
					if (newline(code)) incrLineno();else column++;
				}
				return true;
			};
			var reconsume = function () {
				i -= 1; // This is ok even in the \r\n case.
				if (newline(code)) {
					line -= 1;
					column = lastLineLength;
				} else {
					column -= 1;
				}
				return true;
			};
			var eof = function (codepoint) {
				if (codepoint === undefined) codepoint = code;
				return codepoint == -1;
			};
			var donothing = function () {};
			var parseerror = function () {
				console.log("Parse error at index " + i + ", processing codepoint 0x" + code.toString(16) + ".");return true;
			};

			var consumeAToken = function () {
				consume();
				if (!options.keepComments) {
					while (code == 0x2f && next() == 0x2a) {
						consumeAComment();
						consume();
					}
				}
				locStart.line = line;
				locStart.column = column;
				offsetStart = i;
				if (whitespace(code)) {
					while (whitespace(next())) consume();
					return new WhitespaceToken();
				} else if (code == 0x2f && next() == 0x2a) return consumeAComment();else if (code == 0x22) return consumeAStringToken();else if (code == 0x23) {
					if (namechar(next()) || areAValidEscape(next(1), next(2))) {
						var token = new HashToken();
						if (wouldStartAnIdentifier(next(1), next(2), next(3))) {
							token.type = "id";
							token.tokenType = "id";
						}
						token.value = consumeAName();
						token.text = token.value;
						return token;
					} else {
						return new DelimToken(code);
					}
				} else if (code == 0x24) {
					if (next() == 0x3d) {
						consume();
						return new SuffixMatchToken();
					} else {
						return new DelimToken(code);
					}
				} else if (code == 0x27) return consumeAStringToken();else if (code == 0x28) return new OpenParenToken();else if (code == 0x29) return new CloseParenToken();else if (code == 0x2a) {
					if (next() == 0x3d) {
						consume();
						return new SubstringMatchToken();
					} else {
						return new DelimToken(code);
					}
				} else if (code == 0x2b) {
					if (startsWithANumber()) {
						reconsume();
						return consumeANumericToken();
					} else {
						return new DelimToken(code);
					}
				} else if (code == 0x2c) return new CommaToken();else if (code == 0x2d) {
					if (startsWithANumber()) {
						reconsume();
						return consumeANumericToken();
					} else if (next(1) == 0x2d && next(2) == 0x3e) {
						consume(2);
						return new CDCToken();
					} else if (startsWithAnIdentifier()) {
						reconsume();
						return consumeAnIdentlikeToken();
					} else {
						return new DelimToken(code);
					}
				} else if (code == 0x2e) {
					if (startsWithANumber()) {
						reconsume();
						return consumeANumericToken();
					} else {
						return new DelimToken(code);
					}
				} else if (code == 0x3a) return new ColonToken();else if (code == 0x3b) return new SemicolonToken();else if (code == 0x3c) {
					if (next(1) == 0x21 && next(2) == 0x2d && next(3) == 0x2d) {
						consume(3);
						return new CDOToken();
					} else {
						return new DelimToken(code);
					}
				} else if (code == 0x40) {
					if (wouldStartAnIdentifier(next(1), next(2), next(3))) {
						return new AtKeywordToken(consumeAName());
					} else {
						return new DelimToken(code);
					}
				} else if (code == 0x5b) return new OpenSquareToken();else if (code == 0x5c) {
					if (startsWithAValidEscape()) {
						reconsume();
						return consumeAnIdentlikeToken();
					} else {
						parseerror();
						return new DelimToken(code);
					}
				} else if (code == 0x5d) return new CloseSquareToken();else if (code == 0x5e) {
					if (next() == 0x3d) {
						consume();
						return new PrefixMatchToken();
					} else {
						return new DelimToken(code);
					}
				} else if (code == 0x7b) return new OpenCurlyToken();else if (code == 0x7c) {
					if (next() == 0x3d) {
						consume();
						return new DashMatchToken();
						// } else if(next() == 0x7c) {
						// 	consume();
						// 	return new ColumnToken();
					} else {
							return new DelimToken(code);
						}
				} else if (code == 0x7d) return new CloseCurlyToken();else if (code == 0x7e) {
					if (next() == 0x3d) {
						consume();
						return new IncludeMatchToken();
					} else {
						return new DelimToken(code);
					}
				} else if (digit(code)) {
					reconsume();
					return consumeANumericToken();
				} else if (namestartchar(code)) {
					reconsume();
					return consumeAnIdentlikeToken();
				} else if (eof()) return new EOFToken();else return new DelimToken(code);
			};

			var consumeAComment = function () {
				consume();
				var comment = "";
				while (true) {
					consume();
					if (code == 0x2a && next() == 0x2f) {
						consume();
						break;
					} else if (eof()) {
						break;
					}
					comment += stringFromCode(code);
				}
				return new CommentToken(comment);
			};

			var consumeANumericToken = function () {
				var num = consumeANumber();
				var token;
				if (wouldStartAnIdentifier(next(1), next(2), next(3))) {
					token = new DimensionToken();
					token.value = num.value;
					token.repr = num.repr;
					token.type = num.type;
					token.unit = consumeAName();
					token.text = token.unit;
				} else if (next() == 0x25) {
					consume();
					token = new PercentageToken();
					token.value = num.value;
					token.repr = num.repr;
				} else {
					var token = new NumberToken();
					token.value = num.value;
					token.repr = num.repr;
					token.type = num.type;
				}
				token.number = token.value;
				token.isInteger = token.type === "integer";
				// FIXME hasSign
				return token;
			};

			var consumeAnIdentlikeToken = function () {
				var str = consumeAName();
				if (str.toLowerCase() == "url" && next() == 0x28) {
					consume();
					while (whitespace(next(1)) && whitespace(next(2))) consume();
					if (next() == 0x22 || next() == 0x27 || whitespace(next()) && (next(2) == 0x22 || next(2) == 0x27)) {
						while (whitespace(next())) consume();
						consume();
						let str = consumeAStringToken();
						while (whitespace(next())) consume();
						// The closing paren.
						consume();
						return new URLToken(str.text);
					} else {
						return consumeAURLToken();
					}
				} else if (next() == 0x28) {
					consume();
					return new FunctionToken(str);
				} else {
					return new IdentToken(str);
				}
			};

			var consumeAStringToken = function (endingCodePoint) {
				if (endingCodePoint === undefined) endingCodePoint = code;
				var string = "";
				while (consume()) {
					if (code == endingCodePoint || eof()) {
						return new StringToken(string);
					} else if (newline(code)) {
						reconsume();
						return new BadStringToken(string);
					} else if (code == 0x5c) {
						if (eof(next())) {
							donothing();
						} else if (newline(next())) {
							consume();
						} else {
							string += stringFromCode(consumeEscape());
						}
					} else {
						string += stringFromCode(code);
					}
				}
			};

			var consumeAURLToken = function () {
				var token = new URLToken("");
				while (whitespace(next())) consume();
				if (eof(next())) return token;
				while (consume()) {
					if (code == 0x29 || eof()) {
						break;
					} else if (whitespace(code)) {
						while (whitespace(next())) consume();
						if (next() == 0x29 || eof(next())) {
							consume();
							break;
						} else {
							consumeTheRemnantsOfABadURL();
							return new BadURLToken();
						}
					} else if (code == 0x22 || code == 0x27 || code == 0x28 || nonprintable(code)) {
						parseerror();
						consumeTheRemnantsOfABadURL();
						return new BadURLToken();
					} else if (code == 0x5c) {
						if (startsWithAValidEscape()) {
							token.value += stringFromCode(consumeEscape());
						} else {
							parseerror();
							consumeTheRemnantsOfABadURL();
							return new BadURLToken();
						}
					} else {
						token.value += stringFromCode(code);
					}
				}
				token.text = token.value;
				return token;
			};

			var consumeEscape = function () {
				// Assume the the current character is the \
				// and the next code point is not a newline.
				consume();
				if (hexdigit(code)) {
					// Consume 1-6 hex digits
					var digits = [code];
					for (var total = 0; total < 5; total++) {
						if (hexdigit(next())) {
							consume();
							digits.push(code);
						} else {
							break;
						}
					}
					if (whitespace(next())) consume();
					var value = parseInt(digits.map(function (x) {
						return String.fromCharCode(x);
					}).join(''), 16);
					if (value > maximumallowedcodepoint) value = 0xfffd;
					return value;
				} else if (eof()) {
					return 0xfffd;
				} else {
					return code;
				}
			};

			var areAValidEscape = function (c1, c2) {
				if (c1 != 0x5c) return false;
				if (newline(c2)) return false;
				return true;
			};
			var startsWithAValidEscape = function () {
				return areAValidEscape(code, next());
			};

			var wouldStartAnIdentifier = function (c1, c2, c3) {
				if (c1 == 0x2d) {
					return namestartchar(c2) || c2 == 0x2d || areAValidEscape(c2, c3);
				} else if (namestartchar(c1)) {
					return true;
				} else if (c1 == 0x5c) {
					return areAValidEscape(c1, c2);
				} else {
					return false;
				}
			};
			var startsWithAnIdentifier = function () {
				return wouldStartAnIdentifier(code, next(1), next(2));
			};

			var wouldStartANumber = function (c1, c2, c3) {
				if (c1 == 0x2b || c1 == 0x2d) {
					if (digit(c2)) return true;
					if (c2 == 0x2e && digit(c3)) return true;
					return false;
				} else if (c1 == 0x2e) {
					if (digit(c2)) return true;
					return false;
				} else if (digit(c1)) {
					return true;
				} else {
					return false;
				}
			};
			var startsWithANumber = function () {
				return wouldStartANumber(code, next(1), next(2));
			};

			var consumeAName = function () {
				var result = "";
				while (consume()) {
					if (namechar(code)) {
						result += stringFromCode(code);
					} else if (startsWithAValidEscape()) {
						result += stringFromCode(consumeEscape());
					} else {
						reconsume();
						return result;
					}
				}
			};

			var consumeANumber = function () {
				var repr = [];
				var type = "integer";
				if (next() == 0x2b || next() == 0x2d) {
					consume();
					repr += stringFromCode(code);
				}
				while (digit(next())) {
					consume();
					repr += stringFromCode(code);
				}
				if (next(1) == 0x2e && digit(next(2))) {
					consume();
					repr += stringFromCode(code);
					consume();
					repr += stringFromCode(code);
					type = "number";
					while (digit(next())) {
						consume();
						repr += stringFromCode(code);
					}
				}
				var c1 = next(1),
				    c2 = next(2),
				    c3 = next(3);
				if ((c1 == 0x45 || c1 == 0x65) && digit(c2)) {
					consume();
					repr += stringFromCode(code);
					consume();
					repr += stringFromCode(code);
					type = "number";
					while (digit(next())) {
						consume();
						repr += stringFromCode(code);
					}
				} else if ((c1 == 0x45 || c1 == 0x65) && (c2 == 0x2b || c2 == 0x2d) && digit(c3)) {
					consume();
					repr += stringFromCode(code);
					consume();
					repr += stringFromCode(code);
					consume();
					repr += stringFromCode(code);
					type = "number";
					while (digit(next())) {
						consume();
						repr += stringFromCode(code);
					}
				}
				var value = convertAStringToANumber(repr);
				return { type: type, value: value, repr: repr };
			};

			var convertAStringToANumber = function (string) {
				// CSS's number rules are identical to JS, afaik.
				return +string;
			};

			var consumeTheRemnantsOfABadURL = function () {
				while (consume()) {
					if (code == 0x2d || eof()) {
						return;
					} else if (startsWithAValidEscape()) {
						consumeEscape();
						donothing();
					} else {
						donothing();
					}
				}
			};

			var iterationCount = 0;
			while (!eof(next())) {
				var token = consumeAToken();
				if (options.loc) {
					token.loc = {};
					token.loc.start = { line: locStart.line, column: locStart.column };
					token.loc.end = { line: line, column: column };
				}
				if (options.offsets) {
					token.startOffset = offsetStart;
					token.endOffset = i + 1;
				}
				yield token;
				iterationCount++;
				if (iterationCount > str.length * 2) return "I'm infinite-looping!";
			}
		}

		function CSSParserToken() {
			throw "Abstract Base Class";
		}
		CSSParserToken.prototype.toJSON = function () {
			return { token: this.tokenType };
		};
		CSSParserToken.prototype.toString = function () {
			return this.tokenType;
		};
		CSSParserToken.prototype.toSource = function () {
			return '' + this;
		};

		function BadStringToken(text) {
			this.text = text;
			return this;
		}
		BadStringToken.prototype = Object.create(CSSParserToken.prototype);
		BadStringToken.prototype.tokenType = "bad_string";

		function BadURLToken() {
			return this;
		}
		BadURLToken.prototype = Object.create(CSSParserToken.prototype);
		BadURLToken.prototype.tokenType = "bad_url";

		function WhitespaceToken() {
			return this;
		}
		WhitespaceToken.prototype = Object.create(CSSParserToken.prototype);
		WhitespaceToken.prototype.tokenType = "whitespace";
		WhitespaceToken.prototype.toString = function () {
			return "WS";
		};
		WhitespaceToken.prototype.toSource = function () {
			return " ";
		};

		function CDOToken() {
			return this;
		}
		CDOToken.prototype = Object.create(CSSParserToken.prototype);
		CDOToken.prototype.tokenType = "htmlcomment";
		CDOToken.prototype.toSource = function () {
			return "<!--";
		};

		function CDCToken() {
			return this;
		}
		CDCToken.prototype = Object.create(CSSParserToken.prototype);
		CDCToken.prototype.tokenType = "htmlcomment";
		CDCToken.prototype.toSource = function () {
			return "-->";
		};

		function ColonToken() {
			return this;
		}
		ColonToken.prototype = Object.create(CSSParserToken.prototype);
		ColonToken.prototype.tokenType = "symbol";
		ColonToken.prototype.text = ":";

		function SemicolonToken() {
			return this;
		}
		SemicolonToken.prototype = Object.create(CSSParserToken.prototype);
		SemicolonToken.prototype.tokenType = "symbol";
		SemicolonToken.prototype.text = ";";

		function CommaToken() {
			return this;
		}
		CommaToken.prototype = Object.create(CSSParserToken.prototype);
		CommaToken.prototype.tokenType = "symbol";
		CommaToken.prototype.text = ",";

		function GroupingToken() {
			throw "Abstract Base Class";
		}
		GroupingToken.prototype = Object.create(CSSParserToken.prototype);

		function OpenCurlyToken() {
			this.value = "{";this.mirror = "}";return this;
		}
		OpenCurlyToken.prototype = Object.create(GroupingToken.prototype);
		OpenCurlyToken.prototype.tokenType = "symbol";
		OpenCurlyToken.prototype.text = "{";

		function CloseCurlyToken() {
			this.value = "}";this.mirror = "{";return this;
		}
		CloseCurlyToken.prototype = Object.create(GroupingToken.prototype);
		CloseCurlyToken.prototype.tokenType = "symbol";
		CloseCurlyToken.prototype.text = "}";

		function OpenSquareToken() {
			this.value = "[";this.mirror = "]";return this;
		}
		OpenSquareToken.prototype = Object.create(GroupingToken.prototype);
		OpenSquareToken.prototype.tokenType = "symbol";
		OpenSquareToken.prototype.text = "[";

		function CloseSquareToken() {
			this.value = "]";this.mirror = "[";return this;
		}
		CloseSquareToken.prototype = Object.create(GroupingToken.prototype);
		CloseSquareToken.prototype.tokenType = "symbol";
		CloseSquareToken.prototype.text = "]";

		function OpenParenToken() {
			this.value = "(";this.mirror = ")";return this;
		}
		OpenParenToken.prototype = Object.create(GroupingToken.prototype);
		OpenParenToken.prototype.tokenType = "symbol";
		OpenParenToken.prototype.text = "(";

		function CloseParenToken() {
			this.value = ")";this.mirror = "(";return this;
		}
		CloseParenToken.prototype = Object.create(GroupingToken.prototype);
		CloseParenToken.prototype.tokenType = "symbol";
		CloseParenToken.prototype.text = ")";

		function IncludeMatchToken() {
			return this;
		}
		IncludeMatchToken.prototype = Object.create(CSSParserToken.prototype);
		IncludeMatchToken.prototype.tokenType = "includes";

		function DashMatchToken() {
			return this;
		}
		DashMatchToken.prototype = Object.create(CSSParserToken.prototype);
		DashMatchToken.prototype.tokenType = "dashmatch";

		function PrefixMatchToken() {
			return this;
		}
		PrefixMatchToken.prototype = Object.create(CSSParserToken.prototype);
		PrefixMatchToken.prototype.tokenType = "beginsmatch";

		function SuffixMatchToken() {
			return this;
		}
		SuffixMatchToken.prototype = Object.create(CSSParserToken.prototype);
		SuffixMatchToken.prototype.tokenType = "endsmatch";

		function SubstringMatchToken() {
			return this;
		}
		SubstringMatchToken.prototype = Object.create(CSSParserToken.prototype);
		SubstringMatchToken.prototype.tokenType = "containsmatch";

		function ColumnToken() {
			return this;
		}
		ColumnToken.prototype = Object.create(CSSParserToken.prototype);
		ColumnToken.prototype.tokenType = "||";

		function EOFToken() {
			return this;
		}
		EOFToken.prototype = Object.create(CSSParserToken.prototype);
		EOFToken.prototype.tokenType = "EOF";
		EOFToken.prototype.toSource = function () {
			return "";
		};

		function DelimToken(code) {
			this.value = stringFromCode(code);
			this.text = this.value;
			return this;
		}
		DelimToken.prototype = Object.create(CSSParserToken.prototype);
		DelimToken.prototype.tokenType = "symbol";
		DelimToken.prototype.toString = function () {
			return "DELIM(" + this.value + ")";
		};
		DelimToken.prototype.toJSON = function () {
			var json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
			json.value = this.value;
			return json;
		};
		DelimToken.prototype.toSource = function () {
			if (this.value == "\\") return "\\\n";else return this.value;
		};

		function StringValuedToken() {
			throw "Abstract Base Class";
		}
		StringValuedToken.prototype = Object.create(CSSParserToken.prototype);
		StringValuedToken.prototype.ASCIIMatch = function (str) {
			return this.value.toLowerCase() == str.toLowerCase();
		};
		StringValuedToken.prototype.toJSON = function () {
			var json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
			json.value = this.value;
			return json;
		};

		function IdentToken(val) {
			this.value = val;
			this.text = val;
		}
		IdentToken.prototype = Object.create(StringValuedToken.prototype);
		IdentToken.prototype.tokenType = "ident";
		IdentToken.prototype.toString = function () {
			return "IDENT(" + this.value + ")";
		};
		IdentToken.prototype.toSource = function () {
			return escapeIdent(this.value);
		};

		function FunctionToken(val) {
			this.value = val;
			this.text = val;
			this.mirror = ")";
		}
		FunctionToken.prototype = Object.create(StringValuedToken.prototype);
		FunctionToken.prototype.tokenType = "function";
		FunctionToken.prototype.toString = function () {
			return "FUNCTION(" + this.value + ")";
		};
		FunctionToken.prototype.toSource = function () {
			return escapeIdent(this.value) + "(";
		};

		function AtKeywordToken(val) {
			this.value = val;
			this.text = val;
		}
		AtKeywordToken.prototype = Object.create(StringValuedToken.prototype);
		AtKeywordToken.prototype.tokenType = "at";
		AtKeywordToken.prototype.toString = function () {
			return "AT(" + this.value + ")";
		};
		AtKeywordToken.prototype.toSource = function () {
			return "@" + escapeIdent(this.value);
		};

		function HashToken(val) {
			this.value = val;
			this.text = val;
			this.type = "unrestricted";
		}
		HashToken.prototype = Object.create(StringValuedToken.prototype);
		HashToken.prototype.tokenType = "hash";
		HashToken.prototype.toString = function () {
			return "HASH(" + this.value + ")";
		};
		HashToken.prototype.toJSON = function () {
			var json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
			json.value = this.value;
			json.type = this.type;
			return json;
		};
		HashToken.prototype.toSource = function () {
			if (this.type == "id") {
				return "#" + escapeIdent(this.value);
			} else {
				return "#" + escapeHash(this.value);
			}
		};

		function StringToken(val) {
			this.value = val;
			this.text = val;
		}
		StringToken.prototype = Object.create(StringValuedToken.prototype);
		StringToken.prototype.tokenType = "string";
		StringToken.prototype.toString = function () {
			return '"' + escapeString(this.value) + '"';
		};

		function CommentToken(val) {
			this.value = val;
		}
		CommentToken.prototype = Object.create(StringValuedToken.prototype);
		CommentToken.prototype.tokenType = "comment";
		CommentToken.prototype.toString = function () {
			return '/*' + this.value + '*/';
		};
		CommentToken.prototype.toSource = CommentToken.prototype.toString;

		function URLToken(val) {
			this.value = val;
			this.text = val;
		}
		URLToken.prototype = Object.create(StringValuedToken.prototype);
		URLToken.prototype.tokenType = "url";
		URLToken.prototype.toString = function () {
			return "URL(" + this.value + ")";
		};
		URLToken.prototype.toSource = function () {
			return 'url("' + escapeString(this.value) + '")';
		};

		function NumberToken() {
			this.value = null;
			this.type = "integer";
			this.repr = "";
		}
		NumberToken.prototype = Object.create(CSSParserToken.prototype);
		NumberToken.prototype.tokenType = "number";
		NumberToken.prototype.toString = function () {
			if (this.type == "integer") return "INT(" + this.value + ")";
			return "NUMBER(" + this.value + ")";
		};
		NumberToken.prototype.toJSON = function () {
			var json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
			json.value = this.value;
			json.type = this.type;
			json.repr = this.repr;
			return json;
		};
		NumberToken.prototype.toSource = function () {
			return this.repr;
		};

		function PercentageToken() {
			this.value = null;
			this.repr = "";
		}
		PercentageToken.prototype = Object.create(CSSParserToken.prototype);
		PercentageToken.prototype.tokenType = "percentage";
		PercentageToken.prototype.toString = function () {
			return "PERCENTAGE(" + this.value + ")";
		};
		PercentageToken.prototype.toJSON = function () {
			var json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
			json.value = this.value;
			json.repr = this.repr;
			return json;
		};
		PercentageToken.prototype.toSource = function () {
			return this.repr + "%";
		};

		function DimensionToken() {
			this.value = null;
			this.type = "integer";
			this.repr = "";
			this.unit = "";
		}
		DimensionToken.prototype = Object.create(CSSParserToken.prototype);
		DimensionToken.prototype.tokenType = "dimension";
		DimensionToken.prototype.toString = function () {
			return "DIM(" + this.value + "," + this.unit + ")";
		};
		DimensionToken.prototype.toJSON = function () {
			var json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
			json.value = this.value;
			json.type = this.type;
			json.repr = this.repr;
			json.unit = this.unit;
			return json;
		};
		DimensionToken.prototype.toSource = function () {
			var source = this.repr;
			var unit = escapeIdent(this.unit);
			if (unit[0].toLowerCase() == "e" && (unit[1] == "-" || between(unit.charCodeAt(1), 0x30, 0x39))) {
				// Unit is ambiguous with scinot
				// Remove the leading "e", replace with escape.
				unit = "\\65 " + unit.slice(1, unit.length);
			}
			return source + unit;
		};

		function escapeIdent(string) {
			string = '' + string;
			var result = '';
			var firstcode = string.charCodeAt(0);
			for (var i = 0; i < string.length; i++) {
				var code = string.charCodeAt(i);
				if (code === 0x0) {
					throw new InvalidCharacterError('Invalid character: the input contains U+0000.');
				}

				if (between(code, 0x1, 0x1f) || code == 0x7f || i === 0 && between(code, 0x30, 0x39) || i == 1 && between(code, 0x30, 0x39) && firstcode == 0x2d) {
					result += '\\' + code.toString(16) + ' ';
				} else if (code >= 0x80 || code == 0x2d || code == 0x5f || between(code, 0x30, 0x39) || between(code, 0x41, 0x5a) || between(code, 0x61, 0x7a)) {
					result += string[i];
				} else {
					result += '\\' + string[i];
				}
			}
			return result;
		}

		function escapeHash(string) {
			// Escapes the contents of "unrestricted"-type hash tokens.
			// Won't preserve the ID-ness of "id"-type hash tokens;
			// use escapeIdent() for that.
			string = '' + string;
			var result = '';
			for (var i = 0; i < string.length; i++) {
				var code = string.charCodeAt(i);
				if (code === 0x0) {
					throw new InvalidCharacterError('Invalid character: the input contains U+0000.');
				}

				if (code >= 0x80 || code == 0x2d || code == 0x5f || between(code, 0x30, 0x39) || between(code, 0x41, 0x5a) || between(code, 0x61, 0x7a)) {
					result += string[i];
				} else {
					result += '\\' + code.toString(16) + ' ';
				}
			}
			return result;
		}

		function escapeString(string) {
			string = '' + string;
			var result = '';
			for (var i = 0; i < string.length; i++) {
				var code = string.charCodeAt(i);

				if (code === 0x0) {
					throw new InvalidCharacterError('Invalid character: the input contains U+0000.');
				}

				if (between(code, 0x1, 0x1f) || code == 0x7f) {
					result += '\\' + code.toString(16) + ' ';
				} else if (code == 0x22 || code == 0x5c) {
					result += '\\' + string[i];
				} else {
					result += string[i];
				}
			}
			return result;
		}

		// Exportation.
		exports.tokenize = tokenize;
		exports.IdentToken = IdentToken;
		exports.FunctionToken = FunctionToken;
		exports.AtKeywordToken = AtKeywordToken;
		exports.HashToken = HashToken;
		exports.StringToken = StringToken;
		exports.BadStringToken = BadStringToken;
		exports.URLToken = URLToken;
		exports.BadURLToken = BadURLToken;
		exports.DelimToken = DelimToken;
		exports.NumberToken = NumberToken;
		exports.PercentageToken = PercentageToken;
		exports.DimensionToken = DimensionToken;
		exports.IncludeMatchToken = IncludeMatchToken;
		exports.DashMatchToken = DashMatchToken;
		exports.PrefixMatchToken = PrefixMatchToken;
		exports.SuffixMatchToken = SuffixMatchToken;
		exports.SubstringMatchToken = SubstringMatchToken;
		exports.ColumnToken = ColumnToken;
		exports.WhitespaceToken = WhitespaceToken;
		exports.CDOToken = CDOToken;
		exports.CDCToken = CDCToken;
		exports.ColonToken = ColonToken;
		exports.SemicolonToken = SemicolonToken;
		exports.CommaToken = CommaToken;
		exports.OpenParenToken = OpenParenToken;
		exports.CloseParenToken = CloseParenToken;
		exports.OpenSquareToken = OpenSquareToken;
		exports.CloseSquareToken = CloseSquareToken;
		exports.OpenCurlyToken = OpenCurlyToken;
		exports.CloseCurlyToken = CloseCurlyToken;
		exports.EOFToken = EOFToken;
		exports.CSSParserToken = CSSParserToken;
		exports.GroupingToken = GroupingToken;

		function TokenStream(tokens) {
			// Assume that tokens is a iterator.
			this.tokens = tokens;
			this.token = undefined;
			this.stored = [];
		}
		TokenStream.prototype.consume = function (num) {
			if (num === undefined) num = 1;
			while (num-- > 0) {
				if (this.stored.length > 0) {
					this.token = this.stored.shift();
				} else {
					var n = this.tokens.next();
					while (!n.done && n.value instanceof CommentToken) {
						n = this.tokens.next();
					}
					if (n.done) {
						this.token = new EOFToken();
						break;
					}
					this.token = n.value;
				}
			}
			//console.log(this.i, this.token);
			return true;
		};
		TokenStream.prototype.next = function () {
			if (this.stored.length === 0) {
				var n = this.tokens.next();
				while (!n.done && n.value instanceof CommentToken) {
					n = this.tokens.next();
				}
				if (n.done) return new EOFToken();
				this.stored.push(n.value);
			}
			return this.stored[0];
		};
		TokenStream.prototype.reconsume = function () {
			this.stored.unshift(this.token);
		};

		function parseerror(s, msg) {
			console.log("Parse error at token " + s.i + ": " + s.token + ".\n" + msg);
			return true;
		}
		function donothing() {
			return true;
		}

		function consumeAListOfRules(s, topLevel) {
			var rules = [];
			var rule;
			while (s.consume()) {
				if (s.token instanceof WhitespaceToken) {
					continue;
				} else if (s.token instanceof EOFToken) {
					return rules;
				} else if (s.token instanceof CDOToken || s.token instanceof CDCToken) {
					if (topLevel == "top-level") continue;
					s.reconsume();
					if (rule = consumeAQualifiedRule(s)) rules.push(rule);
				} else if (s.token instanceof AtKeywordToken) {
					s.reconsume();
					if (rule = consumeAnAtRule(s)) rules.push(rule);
				} else {
					s.reconsume();
					if (rule = consumeAQualifiedRule(s)) rules.push(rule);
				}
			}
		}

		function consumeAnAtRule(s) {
			s.consume();
			var rule = new AtRule(s.token.value);
			while (s.consume()) {
				if (s.token instanceof SemicolonToken || s.token instanceof EOFToken) {
					return rule;
				} else if (s.token instanceof OpenCurlyToken) {
					rule.value = consumeASimpleBlock(s);
					return rule;
				} else {
					s.reconsume();
					rule.prelude.push(consumeAComponentValue(s));
				}
			}
		}

		function consumeAQualifiedRule(s) {
			var rule = new QualifiedRule();
			while (s.consume()) {
				if (s.token instanceof EOFToken) {
					parseerror(s, "Hit EOF when trying to parse the prelude of a qualified rule.");
					return;
				} else if (s.token instanceof OpenCurlyToken) {
					rule.value = consumeASimpleBlock(s);
					return rule;
				} else {
					s.reconsume();
					rule.prelude.push(consumeAComponentValue(s));
				}
			}
		}

		function consumeAListOfDeclarations(s) {
			var decls = [];
			while (s.consume()) {
				if (s.token instanceof WhitespaceToken || s.token instanceof SemicolonToken) {
					donothing();
				} else if (s.token instanceof EOFToken) {
					return decls;
				} else if (s.token instanceof AtKeywordToken) {
					s.reconsume();
					decls.push(consumeAnAtRule(s));
				} else if (s.token instanceof IdentToken) {
					var temp = [s.token];
					while (!(s.next() instanceof SemicolonToken || s.next() instanceof EOFToken)) temp.push(consumeAComponentValue(s));
					var decl;
					if (decl = consumeADeclaration(new TokenStream(temp))) decls.push(decl);
				} else {
					parseerror(s);
					s.reconsume();
					while (!(s.next() instanceof SemicolonToken || s.next() instanceof EOFToken)) consumeAComponentValue(s);
				}
			}
		}

		function consumeADeclaration(s) {
			// Assumes that the next input token will be an ident token.
			s.consume();
			var decl = new Declaration(s.token.value);
			while (s.next() instanceof WhitespaceToken) s.consume();
			if (!(s.next() instanceof ColonToken)) {
				parseerror(s);
				return;
			} else {
				s.consume();
			}
			while (!(s.next() instanceof EOFToken)) {
				decl.value.push(consumeAComponentValue(s));
			}
			var foundImportant = false;
			for (var i = decl.value.length - 1; i >= 0; i--) {
				if (decl.value[i] instanceof WhitespaceToken) {
					continue;
				} else if (decl.value[i] instanceof IdentToken && decl.value[i].ASCIIMatch("important")) {
					foundImportant = true;
				} else if (foundImportant && decl.value[i] instanceof DelimToken && decl.value[i].value == "!") {
					decl.value.splice(i, decl.value.length);
					decl.important = true;
					break;
				} else {
					break;
				}
			}
			return decl;
		}

		function consumeAComponentValue(s) {
			s.consume();
			if (s.token instanceof OpenCurlyToken || s.token instanceof OpenSquareToken || s.token instanceof OpenParenToken) return consumeASimpleBlock(s);
			if (s.token instanceof FunctionToken) return consumeAFunction(s);
			return s.token;
		}

		function consumeASimpleBlock(s) {
			var mirror = s.token.mirror;
			var block = new SimpleBlock(s.token.value);
			block.startToken = s.token;
			while (s.consume()) {
				if (s.token instanceof EOFToken || s.token instanceof GroupingToken && s.token.value == mirror) return block;else {
					s.reconsume();
					block.value.push(consumeAComponentValue(s));
				}
			}
		}

		function consumeAFunction(s) {
			var func = new Func(s.token.value);
			while (s.consume()) {
				if (s.token instanceof EOFToken || s.token instanceof CloseParenToken) return func;else {
					s.reconsume();
					func.value.push(consumeAComponentValue(s));
				}
			}
		}

		function normalizeInput(input) {
			if (typeof input == "string") return new TokenStream(tokenize(input));
			if (input instanceof TokenStream) return input;
			if (typeof input.next == "function") return new TokenStream(input);
			if (input.length !== undefined) return new TokenStream(input[Symbol.iterator]());else throw SyntaxError(input);
		}

		function parseAStylesheet(s) {
			s = normalizeInput(s);
			var sheet = new Stylesheet();
			sheet.value = consumeAListOfRules(s, "top-level");
			return sheet;
		}

		function parseAListOfRules(s) {
			s = normalizeInput(s);
			return consumeAListOfRules(s);
		}

		function parseARule(s) {
			s = normalizeInput(s);
			while (s.next() instanceof WhitespaceToken) s.consume();
			if (s.next() instanceof EOFToken) throw SyntaxError();
			var rule;
			var startToken = s.next();
			if (startToken instanceof AtKeywordToken) {
				rule = consumeAnAtRule(s);
			} else {
				rule = consumeAQualifiedRule(s);
				if (!rule) throw SyntaxError();
			}
			rule.startToken = startToken;
			rule.endToken = s.token;
			return rule;
		}

		function parseADeclaration(s) {
			s = normalizeInput(s);
			while (s.next() instanceof WhitespaceToken) s.consume();
			if (!(s.next() instanceof IdentToken)) throw SyntaxError();
			var decl = consumeADeclaration(s);
			if (decl) return decl;else throw SyntaxError();
		}

		function parseAListOfDeclarations(s) {
			s = normalizeInput(s);
			return consumeAListOfDeclarations(s);
		}

		function parseAComponentValue(s) {
			s = normalizeInput(s);
			while (s.next() instanceof WhitespaceToken) s.consume();
			if (s.next() instanceof EOFToken) throw SyntaxError();
			var val = consumeAComponentValue(s);
			if (!val) throw SyntaxError();
			while (s.next() instanceof WhitespaceToken) s.consume();
			if (s.next() instanceof EOFToken) return val;
			throw SyntaxError();
		}

		function parseAListOfComponentValues(s) {
			s = normalizeInput(s);
			var vals = [];
			while (true) {
				var val = consumeAComponentValue(s);
				if (val instanceof EOFToken) return vals;else vals.push(val);
			}
		}

		function parseACommaSeparatedListOfComponentValues(s) {
			s = normalizeInput(s);
			var listOfCVLs = [];
			while (true) {
				var vals = [];
				while (true) {
					var val = consumeAComponentValue(s);
					if (val instanceof EOFToken) {
						listOfCVLs.push(vals);
						return listOfCVLs;
					} else if (val instanceof CommaToken) {
						listOfCVLs.push(vals);
						break;
					} else {
						vals.push(val);
					}
				}
			}
		}

		function CSSParserRule() {
			throw "Abstract Base Class";
		}
		CSSParserRule.prototype.toString = function (indent) {
			return JSON.stringify(this, null, indent);
		};
		CSSParserRule.prototype.toJSON = function () {
			return { type: this.type, value: this.value };
		};

		function Stylesheet() {
			this.value = [];
			return this;
		}
		Stylesheet.prototype = Object.create(CSSParserRule.prototype);
		Stylesheet.prototype.type = "STYLESHEET";

		function AtRule(name) {
			this.name = name;
			this.prelude = [];
			this.value = null;
			return this;
		}
		AtRule.prototype = Object.create(CSSParserRule.prototype);
		AtRule.prototype.type = "AT-RULE";
		AtRule.prototype.toJSON = function () {
			var json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
			json.name = this.name;
			json.prelude = this.prelude;
			return json;
		};

		function QualifiedRule() {
			this.prelude = [];
			this.value = [];
			return this;
		}
		QualifiedRule.prototype = Object.create(CSSParserRule.prototype);
		QualifiedRule.prototype.type = "QUALIFIED-RULE";
		QualifiedRule.prototype.toJSON = function () {
			var json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
			json.prelude = this.prelude;
			return json;
		};

		function Declaration(name) {
			this.name = name;
			this.value = [];
			this.important = false;
			return this;
		}
		Declaration.prototype = Object.create(CSSParserRule.prototype);
		Declaration.prototype.type = "DECLARATION";
		Declaration.prototype.toJSON = function () {
			var json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
			json.name = this.name;
			json.important = this.important;
			return json;
		};

		function SimpleBlock(type) {
			this.name = type;
			this.value = [];
			return this;
		}
		SimpleBlock.prototype = Object.create(CSSParserRule.prototype);
		SimpleBlock.prototype.type = "BLOCK";
		SimpleBlock.prototype.toJSON = function () {
			var json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
			json.name = this.name;
			return json;
		};

		function Func(name) {
			this.name = name;
			this.value = [];
			return this;
		}
		Func.prototype = Object.create(CSSParserRule.prototype);
		Func.prototype.type = "FUNCTION";
		Func.prototype.toJSON = function () {
			var json = this.constructor.prototype.constructor.prototype.toJSON.call(this);
			json.name = this.name;
			return json;
		};

		function CSSLexer(text) {
			this.stream = tokenize(text, {
				loc: true,
				offsets: true,
				keepComments: true
			});
			this.lineNumber = 0;
			this.columnNumber = 0;
			return this;
		}

		CSSLexer.prototype.performEOFFixup = function (input, preserveBackslash) {
			// Just lie for now.
			return "";
		};

		CSSLexer.prototype.nextToken = function () {
			if (!this.stream) {
				return null;
			}
			let v = this.stream.next();
			if (v.done || v.value.tokenType === "EOF") {
				this.stream = null;
				return null;
			}
			this.lineNumber = v.value.loc.start.line;
			this.columnNumber = v.value.loc.start.column;
			return v.value;
		};

		// Exportation.
		exports.CSSParserRule = CSSParserRule;
		exports.Stylesheet = Stylesheet;
		exports.AtRule = AtRule;
		exports.QualifiedRule = QualifiedRule;
		exports.Declaration = Declaration;
		exports.SimpleBlock = SimpleBlock;
		exports.Func = Func;
		exports.parseAStylesheet = parseAStylesheet;
		exports.parseAListOfRules = parseAListOfRules;
		exports.parseARule = parseARule;
		exports.parseADeclaration = parseADeclaration;
		exports.parseAListOfDeclarations = parseAListOfDeclarations;
		exports.parseAComponentValue = parseAComponentValue;
		exports.parseAListOfComponentValues = parseAListOfComponentValues;
		exports.parseACommaSeparatedListOfComponentValues = parseACommaSeparatedListOfComponentValues;
		exports.CSSLexer = CSSLexer;
	});

/***/ },
/* 4 */
/***/ function(module, exports) {

	"use strict";

	// auto-generated from nsColorNameList.h
	var cssColors = {
	  aliceblue: [240, 248, 255],
	  antiquewhite: [250, 235, 215],
	  aqua: [0, 255, 255],
	  aquamarine: [127, 255, 212],
	  azure: [240, 255, 255],
	  beige: [245, 245, 220],
	  bisque: [255, 228, 196],
	  black: [0, 0, 0],
	  blanchedalmond: [255, 235, 205],
	  blue: [0, 0, 255],
	  blueviolet: [138, 43, 226],
	  brown: [165, 42, 42],
	  burlywood: [222, 184, 135],
	  cadetblue: [95, 158, 160],
	  chartreuse: [127, 255, 0],
	  chocolate: [210, 105, 30],
	  coral: [255, 127, 80],
	  cornflowerblue: [100, 149, 237],
	  cornsilk: [255, 248, 220],
	  crimson: [220, 20, 60],
	  cyan: [0, 255, 255],
	  darkblue: [0, 0, 139],
	  darkcyan: [0, 139, 139],
	  darkgoldenrod: [184, 134, 11],
	  darkgray: [169, 169, 169],
	  darkgreen: [0, 100, 0],
	  darkgrey: [169, 169, 169],
	  darkkhaki: [189, 183, 107],
	  darkmagenta: [139, 0, 139],
	  darkolivegreen: [85, 107, 47],
	  darkorange: [255, 140, 0],
	  darkorchid: [153, 50, 204],
	  darkred: [139, 0, 0],
	  darksalmon: [233, 150, 122],
	  darkseagreen: [143, 188, 143],
	  darkslateblue: [72, 61, 139],
	  darkslategray: [47, 79, 79],
	  darkslategrey: [47, 79, 79],
	  darkturquoise: [0, 206, 209],
	  darkviolet: [148, 0, 211],
	  deeppink: [255, 20, 147],
	  deepskyblue: [0, 191, 255],
	  dimgray: [105, 105, 105],
	  dimgrey: [105, 105, 105],
	  dodgerblue: [30, 144, 255],
	  firebrick: [178, 34, 34],
	  floralwhite: [255, 250, 240],
	  forestgreen: [34, 139, 34],
	  fuchsia: [255, 0, 255],
	  gainsboro: [220, 220, 220],
	  ghostwhite: [248, 248, 255],
	  gold: [255, 215, 0],
	  goldenrod: [218, 165, 32],
	  gray: [128, 128, 128],
	  grey: [128, 128, 128],
	  green: [0, 128, 0],
	  greenyellow: [173, 255, 47],
	  honeydew: [240, 255, 240],
	  hotpink: [255, 105, 180],
	  indianred: [205, 92, 92],
	  indigo: [75, 0, 130],
	  ivory: [255, 255, 240],
	  khaki: [240, 230, 140],
	  lavender: [230, 230, 250],
	  lavenderblush: [255, 240, 245],
	  lawngreen: [124, 252, 0],
	  lemonchiffon: [255, 250, 205],
	  lightblue: [173, 216, 230],
	  lightcoral: [240, 128, 128],
	  lightcyan: [224, 255, 255],
	  lightgoldenrodyellow: [250, 250, 210],
	  lightgray: [211, 211, 211],
	  lightgreen: [144, 238, 144],
	  lightgrey: [211, 211, 211],
	  lightpink: [255, 182, 193],
	  lightsalmon: [255, 160, 122],
	  lightseagreen: [32, 178, 170],
	  lightskyblue: [135, 206, 250],
	  lightslategray: [119, 136, 153],
	  lightslategrey: [119, 136, 153],
	  lightsteelblue: [176, 196, 222],
	  lightyellow: [255, 255, 224],
	  lime: [0, 255, 0],
	  limegreen: [50, 205, 50],
	  linen: [250, 240, 230],
	  magenta: [255, 0, 255],
	  maroon: [128, 0, 0],
	  mediumaquamarine: [102, 205, 170],
	  mediumblue: [0, 0, 205],
	  mediumorchid: [186, 85, 211],
	  mediumpurple: [147, 112, 219],
	  mediumseagreen: [60, 179, 113],
	  mediumslateblue: [123, 104, 238],
	  mediumspringgreen: [0, 250, 154],
	  mediumturquoise: [72, 209, 204],
	  mediumvioletred: [199, 21, 133],
	  midnightblue: [25, 25, 112],
	  mintcream: [245, 255, 250],
	  mistyrose: [255, 228, 225],
	  moccasin: [255, 228, 181],
	  navajowhite: [255, 222, 173],
	  navy: [0, 0, 128],
	  oldlace: [253, 245, 230],
	  olive: [128, 128, 0],
	  olivedrab: [107, 142, 35],
	  orange: [255, 165, 0],
	  orangered: [255, 69, 0],
	  orchid: [218, 112, 214],
	  palegoldenrod: [238, 232, 170],
	  palegreen: [152, 251, 152],
	  paleturquoise: [175, 238, 238],
	  palevioletred: [219, 112, 147],
	  papayawhip: [255, 239, 213],
	  peachpuff: [255, 218, 185],
	  peru: [205, 133, 63],
	  pink: [255, 192, 203],
	  plum: [221, 160, 221],
	  powderblue: [176, 224, 230],
	  purple: [128, 0, 128],
	  rebeccapurple: [102, 51, 153],
	  red: [255, 0, 0],
	  rosybrown: [188, 143, 143],
	  royalblue: [65, 105, 225],
	  saddlebrown: [139, 69, 19],
	  salmon: [250, 128, 114],
	  sandybrown: [244, 164, 96],
	  seagreen: [46, 139, 87],
	  seashell: [255, 245, 238],
	  sienna: [160, 82, 45],
	  silver: [192, 192, 192],
	  skyblue: [135, 206, 235],
	  slateblue: [106, 90, 205],
	  slategray: [112, 128, 144],
	  slategrey: [112, 128, 144],
	  snow: [255, 250, 250],
	  springgreen: [0, 255, 127],
	  steelblue: [70, 130, 180],
	  tan: [210, 180, 140],
	  teal: [0, 128, 128],
	  thistle: [216, 191, 216],
	  tomato: [255, 99, 71],
	  turquoise: [64, 224, 208],
	  violet: [238, 130, 238],
	  wheat: [245, 222, 179],
	  white: [255, 255, 255],
	  whitesmoke: [245, 245, 245],
	  yellow: [255, 255, 0],
	  yellowgreen: [154, 205, 50]
	};
	module.exports = { cssColors };

/***/ },
/* 5 */
/***/ function(module, exports) {

	"use strict"; // auto-generated by means you would rather not know
	var cssProperties={"-moz-appearance":{inherited:false,supports:0,values:["-moz-gtk-info-bar","-moz-mac-disclosure-button-closed","-moz-mac-disclosure-button-open","-moz-mac-fullscreen-button","-moz-mac-help-button","-moz-mac-vibrancy-dark","-moz-mac-vibrancy-light","-moz-win-borderless-glass","-moz-win-browsertabbar-toolbox","-moz-win-communications-toolbox","-moz-win-exclude-glass","-moz-win-glass","-moz-win-media-toolbox","-moz-window-button-box","-moz-window-button-box-maximized","-moz-window-button-close","-moz-window-button-maximize","-moz-window-button-minimize","-moz-window-button-restore","-moz-window-frame-bottom","-moz-window-frame-left","-moz-window-frame-right","-moz-window-titlebar","-moz-window-titlebar-maximized","button","button-arrow-down","button-arrow-next","button-arrow-previous","button-arrow-up","button-bevel","button-focus","caret","checkbox","checkbox-container","checkbox-label","checkmenuitem","dialog","dualbutton","groupbox","inherit","initial","listbox","listitem","menuarrow","menubar","menucheckbox","menuimage","menuitem","menuitemtext","menulist","menulist-button","menulist-text","menulist-textfield","menupopup","menuradio","menuseparator","meterbar","meterchunk","none","number-input","progressbar","progressbar-vertical","progresschunk","progresschunk-vertical","radio","radio-container","radio-label","radiomenuitem","range","range-thumb","resizer","resizerpanel","scale-horizontal","scale-vertical","scalethumb-horizontal","scalethumb-vertical","scalethumbend","scalethumbstart","scalethumbtick","scrollbar","scrollbar-small","scrollbarbutton-down","scrollbarbutton-left","scrollbarbutton-right","scrollbarbutton-up","scrollbarthumb-horizontal","scrollbarthumb-vertical","scrollbartrack-horizontal","scrollbartrack-vertical","searchfield","separator","spinner","spinner-downbutton","spinner-textfield","spinner-upbutton","splitter","statusbar","statusbarpanel","tab","tab-scroll-arrow-back","tab-scroll-arrow-forward","tabpanel","tabpanels","textfield","textfield-multiline","toolbar","toolbarbutton","toolbarbutton-dropdown","toolbargripper","toolbox","tooltip","treeheader","treeheadercell","treeheadersortarrow","treeitem","treeline","treetwisty","treetwistyopen","treeview","unset","window"]},"-moz-outline-radius-topleft":{inherited:false,supports:3,values:["inherit","initial","unset"]},"-moz-outline-radius-topright":{inherited:false,supports:3,values:["inherit","initial","unset"]},"-moz-outline-radius-bottomright":{inherited:false,supports:3,values:["inherit","initial","unset"]},"-moz-outline-radius-bottomleft":{inherited:false,supports:3,values:["inherit","initial","unset"]},"-moz-tab-size":{inherited:true,supports:1024,values:["inherit","initial","unset"]},"animation-delay":{inherited:false,supports:64,values:["inherit","initial","unset"]},"animation-direction":{inherited:false,supports:0,values:["alternate","alternate-reverse","inherit","initial","normal","reverse","unset"]},"animation-duration":{inherited:false,supports:64,values:["inherit","initial","unset"]},"animation-fill-mode":{inherited:false,supports:0,values:["backwards","both","forwards","inherit","initial","none","unset"]},"animation-iteration-count":{inherited:false,supports:1024,values:["infinite","inherit","initial","unset"]},"animation-name":{inherited:false,supports:0,values:["inherit","initial","none","unset"]},"animation-play-state":{inherited:false,supports:0,values:["inherit","initial","paused","running","unset"]},"animation-timing-function":{inherited:false,supports:256,values:["cubic-bezier","ease","ease-in","ease-in-out","ease-out","inherit","initial","linear","step-end","step-start","steps","unset"]},"background-attachment":{inherited:false,supports:0,values:["fixed","inherit","initial","local","scroll","unset"]},"background-clip":{inherited:false,supports:0,values:["border-box","content-box","inherit","initial","padding-box","unset"]},"background-color":{inherited:false,supports:4,values:["aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"background-image":{inherited:false,supports:648,values:["-moz-element","-moz-image-rect","-moz-linear-gradient","-moz-radial-gradient","-moz-repeating-linear-gradient","-moz-repeating-radial-gradient","inherit","initial","linear-gradient","none","radial-gradient","repeating-linear-gradient","repeating-radial-gradient","unset","url"]},"background-blend-mode":{inherited:false,supports:0,values:["color","color-burn","color-dodge","darken","difference","exclusion","hard-light","hue","inherit","initial","lighten","luminosity","multiply","normal","overlay","saturation","screen","soft-light","unset"]},"background-origin":{inherited:false,supports:0,values:["border-box","content-box","inherit","initial","padding-box","unset"]},"background-position":{inherited:false,supports:3,values:["inherit","initial","unset"]},"background-repeat":{inherited:false,supports:0,values:["inherit","initial","no-repeat","repeat","repeat-x","repeat-y","unset"]},"background-size":{inherited:false,supports:3,values:["inherit","initial","unset"]},"-moz-binding":{inherited:false,supports:8,values:["inherit","initial","none","unset","url"]},"block-size":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"border-block-end-color":{inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-block-end-style":{inherited:false,supports:0,values:["dashed","dotted","double","groove","hidden","inherit","initial","inset","none","outset","ridge","solid","unset"]},"border-block-end-width":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","medium","thick","thin","unset"]},"border-block-start-color":{inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-block-start-style":{inherited:false,supports:0,values:["dashed","dotted","double","groove","hidden","inherit","initial","inset","none","outset","ridge","solid","unset"]},"border-block-start-width":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","medium","thick","thin","unset"]},"border-bottom-color":{inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"-moz-border-bottom-colors":{inherited:false,supports:4,values:["inherit","initial","unset"]},"border-bottom-style":{inherited:false,supports:0,values:["dashed","dotted","double","groove","hidden","inherit","initial","inset","none","outset","ridge","solid","unset"]},"border-bottom-width":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","medium","thick","thin","unset"]},"border-collapse":{inherited:true,supports:0,values:["collapse","inherit","initial","separate","unset"]},"border-image-source":{inherited:false,supports:648,values:["-moz-element","-moz-image-rect","-moz-linear-gradient","-moz-radial-gradient","-moz-repeating-linear-gradient","-moz-repeating-radial-gradient","inherit","initial","linear-gradient","none","radial-gradient","repeating-linear-gradient","repeating-radial-gradient","unset","url"]},"border-image-slice":{inherited:false,supports:1026,values:["inherit","initial","unset"]},"border-image-width":{inherited:false,supports:1027,values:["inherit","initial","unset"]},"border-image-outset":{inherited:false,supports:1025,values:["inherit","initial","unset"]},"border-image-repeat":{inherited:false,supports:0,values:["inherit","initial","unset"]},"border-inline-end-color":{inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-inline-end-style":{inherited:false,supports:0,values:["dashed","dotted","double","groove","hidden","inherit","initial","inset","none","outset","ridge","solid","unset"]},"border-inline-end-width":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","medium","thick","thin","unset"]},"border-inline-start-color":{inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-inline-start-style":{inherited:false,supports:0,values:["dashed","dotted","double","groove","hidden","inherit","initial","inset","none","outset","ridge","solid","unset"]},"border-inline-start-width":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","medium","thick","thin","unset"]},"border-left-color":{inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"-moz-border-left-colors":{inherited:false,supports:4,values:["inherit","initial","unset"]},"border-left-style":{inherited:false,supports:0,values:["dashed","dotted","double","groove","hidden","inherit","initial","inset","none","outset","ridge","solid","unset"]},"border-left-width":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","medium","thick","thin","unset"]},"border-right-color":{inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"-moz-border-right-colors":{inherited:false,supports:4,values:["inherit","initial","unset"]},"border-right-style":{inherited:false,supports:0,values:["dashed","dotted","double","groove","hidden","inherit","initial","inset","none","outset","ridge","solid","unset"]},"border-right-width":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","medium","thick","thin","unset"]},"border-spacing":{inherited:true,supports:1,values:["inherit","initial","unset"]},"border-top-color":{inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"-moz-border-top-colors":{inherited:false,supports:4,values:["inherit","initial","unset"]},"border-top-style":{inherited:false,supports:0,values:["dashed","dotted","double","groove","hidden","inherit","initial","inset","none","outset","ridge","solid","unset"]},"border-top-width":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","medium","thick","thin","unset"]},"border-top-left-radius":{inherited:false,supports:3,values:["inherit","initial","unset"]},"border-top-right-radius":{inherited:false,supports:3,values:["inherit","initial","unset"]},"border-bottom-right-radius":{inherited:false,supports:3,values:["inherit","initial","unset"]},"border-bottom-left-radius":{inherited:false,supports:3,values:["inherit","initial","unset"]},"bottom":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"box-decoration-break":{inherited:false,supports:0,values:["clone","inherit","initial","slice","unset"]},"box-shadow":{inherited:false,supports:5,values:["inherit","initial","unset"]},"box-sizing":{inherited:false,supports:0,values:["border-box","content-box","inherit","initial","padding-box","unset"]},"caption-side":{inherited:true,supports:0,values:["bottom","bottom-outside","inherit","initial","left","right","top","top-outside","unset"]},"clear":{inherited:false,supports:0,values:["both","inherit","initial","inline-end","inline-start","left","none","right","unset"]},"clip":{inherited:false,supports:0,values:["inherit","initial","unset"]},"color":{inherited:true,supports:4,values:["aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"-moz-column-count":{inherited:false,supports:1024,values:["auto","inherit","initial","unset"]},"-moz-column-fill":{inherited:false,supports:0,values:["auto","balance","inherit","initial","unset"]},"-moz-column-width":{inherited:false,supports:1,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"-moz-column-gap":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","normal","unset"]},"-moz-column-rule-color":{inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"-moz-column-rule-style":{inherited:false,supports:0,values:["dashed","dotted","double","groove","hidden","inherit","initial","inset","none","outset","ridge","solid","unset"]},"-moz-column-rule-width":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","medium","thick","thin","unset"]},"contain":{inherited:false,supports:0,values:["inherit","initial","layout","none","paint","strict","style","unset"]},"content":{inherited:false,supports:8,values:["inherit","initial","unset"]},"-moz-control-character-visibility":{inherited:true,supports:0,values:["hidden","inherit","initial","unset","visible"]},"counter-increment":{inherited:false,supports:0,values:["inherit","initial","unset"]},"counter-reset":{inherited:false,supports:0,values:["inherit","initial","unset"]},"cursor":{inherited:true,supports:8,values:["inherit","initial","unset"]},"direction":{inherited:true,supports:0,values:["inherit","initial","ltr","rtl","unset"]},"display":{inherited:false,supports:0,values:["-moz-box","-moz-deck","-moz-grid","-moz-grid-group","-moz-grid-line","-moz-groupbox","-moz-inline-box","-moz-inline-grid","-moz-inline-stack","-moz-popup","-moz-stack","block","contents","flex","grid","inherit","initial","inline","inline-block","inline-flex","inline-grid","inline-table","list-item","none","ruby","ruby-base","ruby-base-container","ruby-text","ruby-text-container","table","table-caption","table-cell","table-column","table-column-group","table-footer-group","table-header-group","table-row","table-row-group","unset"]},"empty-cells":{inherited:true,supports:0,values:["hide","inherit","initial","show","unset"]},"align-content":{inherited:false,supports:0,values:["inherit","initial","unset"]},"align-items":{inherited:false,supports:0,values:["inherit","initial","unset"]},"align-self":{inherited:false,supports:0,values:["inherit","initial","unset"]},"flex-basis":{inherited:false,supports:3,values:["-moz-available","-moz-calc","-moz-fit-content","-moz-max-content","-moz-min-content","auto","calc","inherit","initial","unset"]},"flex-direction":{inherited:false,supports:0,values:["column","column-reverse","inherit","initial","row","row-reverse","unset"]},"flex-grow":{inherited:false,supports:1024,values:["inherit","initial","unset"]},"flex-shrink":{inherited:false,supports:1024,values:["inherit","initial","unset"]},"flex-wrap":{inherited:false,supports:0,values:["inherit","initial","nowrap","unset","wrap","wrap-reverse"]},"order":{inherited:false,supports:1024,values:["inherit","initial","unset"]},"justify-content":{inherited:false,supports:0,values:["inherit","initial","unset"]},"justify-items":{inherited:false,supports:0,values:["inherit","initial","unset"]},"justify-self":{inherited:false,supports:0,values:["inherit","initial","unset"]},"float":{inherited:false,supports:0,values:["inherit","initial","inline-end","inline-start","left","none","right","unset"]},"-moz-float-edge":{inherited:false,supports:0,values:["content-box","inherit","initial","margin-box","unset"]},"font-family":{inherited:true,supports:0,values:["inherit","initial","unset"]},"font-feature-settings":{inherited:true,supports:0,values:["inherit","initial","unset"]},"font-kerning":{inherited:true,supports:0,values:["auto","inherit","initial","none","normal","unset"]},"font-language-override":{inherited:true,supports:0,values:["inherit","initial","normal","unset"]},"font-size":{inherited:true,supports:3,values:["-moz-calc","calc","inherit","initial","large","larger","medium","small","smaller","unset","x-large","x-small","xx-large","xx-small"]},"font-size-adjust":{inherited:true,supports:1024,values:["inherit","initial","none","unset"]},"font-stretch":{inherited:true,supports:0,values:["condensed","expanded","extra-condensed","extra-expanded","inherit","initial","normal","semi-condensed","semi-expanded","ultra-condensed","ultra-expanded","unset"]},"font-style":{inherited:true,supports:0,values:["inherit","initial","italic","normal","oblique","unset"]},"font-synthesis":{inherited:true,supports:0,values:["inherit","initial","unset"]},"font-variant-alternates":{inherited:true,supports:0,values:["inherit","initial","unset"]},"font-variant-caps":{inherited:true,supports:0,values:["all-petite-caps","all-small-caps","inherit","initial","normal","petite-caps","small-caps","titling-caps","unicase","unset"]},"font-variant-east-asian":{inherited:true,supports:0,values:["inherit","initial","unset"]},"font-variant-ligatures":{inherited:true,supports:0,values:["inherit","initial","unset"]},"font-variant-numeric":{inherited:true,supports:0,values:["inherit","initial","unset"]},"font-variant-position":{inherited:true,supports:0,values:["inherit","initial","normal","sub","super","unset"]},"font-weight":{inherited:true,supports:1024,values:["inherit","initial","unset"]},"-moz-force-broken-image-icon":{inherited:false,supports:1024,values:["inherit","initial","unset"]},"grid-auto-flow":{inherited:false,supports:0,values:["inherit","initial","unset"]},"grid-auto-columns":{inherited:false,supports:3,values:["inherit","initial","unset"]},"grid-auto-rows":{inherited:false,supports:3,values:["inherit","initial","unset"]},"grid-template-areas":{inherited:false,supports:0,values:["inherit","initial","unset"]},"grid-template-columns":{inherited:false,supports:3,values:["inherit","initial","unset"]},"grid-template-rows":{inherited:false,supports:3,values:["inherit","initial","unset"]},"grid-column-start":{inherited:false,supports:1024,values:["inherit","initial","unset"]},"grid-column-end":{inherited:false,supports:1024,values:["inherit","initial","unset"]},"grid-row-start":{inherited:false,supports:1024,values:["inherit","initial","unset"]},"grid-row-end":{inherited:false,supports:1024,values:["inherit","initial","unset"]},"grid-column-gap":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","unset"]},"grid-row-gap":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","unset"]},"height":{inherited:false,supports:3,values:["-moz-available","-moz-calc","-moz-fit-content","-moz-max-content","-moz-min-content","auto","calc","inherit","initial","unset"]},"image-orientation":{inherited:true,supports:16,values:["inherit","initial","unset"]},"-moz-image-region":{inherited:true,supports:0,values:["inherit","initial","unset"]},"ime-mode":{inherited:false,supports:0,values:["active","auto","disabled","inactive","inherit","initial","normal","unset"]},"inline-size":{inherited:false,supports:3,values:["-moz-available","-moz-calc","-moz-fit-content","-moz-max-content","-moz-min-content","auto","calc","inherit","initial","unset"]},"left":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"letter-spacing":{inherited:true,supports:1,values:["-moz-calc","calc","inherit","initial","normal","unset"]},"line-height":{inherited:true,supports:1027,values:["-moz-block-height","inherit","initial","normal","unset"]},"list-style-image":{inherited:true,supports:8,values:["inherit","initial","none","unset","url"]},"list-style-position":{inherited:true,supports:0,values:["inherit","initial","inside","outside","unset"]},"list-style-type":{inherited:true,supports:0,values:["inherit","initial","unset"]},"margin-block-end":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"margin-block-start":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"margin-bottom":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"margin-inline-end":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"margin-inline-start":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"margin-left":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"margin-right":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"margin-top":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"marker-offset":{inherited:false,supports:1,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"max-block-size":{inherited:false,supports:3,values:["-moz-calc","calc","inherit","initial","none","unset"]},"max-height":{inherited:false,supports:3,values:["-moz-available","-moz-calc","-moz-fit-content","-moz-max-content","-moz-min-content","calc","inherit","initial","none","unset"]},"max-inline-size":{inherited:false,supports:3,values:["-moz-available","-moz-calc","-moz-fit-content","-moz-max-content","-moz-min-content","calc","inherit","initial","none","unset"]},"max-width":{inherited:false,supports:3,values:["-moz-available","-moz-calc","-moz-fit-content","-moz-max-content","-moz-min-content","calc","inherit","initial","none","unset"]},"min-height":{inherited:false,supports:3,values:["-moz-available","-moz-calc","-moz-fit-content","-moz-max-content","-moz-min-content","auto","calc","inherit","initial","unset"]},"min-block-size":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"min-inline-size":{inherited:false,supports:3,values:["-moz-available","-moz-calc","-moz-fit-content","-moz-max-content","-moz-min-content","auto","calc","inherit","initial","unset"]},"min-width":{inherited:false,supports:3,values:["-moz-available","-moz-calc","-moz-fit-content","-moz-max-content","-moz-min-content","auto","calc","inherit","initial","unset"]},"mix-blend-mode":{inherited:false,supports:0,values:["color","color-burn","color-dodge","darken","difference","exclusion","hard-light","hue","inherit","initial","lighten","luminosity","multiply","normal","overlay","saturation","screen","soft-light","unset"]},"isolation":{inherited:false,supports:0,values:["auto","inherit","initial","isolate","unset"]},"object-fit":{inherited:false,supports:0,values:["contain","cover","fill","inherit","initial","none","scale-down","unset"]},"object-position":{inherited:false,supports:3,values:["inherit","initial","unset"]},"offset-block-end":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"offset-block-start":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"offset-inline-end":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"offset-inline-start":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"opacity":{inherited:false,supports:1024,values:["inherit","initial","unset"]},"-moz-orient":{inherited:false,supports:0,values:["block","horizontal","inherit","initial","inline","unset","vertical"]},"outline-color":{inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"outline-style":{inherited:false,supports:0,values:["auto","dashed","dotted","double","groove","inherit","initial","inset","none","outset","ridge","solid","unset"]},"outline-width":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","medium","thick","thin","unset"]},"outline-offset":{inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","unset"]},"overflow-x":{inherited:false,supports:0,values:["-moz-hidden-unscrollable","auto","hidden","inherit","initial","scroll","unset","visible"]},"overflow-y":{inherited:false,supports:0,values:["-moz-hidden-unscrollable","auto","hidden","inherit","initial","scroll","unset","visible"]},"padding-block-end":{inherited:false,supports:3,values:["-moz-calc","calc","inherit","initial","unset"]},"padding-block-start":{inherited:false,supports:3,values:["-moz-calc","calc","inherit","initial","unset"]},"padding-bottom":{inherited:false,supports:3,values:["-moz-calc","calc","inherit","initial","unset"]},"padding-inline-end":{inherited:false,supports:3,values:["-moz-calc","calc","inherit","initial","unset"]},"padding-inline-start":{inherited:false,supports:3,values:["-moz-calc","calc","inherit","initial","unset"]},"padding-left":{inherited:false,supports:3,values:["-moz-calc","calc","inherit","initial","unset"]},"padding-right":{inherited:false,supports:3,values:["-moz-calc","calc","inherit","initial","unset"]},"padding-top":{inherited:false,supports:3,values:["-moz-calc","calc","inherit","initial","unset"]},"page-break-after":{inherited:false,supports:0,values:["always","auto","avoid","inherit","initial","left","right","unset"]},"page-break-before":{inherited:false,supports:0,values:["always","auto","avoid","inherit","initial","left","right","unset"]},"page-break-inside":{inherited:false,supports:0,values:["auto","avoid","inherit","initial","unset"]},"paint-order":{inherited:true,supports:0,values:["inherit","initial","unset"]},"pointer-events":{inherited:true,supports:0,values:["all","auto","fill","inherit","initial","none","painted","stroke","unset","visible","visiblefill","visiblepainted","visiblestroke"]},"position":{inherited:false,supports:0,values:["absolute","fixed","inherit","initial","relative","static","sticky","unset"]},"quotes":{inherited:true,supports:0,values:["inherit","initial","unset"]},"resize":{inherited:false,supports:0,values:["both","horizontal","inherit","initial","none","unset","vertical"]},"right":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"ruby-align":{inherited:true,supports:0,values:["center","inherit","initial","space-around","space-between","start","unset"]},"ruby-position":{inherited:true,supports:0,values:["inherit","initial","over","under","unset"]},"scroll-behavior":{inherited:false,supports:0,values:["auto","inherit","initial","smooth","unset"]},"scroll-snap-coordinate":{inherited:false,supports:3,values:["inherit","initial","unset"]},"scroll-snap-destination":{inherited:false,supports:3,values:["inherit","initial","unset"]},"scroll-snap-points-x":{inherited:false,supports:0,values:["inherit","initial","unset"]},"scroll-snap-points-y":{inherited:false,supports:0,values:["inherit","initial","unset"]},"scroll-snap-type-x":{inherited:false,supports:0,values:["inherit","initial","mandatory","none","proximity","unset"]},"scroll-snap-type-y":{inherited:false,supports:0,values:["inherit","initial","mandatory","none","proximity","unset"]},"table-layout":{inherited:false,supports:0,values:["auto","fixed","inherit","initial","unset"]},"text-align":{inherited:true,supports:0,values:["-moz-center","-moz-left","-moz-right","center","end","inherit","initial","justify","left","right","start","unset"]},"-moz-text-align-last":{inherited:true,supports:0,values:["auto","center","end","inherit","initial","justify","left","right","start","unset"]},"text-decoration-color":{inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"text-decoration-line":{inherited:false,supports:0,values:["inherit","initial","unset"]},"text-decoration-style":{inherited:false,supports:0,values:["-moz-none","dashed","dotted","double","inherit","initial","solid","unset","wavy"]},"text-indent":{inherited:true,supports:3,values:["-moz-calc","calc","inherit","initial","unset"]},"text-orientation":{inherited:true,supports:0,values:["inherit","initial","mixed","sideways","sideways-right","unset","upright"]},"text-overflow":{inherited:false,supports:0,values:["inherit","initial","unset"]},"text-shadow":{inherited:true,supports:5,values:["inherit","initial","unset"]},"-moz-text-size-adjust":{inherited:true,supports:0,values:["auto","inherit","initial","none","unset"]},"text-transform":{inherited:true,supports:0,values:["capitalize","full-width","inherit","initial","lowercase","none","unset","uppercase"]},"transform":{inherited:false,supports:0,values:["inherit","initial","unset"]},"transform-box":{inherited:false,supports:0,values:["border-box","fill-box","inherit","initial","unset","view-box"]},"transform-origin":{inherited:false,supports:3,values:["inherit","initial","unset"]},"perspective-origin":{inherited:false,supports:3,values:["inherit","initial","unset"]},"perspective":{inherited:false,supports:1,values:["inherit","initial","none","unset"]},"transform-style":{inherited:false,supports:0,values:["flat","inherit","initial","preserve-3d","unset"]},"backface-visibility":{inherited:false,supports:0,values:["hidden","inherit","initial","unset","visible"]},"top":{inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"transition-delay":{inherited:false,supports:64,values:["inherit","initial","unset"]},"transition-duration":{inherited:false,supports:64,values:["inherit","initial","unset"]},"transition-property":{inherited:false,supports:0,values:["all","inherit","initial","none","unset"]},"transition-timing-function":{inherited:false,supports:256,values:["cubic-bezier","ease","ease-in","ease-in-out","ease-out","inherit","initial","linear","step-end","step-start","steps","unset"]},"unicode-bidi":{inherited:false,supports:0,values:["-moz-isolate","-moz-isolate-override","-moz-plaintext","bidi-override","embed","inherit","initial","normal","unset"]},"-moz-user-focus":{inherited:true,supports:0,values:["ignore","inherit","initial","none","normal","select-after","select-all","select-before","select-menu","select-same","unset"]},"-moz-user-input":{inherited:true,supports:0,values:["auto","disabled","enabled","inherit","initial","none","unset"]},"-moz-user-modify":{inherited:true,supports:0,values:["inherit","initial","read-only","read-write","unset","write-only"]},"-moz-user-select":{inherited:false,supports:0,values:["-moz-all","-moz-none","-moz-text","all","auto","element","elements","inherit","initial","none","text","toggle","tri-state","unset"]},"vertical-align":{inherited:false,supports:3,values:["-moz-calc","-moz-middle-with-baseline","baseline","bottom","calc","inherit","initial","middle","sub","super","text-bottom","text-top","top","unset"]},"visibility":{inherited:true,supports:0,values:["collapse","hidden","inherit","initial","unset","visible"]},"white-space":{inherited:true,supports:0,values:["-moz-pre-space","inherit","initial","normal","nowrap","pre","pre-line","pre-wrap","unset"]},"width":{inherited:false,supports:3,values:["-moz-available","-moz-calc","-moz-fit-content","-moz-max-content","-moz-min-content","auto","calc","inherit","initial","unset"]},"-moz-window-dragging":{inherited:true,supports:0,values:["drag","inherit","initial","no-drag","unset"]},"word-break":{inherited:true,supports:0,values:["break-all","inherit","initial","keep-all","normal","unset"]},"word-spacing":{inherited:true,supports:3,values:["-moz-calc","calc","inherit","initial","normal","unset"]},"word-wrap":{inherited:true,supports:0,values:["break-word","inherit","initial","normal","unset"]},"hyphens":{inherited:true,supports:0,values:["auto","inherit","initial","manual","none","unset"]},"writing-mode":{inherited:true,supports:0,values:["horizontal-tb","inherit","initial","lr","lr-tb","rl","rl-tb","sideways-lr","sideways-rl","tb","tb-rl","unset","vertical-lr","vertical-rl"]},"z-index":{inherited:false,supports:1024,values:["auto","inherit","initial","unset"]},"-moz-box-align":{inherited:false,supports:0,values:["baseline","center","end","inherit","initial","start","stretch","unset"]},"-moz-box-direction":{inherited:false,supports:0,values:["inherit","initial","normal","reverse","unset"]},"-moz-box-flex":{inherited:false,supports:1024,values:["inherit","initial","unset"]},"-moz-box-orient":{inherited:false,supports:0,values:["block-axis","horizontal","inherit","initial","inline-axis","unset","vertical"]},"-moz-box-pack":{inherited:false,supports:0,values:["center","end","inherit","initial","justify","start","unset"]},"-moz-box-ordinal-group":{inherited:false,supports:1024,values:["inherit","initial","unset"]},"-moz-stack-sizing":{inherited:false,supports:0,values:["ignore","inherit","initial","stretch-to-fit","unset"]},"clip-path":{inherited:false,supports:8,values:["inherit","initial","unset"]},"clip-rule":{inherited:true,supports:0,values:["evenodd","inherit","initial","nonzero","unset"]},"color-interpolation":{inherited:true,supports:0,values:["auto","inherit","initial","linearrgb","srgb","unset"]},"color-interpolation-filters":{inherited:true,supports:0,values:["auto","inherit","initial","linearrgb","srgb","unset"]},"dominant-baseline":{inherited:false,supports:0,values:["alphabetic","auto","central","hanging","ideographic","inherit","initial","mathematical","middle","no-change","reset-size","text-after-edge","text-before-edge","unset","use-script"]},"fill":{inherited:true,supports:12,values:["inherit","initial","unset"]},"fill-opacity":{inherited:true,supports:1024,values:["inherit","initial","unset"]},"fill-rule":{inherited:true,supports:0,values:["evenodd","inherit","initial","nonzero","unset"]},"filter":{inherited:false,supports:8,values:["inherit","initial","unset"]},"flood-color":{inherited:false,supports:4,values:["aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"flood-opacity":{inherited:false,supports:1024,values:["inherit","initial","unset"]},"image-rendering":{inherited:true,supports:0,values:["-moz-crisp-edges","auto","inherit","initial","optimizequality","optimizespeed","unset"]},"lighting-color":{inherited:false,supports:4,values:["aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"marker-end":{inherited:true,supports:8,values:["inherit","initial","none","unset","url"]},"marker-mid":{inherited:true,supports:8,values:["inherit","initial","none","unset","url"]},"marker-start":{inherited:true,supports:8,values:["inherit","initial","none","unset","url"]},"mask":{inherited:false,supports:8,values:["inherit","initial","none","unset","url"]},"mask-type":{inherited:false,supports:0,values:["alpha","inherit","initial","luminance","unset"]},"shape-rendering":{inherited:true,supports:0,values:["auto","crispedges","geometricprecision","inherit","initial","optimizespeed","unset"]},"stop-color":{inherited:false,supports:4,values:["aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"stop-opacity":{inherited:false,supports:1024,values:["inherit","initial","unset"]},"stroke":{inherited:true,supports:12,values:["inherit","initial","unset"]},"stroke-dasharray":{inherited:true,supports:1027,values:["inherit","initial","unset"]},"stroke-dashoffset":{inherited:true,supports:1027,values:["inherit","initial","unset"]},"stroke-linecap":{inherited:true,supports:0,values:["butt","inherit","initial","round","square","unset"]},"stroke-linejoin":{inherited:true,supports:0,values:["bevel","inherit","initial","miter","round","unset"]},"stroke-miterlimit":{inherited:true,supports:1024,values:["inherit","initial","unset"]},"stroke-opacity":{inherited:true,supports:1024,values:["inherit","initial","unset"]},"stroke-width":{inherited:true,supports:1027,values:["inherit","initial","unset"]},"text-anchor":{inherited:true,supports:0,values:["end","inherit","initial","middle","start","unset"]},"text-rendering":{inherited:true,supports:0,values:["auto","geometricprecision","inherit","initial","optimizelegibility","optimizespeed","unset"]},"vector-effect":{inherited:false,supports:0,values:["inherit","initial","non-scaling-stroke","none","unset"]},"will-change":{inherited:false,supports:0,values:["inherit","initial","unset"]},"-moz-outline-radius":{subproperties:["-moz-outline-radius-topleft","-moz-outline-radius-topright","-moz-outline-radius-bottomright","-moz-outline-radius-bottomleft"],inherited:false,supports:3,values:["inherit","initial","unset"]},"all":{subproperties:["-moz-appearance","-moz-outline-radius-topleft","-moz-outline-radius-topright","-moz-outline-radius-bottomright","-moz-outline-radius-bottomleft","-moz-tab-size","-x-system-font","animation-delay","animation-direction","animation-duration","animation-fill-mode","animation-iteration-count","animation-name","animation-play-state","animation-timing-function","background-attachment","background-clip","background-color","background-image","background-blend-mode","background-origin","background-position","background-repeat","background-size","-moz-binding","block-size","border-block-end-color","border-block-end-style","border-block-end-width","border-block-start-color","border-block-start-style","border-block-start-width","border-bottom-color","-moz-border-bottom-colors","border-bottom-style","border-bottom-width","border-collapse","border-image-source","border-image-slice","border-image-width","border-image-outset","border-image-repeat","border-inline-end-color","border-inline-end-style","border-inline-end-width","border-inline-start-color","border-inline-start-style","border-inline-start-width","border-left-color","-moz-border-left-colors","border-left-style","border-left-width","border-right-color","-moz-border-right-colors","border-right-style","border-right-width","border-spacing","border-top-color","-moz-border-top-colors","border-top-style","border-top-width","border-top-left-radius","border-top-right-radius","border-bottom-right-radius","border-bottom-left-radius","bottom","box-decoration-break","box-shadow","box-sizing","caption-side","clear","clip","color","-moz-column-count","-moz-column-fill","-moz-column-width","-moz-column-gap","-moz-column-rule-color","-moz-column-rule-style","-moz-column-rule-width","contain","content","-moz-control-character-visibility","counter-increment","counter-reset","cursor","display","empty-cells","align-content","align-items","align-self","flex-basis","flex-direction","flex-grow","flex-shrink","flex-wrap","order","justify-content","justify-items","justify-self","float","-moz-float-edge","font-family","font-feature-settings","font-kerning","font-language-override","font-size","font-size-adjust","-moz-osx-font-smoothing","font-stretch","font-style","font-synthesis","font-variant-alternates","font-variant-caps","font-variant-east-asian","font-variant-ligatures","font-variant-numeric","font-variant-position","font-weight","-moz-force-broken-image-icon","grid-auto-flow","grid-auto-columns","grid-auto-rows","grid-template-areas","grid-template-columns","grid-template-rows","grid-column-start","grid-column-end","grid-row-start","grid-row-end","grid-column-gap","grid-row-gap","height","image-orientation","-moz-image-region","ime-mode","inline-size","left","letter-spacing","line-height","list-style-image","list-style-position","list-style-type","margin-block-end","margin-block-start","margin-bottom","margin-inline-end","margin-inline-start","margin-left","margin-right","margin-top","marker-offset","max-block-size","max-height","max-inline-size","max-width","-moz-min-font-size-ratio","min-height","min-block-size","min-inline-size","min-width","mix-blend-mode","isolation","object-fit","object-position","offset-block-end","offset-block-start","offset-inline-end","offset-inline-start","opacity","-moz-orient","outline-color","outline-style","outline-width","outline-offset","overflow-clip-box","overflow-x","overflow-y","padding-block-end","padding-block-start","padding-bottom","padding-inline-end","padding-inline-start","padding-left","padding-right","padding-top","page-break-after","page-break-before","page-break-inside","paint-order","pointer-events","position","quotes","resize","right","ruby-align","ruby-position","scroll-behavior","scroll-snap-coordinate","scroll-snap-destination","scroll-snap-points-x","scroll-snap-points-y","scroll-snap-type-x","scroll-snap-type-y","table-layout","text-align","-moz-text-align-last","text-combine-upright","text-decoration-color","text-decoration-line","text-decoration-style","text-indent","text-orientation","text-overflow","text-shadow","-moz-text-size-adjust","text-transform","transform","transform-box","transform-origin","perspective-origin","perspective","transform-style","backface-visibility","top","-moz-top-layer","touch-action","transition-delay","transition-duration","transition-property","transition-timing-function","-moz-user-focus","-moz-user-input","-moz-user-modify","-moz-user-select","vertical-align","visibility","white-space","width","-moz-window-dragging","-moz-window-shadow","word-break","word-spacing","word-wrap","hyphens","writing-mode","z-index","-moz-box-align","-moz-box-direction","-moz-box-flex","-moz-box-orient","-moz-box-pack","-moz-box-ordinal-group","-moz-stack-sizing","clip-path","clip-rule","color-interpolation","color-interpolation-filters","dominant-baseline","fill","fill-opacity","fill-rule","filter","flood-color","flood-opacity","image-rendering","lighting-color","marker-end","marker-mid","marker-start","mask","mask-type","shape-rendering","stop-color","stop-opacity","stroke","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke-width","text-anchor","text-rendering","vector-effect","will-change"],inherited:false,supports:2015,values:["-moz-all","-moz-available","-moz-block-height","-moz-box","-moz-calc","-moz-center","-moz-crisp-edges","-moz-deck","-moz-element","-moz-fit-content","-moz-grid","-moz-grid-group","-moz-grid-line","-moz-groupbox","-moz-gtk-info-bar","-moz-hidden-unscrollable","-moz-image-rect","-moz-inline-box","-moz-inline-grid","-moz-inline-stack","-moz-left","-moz-linear-gradient","-moz-mac-disclosure-button-closed","-moz-mac-disclosure-button-open","-moz-mac-fullscreen-button","-moz-mac-help-button","-moz-mac-vibrancy-dark","-moz-mac-vibrancy-light","-moz-max-content","-moz-middle-with-baseline","-moz-min-content","-moz-none","-moz-popup","-moz-pre-space","-moz-radial-gradient","-moz-repeating-linear-gradient","-moz-repeating-radial-gradient","-moz-right","-moz-stack","-moz-text","-moz-use-text-color","-moz-win-borderless-glass","-moz-win-browsertabbar-toolbox","-moz-win-communications-toolbox","-moz-win-exclude-glass","-moz-win-glass","-moz-win-media-toolbox","-moz-window-button-box","-moz-window-button-box-maximized","-moz-window-button-close","-moz-window-button-maximize","-moz-window-button-minimize","-moz-window-button-restore","-moz-window-frame-bottom","-moz-window-frame-left","-moz-window-frame-right","-moz-window-titlebar","-moz-window-titlebar-maximized","absolute","active","aliceblue","all","all-petite-caps","all-small-caps","alpha","alphabetic","alternate","alternate-reverse","always","antiquewhite","aqua","aquamarine","auto","avoid","azure","backwards","balance","baseline","beige","bevel","bisque","black","blanchedalmond","block","block-axis","blue","blueviolet","border-box","both","bottom","bottom-outside","break-all","break-word","brown","burlywood","butt","button","button-arrow-down","button-arrow-next","button-arrow-previous","button-arrow-up","button-bevel","button-focus","cadetblue","calc","capitalize","caret","center","central","chartreuse","checkbox","checkbox-container","checkbox-label","checkmenuitem","chocolate","clone","collapse","color","color-burn","color-dodge","column","column-reverse","condensed","contain","content-box","contents","coral","cornflowerblue","cornsilk","cover","crimson","crispedges","cubic-bezier","currentColor","cyan","darkblue","darkcyan","darken","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dialog","difference","dimgray","dimgrey","disabled","dodgerblue","dotted","double","drag","dualbutton","ease","ease-in","ease-in-out","ease-out","element","elements","enabled","end","evenodd","exclusion","expanded","extra-condensed","extra-expanded","fill","fill-box","firebrick","fixed","flat","flex","floralwhite","forestgreen","forwards","fuchsia","full-width","gainsboro","geometricprecision","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","grid","groove","groupbox","hanging","hard-light","hidden","hide","honeydew","horizontal","horizontal-tb","hotpink","hsl","hsla","hue","ideographic","ignore","inactive","indianred","indigo","infinite","inherit","initial","inline","inline-axis","inline-block","inline-end","inline-flex","inline-grid","inline-start","inline-table","inset","inside","isolate","italic","ivory","justify","keep-all","khaki","large","larger","lavender","lavenderblush","lawngreen","layout","left","lemonchiffon","lightblue","lightcoral","lightcyan","lighten","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linear","linear-gradient","linearrgb","linen","list-item","listbox","listitem","local","lowercase","lr","lr-tb","luminance","luminosity","magenta","mandatory","manual","margin-box","maroon","mathematical","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","menuarrow","menubar","menucheckbox","menuimage","menuitem","menuitemtext","menulist","menulist-button","menulist-text","menulist-textfield","menupopup","menuradio","menuseparator","meterbar","meterchunk","middle","midnightblue","mintcream","mistyrose","miter","mixed","moccasin","multiply","navajowhite","navy","no-change","no-drag","no-repeat","non-scaling-stroke","none","nonzero","normal","nowrap","number-input","oblique","oldlace","olive","olivedrab","optimizelegibility","optimizequality","optimizespeed","orange","orangered","orchid","outset","outside","over","overlay","padding-box","paint","painted","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","paused","peachpuff","peru","petite-caps","pink","plum","powderblue","pre","pre-line","pre-wrap","preserve-3d","progressbar","progressbar-vertical","progresschunk","progresschunk-vertical","proximity","purple","radial-gradient","radio","radio-container","radio-label","radiomenuitem","range","range-thumb","read-only","read-write","rebeccapurple","red","relative","repeat","repeat-x","repeat-y","repeating-linear-gradient","repeating-radial-gradient","reset-size","resizer","resizerpanel","reverse","rgb","rgba","ridge","right","rl","rl-tb","rosybrown","round","row","row-reverse","royalblue","ruby","ruby-base","ruby-base-container","ruby-text","ruby-text-container","running","saddlebrown","salmon","sandybrown","saturation","scale-down","scale-horizontal","scale-vertical","scalethumb-horizontal","scalethumb-vertical","scalethumbend","scalethumbstart","scalethumbtick","screen","scroll","scrollbar","scrollbar-small","scrollbarbutton-down","scrollbarbutton-left","scrollbarbutton-right","scrollbarbutton-up","scrollbarthumb-horizontal","scrollbarthumb-vertical","scrollbartrack-horizontal","scrollbartrack-vertical","seagreen","searchfield","seashell","select-after","select-all","select-before","select-menu","select-same","semi-condensed","semi-expanded","separate","separator","show","sideways","sideways-lr","sideways-right","sideways-rl","sienna","silver","skyblue","slateblue","slategray","slategrey","slice","small","small-caps","smaller","smooth","snow","soft-light","solid","space-around","space-between","spinner","spinner-downbutton","spinner-textfield","spinner-upbutton","splitter","springgreen","square","srgb","start","static","statusbar","statusbarpanel","steelblue","step-end","step-start","steps","sticky","stretch","stretch-to-fit","strict","stroke","style","sub","super","tab","tab-scroll-arrow-back","tab-scroll-arrow-forward","table","table-caption","table-cell","table-column","table-column-group","table-footer-group","table-header-group","table-row","table-row-group","tabpanel","tabpanels","tan","tb","tb-rl","teal","text","text-after-edge","text-before-edge","text-bottom","text-top","textfield","textfield-multiline","thick","thin","thistle","titling-caps","toggle","tomato","toolbar","toolbarbutton","toolbarbutton-dropdown","toolbargripper","toolbox","tooltip","top","top-outside","transparent","treeheader","treeheadercell","treeheadersortarrow","treeitem","treeline","treetwisty","treetwistyopen","treeview","tri-state","turquoise","ultra-condensed","ultra-expanded","under","unicase","unset","uppercase","upright","url","use-script","vertical","vertical-lr","vertical-rl","view-box","violet","visible","visiblefill","visiblepainted","visiblestroke","wavy","wheat","white","whitesmoke","window","wrap","wrap-reverse","write-only","x-large","x-small","xx-large","xx-small","yellow","yellowgreen"]},"animation":{subproperties:["animation-duration","animation-timing-function","animation-delay","animation-direction","animation-fill-mode","animation-iteration-count","animation-play-state","animation-name"],inherited:false,supports:1344,values:["alternate","alternate-reverse","backwards","both","cubic-bezier","ease","ease-in","ease-in-out","ease-out","forwards","infinite","inherit","initial","linear","none","normal","paused","reverse","running","step-end","step-start","steps","unset"]},"background":{subproperties:["background-color","background-image","background-repeat","background-attachment","background-position","background-clip","background-origin","background-size"],inherited:false,supports:655,values:["-moz-element","-moz-image-rect","-moz-linear-gradient","-moz-radial-gradient","-moz-repeating-linear-gradient","-moz-repeating-radial-gradient","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","border-box","brown","burlywood","cadetblue","chartreuse","chocolate","content-box","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","fixed","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linear-gradient","linen","local","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","no-repeat","none","oldlace","olive","olivedrab","orange","orangered","orchid","padding-box","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","radial-gradient","rebeccapurple","red","repeat","repeat-x","repeat-y","repeating-linear-gradient","repeating-radial-gradient","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","scroll","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","url","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border":{subproperties:["border-top-width","border-right-width","border-bottom-width","border-left-width","border-top-style","border-right-style","border-bottom-style","border-left-style","border-top-color","border-right-color","border-bottom-color","border-left-color","-moz-border-top-colors","-moz-border-right-colors","-moz-border-bottom-colors","-moz-border-left-colors","border-image-source","border-image-slice","border-image-width","border-image-outset","border-image-repeat"],inherited:false,supports:5,values:["-moz-calc","-moz-element","-moz-image-rect","-moz-linear-gradient","-moz-radial-gradient","-moz-repeating-linear-gradient","-moz-repeating-radial-gradient","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","calc","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","groove","hidden","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","inset","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linear-gradient","linen","magenta","maroon","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","none","oldlace","olive","olivedrab","orange","orangered","orchid","outset","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","radial-gradient","rebeccapurple","red","repeating-linear-gradient","repeating-radial-gradient","rgb","rgba","ridge","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thick","thin","thistle","tomato","transparent","turquoise","unset","url","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-block-end":{subproperties:["border-block-end-width","border-block-end-style","border-block-end-color"],inherited:false,supports:5,values:["-moz-calc","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","calc","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","groove","hidden","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","inset","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","none","oldlace","olive","olivedrab","orange","orangered","orchid","outset","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","ridge","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thick","thin","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-block-start":{subproperties:["border-block-start-width","border-block-start-style","border-block-start-color"],inherited:false,supports:5,values:["-moz-calc","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","calc","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","groove","hidden","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","inset","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","none","oldlace","olive","olivedrab","orange","orangered","orchid","outset","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","ridge","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thick","thin","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-bottom":{subproperties:["border-bottom-width","border-bottom-style","border-bottom-color"],inherited:false,supports:5,values:["-moz-calc","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","calc","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","groove","hidden","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","inset","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","none","oldlace","olive","olivedrab","orange","orangered","orchid","outset","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","ridge","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thick","thin","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-color":{subproperties:["border-top-color","border-right-color","border-bottom-color","border-left-color"],inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-image":{subproperties:["border-image-source","border-image-slice","border-image-width","border-image-outset","border-image-repeat"],inherited:false,supports:1675,values:["-moz-element","-moz-image-rect","-moz-linear-gradient","-moz-radial-gradient","-moz-repeating-linear-gradient","-moz-repeating-radial-gradient","inherit","initial","linear-gradient","none","radial-gradient","repeating-linear-gradient","repeating-radial-gradient","unset","url"]},"border-inline-end":{subproperties:["border-inline-end-width","border-inline-end-style","border-inline-end-color"],inherited:false,supports:5,values:["-moz-calc","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","calc","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","groove","hidden","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","inset","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","none","oldlace","olive","olivedrab","orange","orangered","orchid","outset","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","ridge","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thick","thin","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-inline-start":{subproperties:["border-inline-start-width","border-inline-start-style","border-inline-start-color"],inherited:false,supports:5,values:["-moz-calc","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","calc","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","groove","hidden","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","inset","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","none","oldlace","olive","olivedrab","orange","orangered","orchid","outset","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","ridge","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thick","thin","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-left":{subproperties:["border-left-width","border-left-style","border-left-color"],inherited:false,supports:5,values:["-moz-calc","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","calc","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","groove","hidden","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","inset","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","none","oldlace","olive","olivedrab","orange","orangered","orchid","outset","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","ridge","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thick","thin","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-right":{subproperties:["border-right-width","border-right-style","border-right-color"],inherited:false,supports:5,values:["-moz-calc","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","calc","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","groove","hidden","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","inset","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","none","oldlace","olive","olivedrab","orange","orangered","orchid","outset","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","ridge","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thick","thin","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-style":{subproperties:["border-top-style","border-right-style","border-bottom-style","border-left-style"],inherited:false,supports:0,values:["dashed","dotted","double","groove","hidden","inherit","initial","inset","none","outset","ridge","solid","unset"]},"border-top":{subproperties:["border-top-width","border-top-style","border-top-color"],inherited:false,supports:5,values:["-moz-calc","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","calc","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","groove","hidden","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","inset","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","none","oldlace","olive","olivedrab","orange","orangered","orchid","outset","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","ridge","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thick","thin","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"border-width":{subproperties:["border-top-width","border-right-width","border-bottom-width","border-left-width"],inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","medium","thick","thin","unset"]},"border-radius":{subproperties:["border-top-left-radius","border-top-right-radius","border-bottom-right-radius","border-bottom-left-radius"],inherited:false,supports:3,values:["inherit","initial","unset"]},"-moz-columns":{subproperties:["-moz-column-count","-moz-column-width"],inherited:false,supports:1025,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"-moz-column-rule":{subproperties:["-moz-column-rule-width","-moz-column-rule-style","-moz-column-rule-color"],inherited:false,supports:5,values:["-moz-calc","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","calc","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","groove","hidden","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","inset","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","none","oldlace","olive","olivedrab","orange","orangered","orchid","outset","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","ridge","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thick","thin","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"flex":{subproperties:["flex-grow","flex-shrink","flex-basis"],inherited:false,supports:1027,values:["-moz-available","-moz-calc","-moz-fit-content","-moz-max-content","-moz-min-content","auto","calc","inherit","initial","unset"]},"flex-flow":{subproperties:["flex-direction","flex-wrap"],inherited:false,supports:0,values:["column","column-reverse","inherit","initial","nowrap","row","row-reverse","unset","wrap","wrap-reverse"]},"font":{subproperties:["font-family","font-style","font-weight","font-size","line-height","font-size-adjust","font-stretch","-x-system-font","font-feature-settings","font-language-override","font-kerning","font-synthesis","font-variant-alternates","font-variant-caps","font-variant-east-asian","font-variant-ligatures","font-variant-numeric","font-variant-position"],inherited:true,supports:1027,values:["-moz-block-height","-moz-calc","all-petite-caps","all-small-caps","auto","calc","condensed","expanded","extra-condensed","extra-expanded","inherit","initial","italic","large","larger","medium","none","normal","oblique","petite-caps","semi-condensed","semi-expanded","small","small-caps","smaller","sub","super","titling-caps","ultra-condensed","ultra-expanded","unicase","unset","x-large","x-small","xx-large","xx-small"]},"font-variant":{subproperties:["font-variant-alternates","font-variant-caps","font-variant-east-asian","font-variant-ligatures","font-variant-numeric","font-variant-position"],inherited:true,supports:0,values:["all-petite-caps","all-small-caps","inherit","initial","normal","petite-caps","small-caps","sub","super","titling-caps","unicase","unset"]},"grid-template":{subproperties:["grid-template-areas","grid-template-columns","grid-template-rows"],inherited:false,supports:3,values:["inherit","initial","unset"]},"grid":{subproperties:["grid-template-areas","grid-template-columns","grid-template-rows","grid-auto-flow","grid-auto-columns","grid-auto-rows","grid-column-gap","grid-row-gap"],inherited:false,supports:3,values:["-moz-calc","calc","inherit","initial","unset"]},"grid-column":{subproperties:["grid-column-start","grid-column-end"],inherited:false,supports:1024,values:["inherit","initial","unset"]},"grid-row":{subproperties:["grid-row-start","grid-row-end"],inherited:false,supports:1024,values:["inherit","initial","unset"]},"grid-area":{subproperties:["grid-row-start","grid-column-start","grid-row-end","grid-column-end"],inherited:false,supports:1024,values:["inherit","initial","unset"]},"grid-gap":{subproperties:["grid-column-gap","grid-row-gap"],inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","unset"]},"list-style":{subproperties:["list-style-type","list-style-image","list-style-position"],inherited:true,supports:8,values:["inherit","initial","inside","none","outside","unset","url"]},"margin":{subproperties:["margin-top","margin-right","margin-bottom","margin-left"],inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"outline":{subproperties:["outline-width","outline-style","outline-color"],inherited:false,supports:5,values:["-moz-calc","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","auto","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","calc","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","groove","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","inset","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","none","oldlace","olive","olivedrab","orange","orangered","orchid","outset","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","ridge","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thick","thin","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"overflow":{subproperties:["overflow-x","overflow-y"],inherited:false,supports:0,values:["-moz-hidden-unscrollable","auto","hidden","inherit","initial","scroll","unset","visible"]},"padding":{subproperties:["padding-top","padding-right","padding-bottom","padding-left"],inherited:false,supports:3,values:["-moz-calc","calc","inherit","initial","unset"]},"scroll-snap-type":{subproperties:["scroll-snap-type-x","scroll-snap-type-y"],inherited:false,supports:0,values:["inherit","initial","mandatory","none","proximity","unset"]},"text-decoration":{subproperties:["text-decoration-color","text-decoration-line","text-decoration-style"],inherited:false,supports:4,values:["-moz-none","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wavy","wheat","white","whitesmoke","yellow","yellowgreen"]},"transition":{subproperties:["transition-property","transition-duration","transition-timing-function","transition-delay"],inherited:false,supports:320,values:["all","cubic-bezier","ease","ease-in","ease-in-out","ease-out","inherit","initial","linear","none","step-end","step-start","steps","unset"]},"marker":{subproperties:["marker-start","marker-mid","marker-end"],inherited:true,supports:8,values:["inherit","initial","none","unset","url"]},"-moz-transform":{alias:true,subproperties:["transform"],inherited:false,supports:0,values:["inherit","initial","unset"]},"-moz-transform-origin":{alias:true,inherited:false,supports:3,values:["inherit","initial","unset"]},"-moz-perspective-origin":{alias:true,inherited:false,supports:3,values:["inherit","initial","unset"]},"-moz-perspective":{alias:true,inherited:false,supports:1,values:["inherit","initial","none","unset"]},"-moz-transform-style":{alias:true,inherited:false,supports:0,values:["flat","inherit","initial","preserve-3d","unset"]},"-moz-backface-visibility":{alias:true,inherited:false,supports:0,values:["hidden","inherit","initial","unset","visible"]},"-moz-border-image":{alias:true,subproperties:["border-image-source","border-image-slice","border-image-width","border-image-outset","border-image-repeat"],inherited:false,supports:1675,values:["-moz-element","-moz-image-rect","-moz-linear-gradient","-moz-radial-gradient","-moz-repeating-linear-gradient","-moz-repeating-radial-gradient","inherit","initial","linear-gradient","none","radial-gradient","repeating-linear-gradient","repeating-radial-gradient","unset","url"]},"-moz-transition":{alias:true,subproperties:["transition-property","transition-duration","transition-timing-function","transition-delay"],inherited:false,supports:320,values:["all","cubic-bezier","ease","ease-in","ease-in-out","ease-out","inherit","initial","linear","none","step-end","step-start","steps","unset"]},"-moz-transition-delay":{alias:true,inherited:false,supports:64,values:["inherit","initial","unset"]},"-moz-transition-duration":{alias:true,inherited:false,supports:64,values:["inherit","initial","unset"]},"-moz-transition-property":{alias:true,inherited:false,supports:0,values:["all","inherit","initial","none","unset"]},"-moz-transition-timing-function":{alias:true,inherited:false,supports:256,values:["cubic-bezier","ease","ease-in","ease-in-out","ease-out","inherit","initial","linear","step-end","step-start","steps","unset"]},"-moz-animation":{alias:true,subproperties:["animation-duration","animation-timing-function","animation-delay","animation-direction","animation-fill-mode","animation-iteration-count","animation-play-state","animation-name"],inherited:false,supports:1344,values:["alternate","alternate-reverse","backwards","both","cubic-bezier","ease","ease-in","ease-in-out","ease-out","forwards","infinite","inherit","initial","linear","none","normal","paused","reverse","running","step-end","step-start","steps","unset"]},"-moz-animation-delay":{alias:true,inherited:false,supports:64,values:["inherit","initial","unset"]},"-moz-animation-direction":{alias:true,inherited:false,supports:0,values:["alternate","alternate-reverse","inherit","initial","normal","reverse","unset"]},"-moz-animation-duration":{alias:true,inherited:false,supports:64,values:["inherit","initial","unset"]},"-moz-animation-fill-mode":{alias:true,inherited:false,supports:0,values:["backwards","both","forwards","inherit","initial","none","unset"]},"-moz-animation-iteration-count":{alias:true,inherited:false,supports:1024,values:["infinite","inherit","initial","unset"]},"-moz-animation-name":{alias:true,inherited:false,supports:0,values:["inherit","initial","none","unset"]},"-moz-animation-play-state":{alias:true,inherited:false,supports:0,values:["inherit","initial","paused","running","unset"]},"-moz-animation-timing-function":{alias:true,inherited:false,supports:256,values:["cubic-bezier","ease","ease-in","ease-in-out","ease-out","inherit","initial","linear","step-end","step-start","steps","unset"]},"-moz-box-sizing":{alias:true,inherited:false,supports:0,values:["border-box","content-box","inherit","initial","padding-box","unset"]},"-moz-font-feature-settings":{alias:true,inherited:true,supports:0,values:["inherit","initial","unset"]},"-moz-font-language-override":{alias:true,inherited:true,supports:0,values:["inherit","initial","normal","unset"]},"-moz-padding-end":{alias:true,inherited:false,supports:3,values:["-moz-calc","calc","inherit","initial","unset"]},"-moz-padding-start":{alias:true,inherited:false,supports:3,values:["-moz-calc","calc","inherit","initial","unset"]},"-moz-margin-end":{alias:true,inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"-moz-margin-start":{alias:true,inherited:false,supports:3,values:["-moz-calc","auto","calc","inherit","initial","unset"]},"-moz-border-end":{alias:true,subproperties:["border-inline-end-width","border-inline-end-style","border-inline-end-color"],inherited:false,supports:5,values:["-moz-calc","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","calc","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","groove","hidden","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","inset","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","none","oldlace","olive","olivedrab","orange","orangered","orchid","outset","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","ridge","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thick","thin","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"-moz-border-end-color":{alias:true,inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"-moz-border-end-style":{alias:true,inherited:false,supports:0,values:["dashed","dotted","double","groove","hidden","inherit","initial","inset","none","outset","ridge","solid","unset"]},"-moz-border-end-width":{alias:true,inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","medium","thick","thin","unset"]},"-moz-border-start":{alias:true,subproperties:["border-inline-start-width","border-inline-start-style","border-inline-start-color"],inherited:false,supports:5,values:["-moz-calc","-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","calc","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","dashed","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","dotted","double","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","groove","hidden","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","inset","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","medium","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","none","oldlace","olive","olivedrab","orange","orangered","orchid","outset","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","ridge","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","solid","springgreen","steelblue","tan","teal","thick","thin","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"-moz-border-start-color":{alias:true,inherited:false,supports:4,values:["-moz-use-text-color","aliceblue","antiquewhite","aqua","aquamarine","azure","beige","bisque","black","blanchedalmond","blue","blueviolet","brown","burlywood","cadetblue","chartreuse","chocolate","coral","cornflowerblue","cornsilk","crimson","currentColor","cyan","darkblue","darkcyan","darkgoldenrod","darkgray","darkgreen","darkgrey","darkkhaki","darkmagenta","darkolivegreen","darkorange","darkorchid","darkred","darksalmon","darkseagreen","darkslateblue","darkslategray","darkslategrey","darkturquoise","darkviolet","deeppink","deepskyblue","dimgray","dimgrey","dodgerblue","firebrick","floralwhite","forestgreen","fuchsia","gainsboro","ghostwhite","gold","goldenrod","gray","grey","green","greenyellow","honeydew","hotpink","hsl","hsla","indianred","indigo","inherit","initial","ivory","khaki","lavender","lavenderblush","lawngreen","lemonchiffon","lightblue","lightcoral","lightcyan","lightgoldenrodyellow","lightgray","lightgreen","lightgrey","lightpink","lightsalmon","lightseagreen","lightskyblue","lightslategray","lightslategrey","lightsteelblue","lightyellow","lime","limegreen","linen","magenta","maroon","mediumaquamarine","mediumblue","mediumorchid","mediumpurple","mediumseagreen","mediumslateblue","mediumspringgreen","mediumturquoise","mediumvioletred","midnightblue","mintcream","mistyrose","moccasin","navajowhite","navy","oldlace","olive","olivedrab","orange","orangered","orchid","palegoldenrod","palegreen","paleturquoise","palevioletred","papayawhip","peachpuff","peru","pink","plum","powderblue","purple","rebeccapurple","red","rgb","rgba","rosybrown","royalblue","saddlebrown","salmon","sandybrown","seagreen","seashell","sienna","silver","skyblue","slateblue","slategray","slategrey","snow","springgreen","steelblue","tan","teal","thistle","tomato","transparent","turquoise","unset","violet","wheat","white","whitesmoke","yellow","yellowgreen"]},"-moz-border-start-style":{alias:true,inherited:false,supports:0,values:["dashed","dotted","double","groove","hidden","inherit","initial","inset","none","outset","ridge","solid","unset"]},"-moz-border-start-width":{alias:true,inherited:false,supports:1,values:["-moz-calc","calc","inherit","initial","medium","thick","thin","unset"]},"-moz-hyphens":{alias:true,inherited:true,supports:0,values:["auto","inherit","initial","manual","none","unset"]},"-webkit-animation":{alias:true,subproperties:["animation-duration","animation-timing-function","animation-delay","animation-direction","animation-fill-mode","animation-iteration-count","animation-play-state","animation-name"],inherited:false,supports:1344,values:["alternate","alternate-reverse","backwards","both","cubic-bezier","ease","ease-in","ease-in-out","ease-out","forwards","infinite","inherit","initial","linear","none","normal","paused","reverse","running","step-end","step-start","steps","unset"]},"-webkit-animation-delay":{alias:true,inherited:false,supports:64,values:["inherit","initial","unset"]},"-webkit-animation-direction":{alias:true,inherited:false,supports:0,values:["alternate","alternate-reverse","inherit","initial","normal","reverse","unset"]},"-webkit-animation-duration":{alias:true,inherited:false,supports:64,values:["inherit","initial","unset"]},"-webkit-animation-fill-mode":{alias:true,inherited:false,supports:0,values:["backwards","both","forwards","inherit","initial","none","unset"]},"-webkit-animation-iteration-count":{alias:true,inherited:false,supports:1024,values:["infinite","inherit","initial","unset"]},"-webkit-animation-name":{alias:true,inherited:false,supports:0,values:["inherit","initial","none","unset"]},"-webkit-animation-play-state":{alias:true,inherited:false,supports:0,values:["inherit","initial","paused","running","unset"]},"-webkit-animation-timing-function":{alias:true,inherited:false,supports:256,values:["cubic-bezier","ease","ease-in","ease-in-out","ease-out","inherit","initial","linear","step-end","step-start","steps","unset"]},"-webkit-text-size-adjust":{alias:true,inherited:true,supports:0,values:["auto","inherit","initial","none","unset"]},"-webkit-transform":{alias:true,inherited:false,supports:0,values:["inherit","initial","unset"]},"-webkit-transform-origin":{alias:true,inherited:false,supports:3,values:["inherit","initial","unset"]},"-webkit-transform-style":{alias:true,inherited:false,supports:0,values:["flat","inherit","initial","preserve-3d","unset"]},"-webkit-backface-visibility":{alias:true,inherited:false,supports:0,values:["hidden","inherit","initial","unset","visible"]},"-webkit-perspective":{alias:true,inherited:false,supports:1,values:["inherit","initial","none","unset"]},"-webkit-perspective-origin":{alias:true,inherited:false,supports:3,values:["inherit","initial","unset"]},"-webkit-transition":{alias:true,subproperties:["transition-property","transition-duration","transition-timing-function","transition-delay"],inherited:false,supports:320,values:["all","cubic-bezier","ease","ease-in","ease-in-out","ease-out","inherit","initial","linear","none","step-end","step-start","steps","unset"]},"-webkit-transition-delay":{alias:true,inherited:false,supports:64,values:["inherit","initial","unset"]},"-webkit-transition-duration":{alias:true,inherited:false,supports:64,values:["inherit","initial","unset"]},"-webkit-transition-property":{alias:true,inherited:false,supports:0,values:["all","inherit","initial","none","unset"]},"-webkit-transition-timing-function":{alias:true,inherited:false,supports:256,values:["cubic-bezier","ease","ease-in","ease-in-out","ease-out","inherit","initial","linear","step-end","step-start","steps","unset"]},"-webkit-border-radius":{alias:true,subproperties:["border-top-left-radius","border-top-right-radius","border-bottom-right-radius","border-bottom-left-radius"],inherited:false,supports:3,values:["inherit","initial","unset"]},"-webkit-border-top-left-radius":{alias:true,inherited:false,supports:3,values:["inherit","initial","unset"]},"-webkit-border-top-right-radius":{alias:true,inherited:false,supports:3,values:["inherit","initial","unset"]},"-webkit-border-bottom-left-radius":{alias:true,inherited:false,supports:3,values:["inherit","initial","unset"]},"-webkit-border-bottom-right-radius":{alias:true,inherited:false,supports:3,values:["inherit","initial","unset"]},"-webkit-appearance":{alias:true,inherited:false,supports:0,values:["-moz-gtk-info-bar","-moz-mac-disclosure-button-closed","-moz-mac-disclosure-button-open","-moz-mac-fullscreen-button","-moz-mac-help-button","-moz-mac-vibrancy-dark","-moz-mac-vibrancy-light","-moz-win-borderless-glass","-moz-win-browsertabbar-toolbox","-moz-win-communications-toolbox","-moz-win-exclude-glass","-moz-win-glass","-moz-win-media-toolbox","-moz-window-button-box","-moz-window-button-box-maximized","-moz-window-button-close","-moz-window-button-maximize","-moz-window-button-minimize","-moz-window-button-restore","-moz-window-frame-bottom","-moz-window-frame-left","-moz-window-frame-right","-moz-window-titlebar","-moz-window-titlebar-maximized","button","button-arrow-down","button-arrow-next","button-arrow-previous","button-arrow-up","button-bevel","button-focus","caret","checkbox","checkbox-container","checkbox-label","checkmenuitem","dialog","dualbutton","groupbox","inherit","initial","listbox","listitem","menuarrow","menubar","menucheckbox","menuimage","menuitem","menuitemtext","menulist","menulist-button","menulist-text","menulist-textfield","menupopup","menuradio","menuseparator","meterbar","meterchunk","none","number-input","progressbar","progressbar-vertical","progresschunk","progresschunk-vertical","radio","radio-container","radio-label","radiomenuitem","range","range-thumb","resizer","resizerpanel","scale-horizontal","scale-vertical","scalethumb-horizontal","scalethumb-vertical","scalethumbend","scalethumbstart","scalethumbtick","scrollbar","scrollbar-small","scrollbarbutton-down","scrollbarbutton-left","scrollbarbutton-right","scrollbarbutton-up","scrollbarthumb-horizontal","scrollbarthumb-vertical","scrollbartrack-horizontal","scrollbartrack-vertical","searchfield","separator","spinner","spinner-downbutton","spinner-textfield","spinner-upbutton","splitter","statusbar","statusbarpanel","tab","tab-scroll-arrow-back","tab-scroll-arrow-forward","tabpanel","tabpanels","textfield","textfield-multiline","toolbar","toolbarbutton","toolbarbutton-dropdown","toolbargripper","toolbox","tooltip","treeheader","treeheadercell","treeheadersortarrow","treeitem","treeline","treetwisty","treetwistyopen","treeview","unset","window"]},"-webkit-background-clip":{alias:true,inherited:false,supports:0,values:["border-box","content-box","inherit","initial","padding-box","unset"]},"-webkit-background-origin":{alias:true,inherited:false,supports:0,values:["border-box","content-box","inherit","initial","padding-box","unset"]},"-webkit-background-size":{alias:true,inherited:false,supports:3,values:["inherit","initial","unset"]},"-webkit-border-image":{alias:true,subproperties:["border-image-source","border-image-slice","border-image-width","border-image-outset","border-image-repeat"],inherited:false,supports:1675,values:["-moz-element","-moz-image-rect","-moz-linear-gradient","-moz-radial-gradient","-moz-repeating-linear-gradient","-moz-repeating-radial-gradient","inherit","initial","linear-gradient","none","radial-gradient","repeating-linear-gradient","repeating-radial-gradient","unset","url"]},"-webkit-border-image-outset":{alias:true,inherited:false,supports:1025,values:["inherit","initial","unset"]},"-webkit-border-image-repeat":{alias:true,inherited:false,supports:0,values:["inherit","initial","unset"]},"-webkit-border-image-slice":{alias:true,inherited:false,supports:1026,values:["inherit","initial","unset"]},"-webkit-border-image-source":{alias:true,inherited:false,supports:648,values:["-moz-element","-moz-image-rect","-moz-linear-gradient","-moz-radial-gradient","-moz-repeating-linear-gradient","-moz-repeating-radial-gradient","inherit","initial","linear-gradient","none","radial-gradient","repeating-linear-gradient","repeating-radial-gradient","unset","url"]},"-webkit-border-image-width":{alias:true,inherited:false,supports:1027,values:["inherit","initial","unset"]},"-webkit-box-shadow":{alias:true,inherited:false,supports:5,values:["inherit","initial","unset"]},"-webkit-box-sizing":{alias:true,inherited:false,supports:0,values:["border-box","content-box","inherit","initial","padding-box","unset"]},"-webkit-box-flex":{alias:true,inherited:false,supports:1024,values:["inherit","initial","unset"]},"-webkit-box-ordinal-group":{alias:true,inherited:false,supports:1024,values:["inherit","initial","unset"]},"-webkit-box-align":{alias:true,inherited:false,supports:0,values:["inherit","initial","unset"]},"-webkit-box-pack":{alias:true,inherited:false,supports:0,values:["inherit","initial","unset"]},"-webkit-user-select":{alias:true,inherited:false,supports:0,values:["-moz-all","-moz-none","-moz-text","all","auto","element","elements","inherit","initial","none","text","toggle","tri-state","unset"]}};module.exports = {cssProperties};

/***/ },
/* 6 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(setImmediate) {"use strict";

	/*
	 * A sham for https://dxr.mozilla.org/mozilla-central/source/toolkit/modules/Services.jsm
	 */

	const L10N = __webpack_require__(9);
	const Services = {};

	Services.strings = {
	  createBundle: function (name) {
	    if (typeof name !== "object") {
	      throw new Error(`Cannot implement 'Services.strings.createBundle'. Use 'new L10N(require(${ name }))' instead, or call this with the return value of a require, like 'Services.strings.createBundle(require(${ name }))'.`);
	    }
	    return new L10N(name);
	  }
	};

	Services.appinfo = {
	  OS: 'Darwin' };

	// Probably
	Services.telemetry = {
	  getHistogramById() {
	    return {
	      add() {}
	    };
	  }
	};

	Services.obs = {
	  addObserver: function () {},
	  removeObserver: function () {}
	};
	Services.prefs = __webpack_require__(10);

	Services.tm = {
	  currentThread: {
	    dispatch: function (cb) {
	      setImmediate(cb);
	    }
	  },
	  mainThread: {
	    dispatch: function (cb) {
	      setImmediate(cb);
	    }
	  }
	};

	Services.scriptloader = {
	  /**
	   * Implements a subset of loadSubScript, to inject scripts into a window, rather
	   * than an arbitrary scope.
	   * @see https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/mozIJSSubScriptLoader#loadSubScript%28%29
	   */
	  loadSubScript: function (url, target, charset = "utf8") {
	    // Only implement scenario where target has reference to a document
	    if (!target || !target.document) {
	      throw new Error(`target in loadSubScript does not have a document.`);
	    }
	    return new Promise(function (resolve) {
	      let script = target.document.createElement("script");
	      script.src = url;
	      script.onload = resolve;
	      target.document.body.appendChild(script);
	    });
	  }
	};

	module.exports.Services = Services;
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(7).setImmediate))

/***/ },
/* 7 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(setImmediate, clearImmediate) {var nextTick = __webpack_require__(8).nextTick;
	var apply = Function.prototype.apply;
	var slice = Array.prototype.slice;
	var immediateIds = {};
	var nextImmediateId = 0;

	// DOM APIs, for completeness

	exports.setTimeout = function() {
	  return new Timeout(apply.call(setTimeout, window, arguments), clearTimeout);
	};
	exports.setInterval = function() {
	  return new Timeout(apply.call(setInterval, window, arguments), clearInterval);
	};
	exports.clearTimeout =
	exports.clearInterval = function(timeout) { timeout.close(); };

	function Timeout(id, clearFn) {
	  this._id = id;
	  this._clearFn = clearFn;
	}
	Timeout.prototype.unref = Timeout.prototype.ref = function() {};
	Timeout.prototype.close = function() {
	  this._clearFn.call(window, this._id);
	};

	// Does not start the time, just sets up the members needed.
	exports.enroll = function(item, msecs) {
	  clearTimeout(item._idleTimeoutId);
	  item._idleTimeout = msecs;
	};

	exports.unenroll = function(item) {
	  clearTimeout(item._idleTimeoutId);
	  item._idleTimeout = -1;
	};

	exports._unrefActive = exports.active = function(item) {
	  clearTimeout(item._idleTimeoutId);

	  var msecs = item._idleTimeout;
	  if (msecs >= 0) {
	    item._idleTimeoutId = setTimeout(function onTimeout() {
	      if (item._onTimeout)
	        item._onTimeout();
	    }, msecs);
	  }
	};

	// That's not how node.js implements it but the exposed api is the same.
	exports.setImmediate = typeof setImmediate === "function" ? setImmediate : function(fn) {
	  var id = nextImmediateId++;
	  var args = arguments.length < 2 ? false : slice.call(arguments, 1);

	  immediateIds[id] = true;

	  nextTick(function onNextTick() {
	    if (immediateIds[id]) {
	      // fn.call() is faster so we optimize for the common use-case
	      // @see http://jsperf.com/call-apply-segu
	      if (args) {
	        fn.apply(null, args);
	      } else {
	        fn.call(null);
	      }
	      // Prevent ids from leaking
	      exports.clearImmediate(id);
	    }
	  });

	  return id;
	};

	exports.clearImmediate = typeof clearImmediate === "function" ? clearImmediate : function(id) {
	  delete immediateIds[id];
	};
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(7).setImmediate, __webpack_require__(7).clearImmediate))

/***/ },
/* 8 */
/***/ function(module, exports) {

	// shim for using process in browser

	var process = module.exports = {};
	var queue = [];
	var draining = false;
	var currentQueue;
	var queueIndex = -1;

	function cleanUpNextTick() {
	    draining = false;
	    if (currentQueue.length) {
	        queue = currentQueue.concat(queue);
	    } else {
	        queueIndex = -1;
	    }
	    if (queue.length) {
	        drainQueue();
	    }
	}

	function drainQueue() {
	    if (draining) {
	        return;
	    }
	    var timeout = setTimeout(cleanUpNextTick);
	    draining = true;

	    var len = queue.length;
	    while(len) {
	        currentQueue = queue;
	        queue = [];
	        while (++queueIndex < len) {
	            if (currentQueue) {
	                currentQueue[queueIndex].run();
	            }
	        }
	        queueIndex = -1;
	        len = queue.length;
	    }
	    currentQueue = null;
	    draining = false;
	    clearTimeout(timeout);
	}

	process.nextTick = function (fun) {
	    var args = new Array(arguments.length - 1);
	    if (arguments.length > 1) {
	        for (var i = 1; i < arguments.length; i++) {
	            args[i - 1] = arguments[i];
	        }
	    }
	    queue.push(new Item(fun, args));
	    if (queue.length === 1 && !draining) {
	        setTimeout(drainQueue, 0);
	    }
	};

	// v8 likes predictible objects
	function Item(fun, array) {
	    this.fun = fun;
	    this.array = array;
	}
	Item.prototype.run = function () {
	    this.fun.apply(null, this.array);
	};
	process.title = 'browser';
	process.browser = true;
	process.env = {};
	process.argv = [];
	process.version = ''; // empty string to avoid regexp issues
	process.versions = {};

	function noop() {}

	process.on = noop;
	process.addListener = noop;
	process.once = noop;
	process.off = noop;
	process.removeListener = noop;
	process.removeAllListeners = noop;
	process.emit = noop;

	process.binding = function (name) {
	    throw new Error('process.binding is not supported');
	};

	process.cwd = function () { return '/' };
	process.chdir = function (dir) {
	    throw new Error('process.chdir is not supported');
	};
	process.umask = function() { return 0; };


/***/ },
/* 9 */
/***/ function(module, exports) {

	"use strict";

	/**
	 * Import a .properties file via properties-loader (just specify .properties) and pass
	 * that object into this constructor to get methods matching nsIStringBundle:
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIStringBundle
	 */

	function L10N(props) {
	  this.props = props;
	}

	L10N.prototype.GetStringFromName = function (name) {
	  return this.props[name];
	};

	L10N.prototype.formatStringFromName = function (name, values) {
	  var result = this.GetStringFromName(name);

	  for (var i = 0; i < values.length; i++) {
	    result = result.replace(/%S/, values[i]);
	  }

	  return result;
	};

	module.exports = L10N;

/***/ },
/* 10 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";

	let DEFAULTS = __webpack_require__(11);
	// TODO Can make this localStorage or something in the future?
	let storage = JSON.parse(JSON.stringify(DEFAULTS));

	const PREF_INVALID = exports.PREF_INVALID = 0;
	const PREF_STRING = exports.PREF_STRING = 32;
	const PREF_INT = exports.PREF_INT = 64;
	const PREF_BOOL = exports.PREF_BOOL = 128;

	/**
	 * Returns a `Pref` object containing the following properties:
	 *
	 * `value` - The primitive value of the stored preference.
	 * `type` - The enum type of the pref. Can be PREF_INVALID, PREF_STRING, PREF_INT, or PREF_BOOL.
	 */
	function findPref(pref) {
	  let branchNames = pref.split(".");
	  let branch = storage;

	  for (let branchName of branchNames) {
	    branch = branch[branchName];
	    if (!branch) {
	      branch = {};
	    }
	  }

	  return branch;
	}

	function setPrefValue(pref, value) {
	  let obj = findPref(pref);
	  obj.value = value;
	}

	function getPrefValue(pref) {
	  return findPref(pref).value;
	}

	const addObserver = exports.addObserver = function (domain, observer, holdWeak) {
	  console.error("TODO implement addObserver");
	};

	const removeObserver = exports.removeObserver = function (domain, observer, holdWeak) {
	  console.error("TODO implement removeObserver");
	};

	const resetPrefs = exports.resetPrefs = function () {
	  storage = JSON.parse(JSON.stringify(DEFAULTS));
	};

	const getPrefType = exports.getPrefType = function (pref) {
	  return findPref(pref).type;
	};

	const setBoolPref = exports.setBoolPref = function (pref, value) {
	  if (typeof value !== "boolean") {
	    throw new Error("Cannot setBoolPref without a boolean.");
	  }
	  if (getPrefType(pref) && getPrefType(pref) !== PREF_BOOL) {
	    throw new Error("Can only call setBoolPref on boolean type prefs.");
	  }
	  setPrefValue(pref, value);
	};

	exports.setCharPref = function (pref, value) {
	  if (typeof value !== "string") {
	    throw new Error("Cannot setCharPref without a string.");
	  }
	  if (getPrefType(pref) && getPrefType(pref) !== PREF_STRING) {
	    throw new Error("Can only call setCharPref on string type prefs.");
	  }
	  setPrefValue(pref, value);
	};

	exports.setIntPref = function (pref, value) {
	  if (typeof value !== "number" && parseInt(value) !== value) {
	    throw new Error("Cannot setCharPref without an integer.");
	  }
	  if (getPrefType(pref) && getPrefType(pref) !== PREF_INT) {
	    throw new Error("Can only call setIntPref on number type prefs.");
	  }
	  setPrefValue(pref, value);
	};

	exports.getBoolPref = function (pref) {
	  if (getPrefType(pref) !== PREF_BOOL) {
	    throw new Error("Can only call getBoolPref on boolean type prefs.");
	  }
	  return getPrefValue(pref);
	};

	exports.getCharPref = function (pref) {
	  if (getPrefType(pref) !== PREF_STRING) {
	    throw new Error("Can only call getCharPref on string type prefs.");
	  }
	  return getPrefValue(pref);
	};

	exports.getIntPref = function (pref) {
	  if (getPrefType(pref) !== PREF_INT) {
	    throw new Error("Can only call getIntPref on number type prefs.");
	  }
	  return getPrefValue(pref);
	};

	exports.getComplexValue = function (pref) {
	  // XXX: Implement me
	  return {
	    data: ''
	  };
	};

	exports.getBranch = function (pref) {
	  return {
	    addObserver: function () {},
	    removeObserver: function () {}
	  };
	};

	exports.prefHasUserValue = function (pref) {
	  // XXX: Implement me
	  return false;
	};

/***/ },
/* 11 */
/***/ function(module, exports) {

	module.exports = {
		"devtools": {
			"devedition": {
				"promo": {
					"shown": {
						"value": false,
						"type": 128
					},
					"url": {
						"value": "https://www.mozilla.org/firefox/developer/?utm_source=firefox-dev-tools&utm_medium=firefox-browser&utm_content=betadoorhanger",
						"type": 32
					},
					"enabled": {
						"value": false,
						"type": 128
					}
				}
			},
			"errorconsole": {
				"enabled": {
					"value": false,
					"type": 128
				}
			},
			"toolbar": {
				"enabled": {
					"value": true,
					"type": 128
				},
				"visible": {
					"value": false,
					"type": 128
				}
			},
			"webide": {
				"enabled": {
					"value": true,
					"type": 128
				}
			},
			"toolbox": {
				"footer": {
					"height": {
						"value": 250,
						"type": 64
					}
				},
				"sidebar": {
					"width": {
						"value": 500,
						"type": 64
					}
				},
				"host": {
					"value": "bottom",
					"type": 32
				},
				"previousHost": {
					"value": "side",
					"type": 32
				},
				"selectedTool": {
					"value": "webconsole",
					"type": 32
				},
				"toolbarSpec": {
					"value": "[\"splitconsole\", \"paintflashing toggle\",\"tilt toggle\",\"scratchpad\",\"resize toggle\",\"eyedropper\",\"screenshot --fullpage\", \"rulers\", \"measure\"]",
					"type": 32
				},
				"sideEnabled": {
					"value": true,
					"type": 128
				},
				"zoomValue": {
					"value": "1",
					"type": 32
				},
				"splitconsoleEnabled": {
					"value": false,
					"type": 128
				},
				"splitconsoleHeight": {
					"value": 100,
					"type": 64
				}
			},
			"inspector": {
				"enabled": {
					"value": true,
					"type": 128
				},
				"activeSidebar": {
					"value": "ruleview",
					"type": 32
				},
				"remote": {
					"value": false,
					"type": 128
				},
				"show_pseudo_elements": {
					"value": false,
					"type": 128
				},
				"imagePreviewTooltipSize": {
					"value": 300,
					"type": 64
				},
				"showUserAgentStyles": {
					"value": false,
					"type": 128
				},
				"showAllAnonymousContent": {
					"value": false,
					"type": 128
				},
				"mdnDocsTooltip": {
					"enabled": {
						"value": true,
						"type": 128
					}
				}
			},
			"defaultColorUnit": {
				"value": "authored",
				"type": 32
			},
			"debugger": {
				"enabled": {
					"value": true,
					"type": 128
				},
				"workers": {
					"value": false,
					"type": 128
				},
				"promise": {
					"value": false,
					"type": 128
				},
				"source-maps-enabled": {
					"value": false,
					"type": 128
				},
				"auto-black-box": {
					"value": false,
					"type": 128
				}
			},
			"memory": {
				"enabled": {
					"value": false,
					"type": 128
				}
			},
			"performance": {
				"enabled": {
					"value": true,
					"type": 128
				},
				"ui": {
					"experimental": {
						"value": false,
						"type": 128
					}
				}
			},
			"cache": {
				"disabled": {
					"value": false,
					"type": 128
				}
			},
			"serviceWorkers": {
				"testing": {
					"enabled": {
						"value": false,
						"type": 128
					}
				}
			},
			"netmonitor": {
				"enabled": {
					"value": true,
					"type": 128
				},
				"statistics": {
					"value": true,
					"type": 128
				},
				"filters": {
					"value": "[\"all\"]",
					"type": 32
				},
				"har": {
					"defaultLogDir": {
						"value": "",
						"type": 32
					},
					"defaultFileName": {
						"value": "Archive %y-%m-%d %H-%M-%S",
						"type": 32
					},
					"jsonp": {
						"value": false,
						"type": 128
					},
					"jsonpCallback": {
						"value": "",
						"type": 32
					},
					"includeResponseBodies": {
						"value": true,
						"type": 128
					},
					"compress": {
						"value": false,
						"type": 128
					},
					"forceExport": {
						"value": false,
						"type": 128
					},
					"pageLoadedTimeout": {
						"value": 1500,
						"type": 64
					},
					"enableAutoExportToFile": {
						"value": false,
						"type": 128
					}
				}
			},
			"tilt": {
				"enabled": {
					"value": true,
					"type": 128
				},
				"intro_transition": {
					"value": true,
					"type": 128
				},
				"outro_transition": {
					"value": true,
					"type": 128
				}
			},
			"scratchpad": {
				"recentFilesMax": {
					"value": 10,
					"type": 64
				},
				"lineNumbers": {
					"value": true,
					"type": 128
				},
				"wrapText": {
					"value": false,
					"type": 128
				},
				"showTrailingSpace": {
					"value": false,
					"type": 128
				},
				"editorFontSize": {
					"value": 12,
					"type": 64
				},
				"enableAutocompletion": {
					"value": true,
					"type": 128
				}
			},
			"storage": {
				"enabled": {
					"value": false,
					"type": 128
				}
			},
			"styleeditor": {
				"enabled": {
					"value": true,
					"type": 128
				},
				"showMediaSidebar": {
					"value": true,
					"type": 128
				},
				"mediaSidebarWidth": {
					"value": 238,
					"type": 64
				},
				"navSidebarWidth": {
					"value": 245,
					"type": 64
				},
				"transitions": {
					"value": true,
					"type": 128
				}
			},
			"shadereditor": {
				"enabled": {
					"value": false,
					"type": 128
				}
			},
			"canvasdebugger": {
				"enabled": {
					"value": false,
					"type": 128
				}
			},
			"webaudioeditor": {
				"enabled": {
					"value": false,
					"type": 128
				},
				"inspectorWidth": {
					"value": 300,
					"type": 64
				}
			},
			"webconsole": {
				"filter": {
					"network": {
						"value": true,
						"type": 128
					},
					"networkinfo": {
						"value": false,
						"type": 128
					},
					"netwarn": {
						"value": true,
						"type": 128
					},
					"netxhr": {
						"value": false,
						"type": 128
					},
					"csserror": {
						"value": true,
						"type": 128
					},
					"cssparser": {
						"value": false,
						"type": 128
					},
					"csslog": {
						"value": false,
						"type": 128
					},
					"exception": {
						"value": true,
						"type": 128
					},
					"jswarn": {
						"value": true,
						"type": 128
					},
					"jslog": {
						"value": false,
						"type": 128
					},
					"error": {
						"value": true,
						"type": 128
					},
					"warn": {
						"value": true,
						"type": 128
					},
					"info": {
						"value": true,
						"type": 128
					},
					"log": {
						"value": true,
						"type": 128
					},
					"secerror": {
						"value": true,
						"type": 128
					},
					"secwarn": {
						"value": true,
						"type": 128
					},
					"serviceworkers": {
						"value": true,
						"type": 128
					},
					"sharedworkers": {
						"value": false,
						"type": 128
					},
					"windowlessworkers": {
						"value": false,
						"type": 128
					},
					"servererror": {
						"value": false,
						"type": 128
					},
					"serverwarn": {
						"value": false,
						"type": 128
					},
					"serverinfo": {
						"value": false,
						"type": 128
					},
					"serverlog": {
						"value": false,
						"type": 128
					}
				},
				"fontSize": {
					"value": 0,
					"type": 64
				},
				"inputHistoryCount": {
					"value": 50,
					"type": 64
				},
				"persistlog": {
					"value": false,
					"type": 128
				},
				"timestampMessages": {
					"value": false,
					"type": 128
				}
			},
			"browserconsole": {
				"filter": {
					"network": {
						"value": true,
						"type": 128
					},
					"networkinfo": {
						"value": false,
						"type": 128
					},
					"netwarn": {
						"value": true,
						"type": 128
					},
					"netxhr": {
						"value": false,
						"type": 128
					},
					"csserror": {
						"value": true,
						"type": 128
					},
					"cssparser": {
						"value": false,
						"type": 128
					},
					"csslog": {
						"value": false,
						"type": 128
					},
					"exception": {
						"value": true,
						"type": 128
					},
					"jswarn": {
						"value": true,
						"type": 128
					},
					"jslog": {
						"value": true,
						"type": 128
					},
					"error": {
						"value": true,
						"type": 128
					},
					"warn": {
						"value": true,
						"type": 128
					},
					"info": {
						"value": true,
						"type": 128
					},
					"log": {
						"value": true,
						"type": 128
					},
					"secerror": {
						"value": true,
						"type": 128
					},
					"secwarn": {
						"value": true,
						"type": 128
					},
					"serviceworkers": {
						"value": true,
						"type": 128
					},
					"sharedworkers": {
						"value": true,
						"type": 128
					},
					"windowlessworkers": {
						"value": true,
						"type": 128
					},
					"servererror": {
						"value": false,
						"type": 128
					},
					"serverwarn": {
						"value": false,
						"type": 128
					},
					"serverinfo": {
						"value": false,
						"type": 128
					},
					"serverlog": {
						"value": false,
						"type": 128
					}
				}
			},
			"hud": {
				"loglimit": {
					"network": {
						"value": 1000,
						"type": 64
					},
					"cssparser": {
						"value": 1000,
						"type": 64
					},
					"exception": {
						"value": 1000,
						"type": 64
					},
					"console": {
						"value": 1000,
						"type": 64
					}
				}
			},
			"eyedropper": {
				"zoom": {
					"value": 6,
					"type": 64
				}
			},
			"editor": {
				"tabsize": {
					"value": 2,
					"type": 64
				},
				"expandtab": {
					"value": true,
					"type": 128
				},
				"keymap": {
					"value": "default",
					"type": 32
				},
				"autoclosebrackets": {
					"value": true,
					"type": 128
				},
				"detectindentation": {
					"value": true,
					"type": 128
				},
				"enableCodeFolding": {
					"value": true,
					"type": 128
				},
				"autocomplete": {
					"value": true,
					"type": 128
				}
			},
			"fontinspector": {
				"enabled": {
					"value": true,
					"type": 128
				}
			},
			"telemetry": {
				"tools": {
					"opened": {
						"version": {
							"value": "{}",
							"type": 32
						}
					}
				}
			},
			"jsonview": {
				"enabled": {
					"value": false,
					"type": 128
				}
			}
		}
	};

/***/ },
/* 12 */
/***/ function(module, exports, __webpack_require__) {

	/* This Source Code Form is subject to the terms of the Mozilla Public
	 * License, v. 2.0. If a copy of the MPL was not distributed with this
	 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

	"use strict"

	/* General utilities used throughout devtools. */

	;

	var _this = this;

	var _require = __webpack_require__(1);

	var Ci = _require.Ci;
	var Cu = _require.Cu;
	var Cc = _require.Cc;
	var components = _require.components;

	var Services = __webpack_require__(6);
	var promise = __webpack_require__(13);

	var _require2 = __webpack_require__(14);

	const FileUtils = _require2.FileUtils;

	/**
	 * Turn the error |aError| into a string, without fail.
	 */

	exports.safeErrorString = function safeErrorString(aError) {
	  try {
	    let errorString = aError.toString();
	    if (typeof errorString == "string") {
	      // Attempt to attach a stack to |errorString|. If it throws an error, or
	      // isn't a string, don't use it.
	      try {
	        if (aError.stack) {
	          let stack = aError.stack.toString();
	          if (typeof stack == "string") {
	            errorString += "\nStack: " + stack;
	          }
	        }
	      } catch (ee) {}

	      // Append additional line and column number information to the output,
	      // since it might not be part of the stringified error.
	      if (typeof aError.lineNumber == "number" && typeof aError.columnNumber == "number") {
	        errorString += "Line: " + aError.lineNumber + ", column: " + aError.columnNumber;
	      }

	      return errorString;
	    }
	  } catch (ee) {}

	  // We failed to find a good error description, so do the next best thing.
	  return Object.prototype.toString.call(aError);
	};

	/**
	 * Report that |aWho| threw an exception, |aException|.
	 */
	exports.reportException = function reportException(aWho, aException) {
	  let msg = aWho + " threw an exception: " + exports.safeErrorString(aException);

	  dump(msg + "\n");

	  if (Cu && Cu.reportError) {
	    /*
	     * Note that the xpcshell test harness registers an observer for
	     * console messages, so when we're running tests, this will cause
	     * the test to quit.
	     */
	    Cu.reportError(msg);
	  }
	};

	/**
	 * Given a handler function that may throw, return an infallible handler
	 * function that calls the fallible handler, and logs any exceptions it
	 * throws.
	 *
	 * @param aHandler function
	 *      A handler function, which may throw.
	 * @param aName string
	 *      A name for aHandler, for use in error messages. If omitted, we use
	 *      aHandler.name.
	 *
	 * (SpiderMonkey does generate good names for anonymous functions, but we
	 * don't have a way to get at them from JavaScript at the moment.)
	 */
	exports.makeInfallible = function makeInfallible(aHandler, aName) {
	  if (!aName) aName = aHandler.name;

	  return function () /* arguments */{
	    try {
	      return aHandler.apply(this, arguments);
	    } catch (ex) {
	      let who = "Handler function";
	      if (aName) {
	        who += " " + aName;
	      }
	      return exports.reportException(who, ex);
	    }
	  };
	};
	/**
	 * Interleaves two arrays element by element, returning the combined array, like
	 * a zip. In the case of arrays with different sizes, undefined values will be
	 * interleaved at the end along with the extra values of the larger array.
	 *
	 * @param Array a
	 * @param Array b
	 * @returns Array
	 *          The combined array, in the form [a1, b1, a2, b2, ...]
	 */
	exports.zip = function zip(a, b) {
	  if (!b) {
	    return a;
	  }
	  if (!a) {
	    return b;
	  }
	  const pairs = [];
	  for (let i = 0, aLength = a.length, bLength = b.length; i < aLength || i < bLength; i++) {
	    pairs.push([a[i], b[i]]);
	  }
	  return pairs;
	};

	/**
	 * Converts an object into an array with 2-element arrays as key/value
	 * pairs of the object. `{ foo: 1, bar: 2}` would become
	 * `[[foo, 1], [bar 2]]` (order not guaranteed);
	 *
	 * @param object obj
	 * @returns array
	 */
	exports.entries = function entries(obj) {
	  return Object.keys(obj).map(function (k) {
	    return [k, obj[k]];
	  });
	};

	/**
	 * Takes an array of 2-element arrays as key/values pairs and
	 * constructs an object using them.
	 */
	exports.toObject = function (arr) {
	  const obj = {};
	  for (let pair of arr) {
	    obj[pair[0]] = pair[1];
	  }
	  return obj;
	};

	/**
	 * Composes the given functions into a single function, which will
	 * apply the results of each function right-to-left, starting with
	 * applying the given arguments to the right-most function.
	 * `compose(foo, bar, baz)` === `args => foo(bar(baz(args)`
	 *
	 * @param ...function funcs
	 * @returns function
	 */
	exports.compose = function compose(...funcs) {
	  return function (...args) {
	    const initialValue = funcs[funcs.length - 1].apply(null, args);
	    const leftFuncs = funcs.slice(0, -1);
	    return leftFuncs.reduceRight(function (composed, f) {
	      return f(composed);
	    }, initialValue);
	  };
	};

	/**
	 * Waits for the next tick in the event loop to execute a callback.
	 */
	exports.executeSoon = function executeSoon(aFn) {
	  setTimeout(aFn, 0);
	};

	/**
	 * Waits for the next tick in the event loop.
	 *
	 * @return Promise
	 *         A promise that is resolved after the next tick in the event loop.
	 */
	exports.waitForTick = function waitForTick() {
	  let deferred = promise.defer();
	  exports.executeSoon(deferred.resolve);
	  return deferred.promise;
	};

	/**
	 * Waits for the specified amount of time to pass.
	 *
	 * @param number aDelay
	 *        The amount of time to wait, in milliseconds.
	 * @return Promise
	 *         A promise that is resolved after the specified amount of time passes.
	 */
	exports.waitForTime = function waitForTime(aDelay) {
	  let deferred = promise.defer();
	  setTimeout(deferred.resolve, aDelay);
	  return deferred.promise;
	};

	/**
	 * Like Array.prototype.forEach, but doesn't cause jankiness when iterating over
	 * very large arrays by yielding to the browser and continuing execution on the
	 * next tick.
	 *
	 * @param Array aArray
	 *        The array being iterated over.
	 * @param Function aFn
	 *        The function called on each item in the array. If a promise is
	 *        returned by this function, iterating over the array will be paused
	 *        until the respective promise is resolved.
	 * @returns Promise
	 *          A promise that is resolved once the whole array has been iterated
	 *          over, and all promises returned by the aFn callback are resolved.
	 */
	exports.yieldingEach = function yieldingEach(aArray, aFn) {
	  const deferred = promise.defer();

	  let i = 0;
	  let len = aArray.length;
	  let outstanding = [deferred.promise];

	  (function loop() {
	    const start = Date.now();

	    while (i < len) {
	      // Don't block the main thread for longer than 16 ms at a time. To
	      // maintain 60fps, you have to render every frame in at least 16ms; we
	      // aren't including time spent in non-JS here, but this is Good
	      // Enough(tm).
	      if (Date.now() - start > 16) {
	        exports.executeSoon(loop);
	        return;
	      }

	      try {
	        outstanding.push(aFn(aArray[i], i++));
	      } catch (e) {
	        deferred.reject(e);
	        return;
	      }
	    }

	    deferred.resolve();
	  })();

	  return promise.all(outstanding);
	};

	/**
	 * Like XPCOMUtils.defineLazyGetter, but with a |this| sensitive getter that
	 * allows the lazy getter to be defined on a prototype and work correctly with
	 * instances.
	 *
	 * @param Object aObject
	 *        The prototype object to define the lazy getter on.
	 * @param String aKey
	 *        The key to define the lazy getter on.
	 * @param Function aCallback
	 *        The callback that will be called to determine the value. Will be
	 *        called with the |this| value of the current instance.
	 */
	exports.defineLazyPrototypeGetter = function defineLazyPrototypeGetter(aObject, aKey, aCallback) {
	  Object.defineProperty(aObject, aKey, {
	    configurable: true,
	    get: function () {
	      const value = aCallback.call(this);

	      Object.defineProperty(this, aKey, {
	        configurable: true,
	        writable: true,
	        value: value
	      });

	      return value;
	    }
	  });
	};

	/**
	 * Safely get the property value from a Debugger.Object for a given key. Walks
	 * the prototype chain until the property is found.
	 *
	 * @param Debugger.Object aObject
	 *        The Debugger.Object to get the value from.
	 * @param String aKey
	 *        The key to look for.
	 * @return Any
	 */
	exports.getProperty = function getProperty(aObj, aKey) {
	  let root = aObj;
	  try {
	    do {
	      const desc = aObj.getOwnPropertyDescriptor(aKey);
	      if (desc) {
	        if ("value" in desc) {
	          return desc.value;
	        }
	        // Call the getter if it's safe.
	        return exports.hasSafeGetter(desc) ? desc.get.call(root).return : undefined;
	      }
	      aObj = aObj.proto;
	    } while (aObj);
	  } catch (e) {
	    // If anything goes wrong report the error and return undefined.
	    exports.reportException("getProperty", e);
	  }
	  return undefined;
	};

	/**
	 * Determines if a descriptor has a getter which doesn't call into JavaScript.
	 *
	 * @param Object aDesc
	 *        The descriptor to check for a safe getter.
	 * @return Boolean
	 *         Whether a safe getter was found.
	 */
	exports.hasSafeGetter = function hasSafeGetter(aDesc) {
	  // Scripted functions that are CCWs will not appear scripted until after
	  // unwrapping.
	  try {
	    let fn = aDesc.get.unwrap();
	    return fn && fn.callable && fn.class == "Function" && fn.script === undefined;
	  } catch (e) {
	    // Avoid exception 'Object in compartment marked as invisible to Debugger'
	    return false;
	  }
	};

	/**
	 * Check if it is safe to read properties and execute methods from the given JS
	 * object. Safety is defined as being protected from unintended code execution
	 * from content scripts (or cross-compartment code).
	 *
	 * See bugs 945920 and 946752 for discussion.
	 *
	 * @type Object aObj
	 *       The object to check.
	 * @return Boolean
	 *         True if it is safe to read properties from aObj, or false otherwise.
	 */
	exports.isSafeJSObject = function isSafeJSObject(aObj) {
	  // If we are running on a worker thread, Cu is not available. In this case,
	  // we always return false, just to be on the safe side.
	  if (isWorker) {
	    return false;
	  }

	  if (Cu.getGlobalForObject(aObj) == Cu.getGlobalForObject(exports.isSafeJSObject)) {
	    return true; // aObj is not a cross-compartment wrapper.
	  }

	  let principal = Cu.getObjectPrincipal(aObj);
	  if (Services.scriptSecurityManager.isSystemPrincipal(principal)) {
	    return true; // allow chrome objects
	  }

	  return Cu.isXrayWrapper(aObj);
	};

	exports.dumpn = function dumpn(str) {
	  if (exports.dumpn.wantLogging) {
	    console.log("DBG-SERVER: " + str + "\n");
	  }
	};

	// We want wantLogging to be writable. The exports object is frozen by the
	// loader, so define it on dumpn instead.
	exports.dumpn.wantLogging = false;

	/**
	 * A verbose logger for low-level tracing.
	 */
	exports.dumpv = function (msg) {
	  if (exports.dumpv.wantVerbose) {
	    exports.dumpn(msg);
	  }
	};

	// We want wantLogging to be writable. The exports object is frozen by the
	// loader, so define it on dumpn instead.
	exports.dumpv.wantVerbose = false;

	/**
	 * Utility function for updating an object with the properties of
	 * other objects.
	 *
	 * @param aTarget Object
	 *        The object being updated.
	 * @param aNewAttrs Object
	 *        The rest params are objects to update aTarget with. You
	 *        can pass as many as you like.
	 */
	exports.update = function update(aTarget, ...aArgs) {
	  for (let attrs of aArgs) {
	    for (let key in attrs) {
	      let desc = Object.getOwnPropertyDescriptor(attrs, key);

	      if (desc) {
	        Object.defineProperty(aTarget, key, desc);
	      }
	    }
	  }

	  return aTarget;
	};

	/**
	 * Utility function for getting the values from an object as an array
	 *
	 * @param aObject Object
	 *        The object to iterate over
	 */
	exports.values = function values(aObject) {
	  return Object.keys(aObject).map(function (k) {
	    return aObject[k];
	  });
	};

	/**
	 * Defines a getter on a specified object that will be created upon first use.
	 *
	 * @param aObject
	 *        The object to define the lazy getter on.
	 * @param aName
	 *        The name of the getter to define on aObject.
	 * @param aLambda
	 *        A function that returns what the getter should return.  This will
	 *        only ever be called once.
	 */
	exports.defineLazyGetter = function defineLazyGetter(aObject, aName, aLambda) {
	  Object.defineProperty(aObject, aName, {
	    get: function () {
	      delete aObject[aName];
	      return aObject[aName] = aLambda.apply(aObject);
	    },
	    configurable: true,
	    enumerable: true
	  });
	};

	// DEPRECATED: use DevToolsUtils.assert(condition, message) instead!
	let haveLoggedDeprecationMessage = false;
	exports.dbg_assert = function dbg_assert(cond, e) {
	  if (!haveLoggedDeprecationMessage) {
	    haveLoggedDeprecationMessage = true;
	    const deprecationMessage = "DevToolsUtils.dbg_assert is deprecated! Use DevToolsUtils.assert instead!\n" + Error().stack;
	    dump(deprecationMessage);
	    if (typeof console === "object" && console && console.warn) {
	      console.warn(deprecationMessage);
	    }
	  }

	  if (!cond) {
	    return e;
	  }
	};

	var _require3 = __webpack_require__(15);

	const AppConstants = _require3.AppConstants;

	/**
	 * No operation. The empty function.
	 */

	exports.noop = function () {};

	function reallyAssert(condition, message) {
	  if (!condition) {
	    const err = new Error("Assertion failure: " + message);
	    exports.reportException("DevToolsUtils.assert", err);
	    throw err;
	  }
	}

	/**
	 * DevToolsUtils.assert(condition, message)
	 *
	 * @param Boolean condition
	 * @param String message
	 *
	 * Assertions are enabled when any of the following are true:
	 *   - This is a DEBUG_JS_MODULES build
	 *   - This is a DEBUG build
	 *   - DevToolsUtils.testing is set to true
	 *
	 * If assertions are enabled, then `condition` is checked and if false-y, the
	 * assertion failure is logged and then an error is thrown.
	 *
	 * If assertions are not enabled, then this function is a no-op.
	 *
	 * This is an improvement over `dbg_assert`, which doesn't actually cause any
	 * fatal behavior, and is therefore much easier to accidentally ignore.
	 */
	Object.defineProperty(exports, "assert", {
	  get: function () {
	    return AppConstants.DEBUG || AppConstants.DEBUG_JS_MODULES || _this.testing ? reallyAssert : exports.noop;
	  }
	});

	/**
	 * Defines a getter on a specified object for a module.  The module will not
	 * be imported until first use.
	 *
	 * @param aObject
	 *        The object to define the lazy getter on.
	 * @param aName
	 *        The name of the getter to define on aObject for the module.
	 * @param aResource
	 *        The URL used to obtain the module.
	 * @param aSymbol
	 *        The name of the symbol exported by the module.
	 *        This parameter is optional and defaults to aName.
	 */
	exports.defineLazyModuleGetter = function defineLazyModuleGetter(aObject, aName, aResource, aSymbol) {
	  this.defineLazyGetter(aObject, aName, function XPCU_moduleLambda() {
	    var temp = {};
	    Cu.import(aResource, temp);
	    return temp[aSymbol || aName];
	  });
	};

	var _require4 = __webpack_require__(16);

	const NetUtil = _require4.NetUtil;

	var _require5 = __webpack_require__(17);

	const TextDecoder = _require5.TextDecoder;
	const OS = _require5.OS;

	exports.defineLazyGetter(this, "NetworkHelper", function () {
	  return __webpack_require__(18);
	});

	/**
	 * Performs a request to load the desired URL and returns a promise.
	 *
	 * @param aURL String
	 *        The URL we will request.
	 * @param aOptions Object
	 *        An object with the following optional properties:
	 *        - loadFromCache: if false, will bypass the cache and
	 *          always load fresh from the network (default: true)
	 *        - policy: the nsIContentPolicy type to apply when fetching the URL
	 *        - window: the window to get the loadGroup from
	 *        - charset: the charset to use if the channel doesn't provide one
	 * @returns Promise that resolves with an object with the following members on
	 *          success:
	 *           - content: the document at that URL, as a string,
	 *           - contentType: the content type of the document
	 *
	 *          If an error occurs, the promise is rejected with that error.
	 *
	 * XXX: It may be better to use nsITraceableChannel to get to the sources
	 * without relying on caching when we can (not for eval, etc.):
	 * http://www.softwareishard.com/blog/firebug/nsitraceablechannel-intercept-http-traffic/
	 */
	function mainThreadFetch(aURL, aOptions = { loadFromCache: true,
	  policy: Ci.nsIContentPolicy.TYPE_OTHER,
	  window: null,
	  charset: null }) {
	  // Create a channel.
	  let url = aURL.split(" -> ").pop();
	  let channel;
	  try {
	    channel = newChannelForURL(url, aOptions);
	  } catch (ex) {
	    return promise.reject(ex);
	  }

	  // Set the channel options.
	  channel.loadFlags = aOptions.loadFromCache ? channel.LOAD_FROM_CACHE : channel.LOAD_BYPASS_CACHE;

	  if (aOptions.window) {
	    // Respect private browsing.
	    channel.loadGroup = aOptions.window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIWebNavigation).QueryInterface(Ci.nsIDocumentLoader).loadGroup;
	  }

	  let deferred = promise.defer();
	  let onResponse = function (stream, status, request) {
	    if (!components.isSuccessCode(status)) {
	      deferred.reject(new Error(`Failed to fetch ${ url }. Code ${ status }.`));
	      return;
	    }

	    try {
	      // We cannot use NetUtil to do the charset conversion as if charset
	      // information is not available and our default guess is wrong the method
	      // might fail and we lose the stream data. This means we can't fall back
	      // to using the locale default encoding (bug 1181345).

	      // Read and decode the data according to the locale default encoding.
	      let available = stream.available();
	      let source = NetUtil.readInputStreamToString(stream, available);
	      stream.close();

	      // If the channel or the caller has correct charset information, the
	      // content will be decoded correctly. If we have to fall back to UTF-8 and
	      // the guess is wrong, the conversion fails and convertToUnicode returns
	      // the input unmodified. Essentially we try to decode the data as UTF-8
	      // and if that fails, we use the locale specific default encoding. This is
	      // the best we can do if the source does not provide charset info.
	      let charset = channel.contentCharset || aOptions.charset || "UTF-8";
	      let unicodeSource = NetworkHelper.convertToUnicode(source, charset);

	      deferred.resolve({
	        content: unicodeSource,
	        contentType: request.contentType
	      });
	    } catch (ex) {
	      let uri = request.originalURI;
	      if (ex.name === "NS_BASE_STREAM_CLOSED" && uri instanceof Ci.nsIFileURL) {
	        // Empty files cause NS_BASE_STREAM_CLOSED exception. Use OS.File to
	        // differentiate between empty files and other errors (bug 1170864).
	        // This can be removed when bug 982654 is fixed.

	        uri.QueryInterface(Ci.nsIFileURL);
	        let result = OS.File.read(uri.file.path).then(function (bytes) {
	          // Convert the bytearray to a String.
	          let decoder = new TextDecoder();
	          let content = decoder.decode(bytes);

	          // We can't detect the contentType without opening a channel
	          // and that failed already. This is the best we can do here.
	          return {
	            content,
	            contentType: "text/plain"
	          };
	        });

	        deferred.resolve(result);
	      } else {
	        deferred.reject(ex);
	      }
	    }
	  };

	  // Open the channel
	  try {
	    NetUtil.asyncFetch(channel, onResponse);
	  } catch (ex) {
	    return promise.reject(ex);
	  }

	  return deferred.promise;
	}

	/**
	 * Opens a channel for given URL. Tries a bit harder than NetUtil.newChannel.
	 *
	 * @param {String} url - The URL to open a channel for.
	 * @param {Object} options - The options object passed to @method fetch.
	 * @return {nsIChannel} - The newly created channel. Throws on failure.
	 */
	function newChannelForURL(url, { policy }) {
	  let channelOptions = {
	    contentPolicyType: policy,
	    loadUsingSystemPrincipal: true,
	    uri: url
	  };

	  try {
	    return NetUtil.newChannel(channelOptions);
	  } catch (e) {
	    // In the xpcshell tests, the script url is the absolute path of the test
	    // file, which will make a malformed URI error be thrown. Add the file
	    // scheme to see if it helps.
	    channelOptions.uri = "file://" + url;

	    return NetUtil.newChannel(channelOptions);
	  }
	}

	// Fetch is defined differently depending on whether we are on the main thread
	// or a worker thread.
	if (!this.isWorker) {
	  exports.fetch = mainThreadFetch;
	} else {
	  // Services is not available in worker threads, nor is there any other way
	  // to fetch a URL. We need to enlist the help from the main thread here, by
	  // issuing an rpc request, to fetch the URL on our behalf.
	  exports.fetch = function (url, options) {
	    return rpc("fetch", url, options);
	  };
	}

	/**
	 * Returns a promise that is resolved or rejected when all promises have settled
	 * (resolved or rejected).
	 *
	 * This differs from Promise.all, which will reject immediately after the first
	 * rejection, instead of waiting for the remaining promises to settle.
	 *
	 * @param values
	 *        Iterable of promises that may be pending, resolved, or rejected. When
	 *        when all promises have settled (resolved or rejected), the returned
	 *        promise will be resolved or rejected as well.
	 *
	 * @return A new promise that is fulfilled when all values have settled
	 *         (resolved or rejected). Its resolution value will be an array of all
	 *         resolved values in the given order, or undefined if values is an
	 *         empty array. The reject reason will be forwarded from the first
	 *         promise in the list of given promises to be rejected.
	 */
	exports.settleAll = function (values) {
	  if (values === null || typeof values[Symbol.iterator] != "function") {
	    throw new Error("settleAll() expects an iterable.");
	  }

	  let deferred = promise.defer();

	  values = Array.isArray(values) ? values : [...values];
	  let countdown = values.length;
	  let resolutionValues = new Array(countdown);
	  let rejectionValue;
	  let rejectionOccurred = false;

	  if (!countdown) {
	    deferred.resolve(resolutionValues);
	    return deferred.promise;
	  }

	  function checkForCompletion() {
	    if (--countdown > 0) {
	      return;
	    }
	    if (!rejectionOccurred) {
	      deferred.resolve(resolutionValues);
	    } else {
	      deferred.reject(rejectionValue);
	    }
	  }

	  for (let i = 0; i < values.length; i++) {
	    let index = i;
	    let value = values[i];
	    let resolver = function (result) {
	      resolutionValues[index] = result;
	      checkForCompletion();
	    };
	    let rejecter = function (error) {
	      if (!rejectionOccurred) {
	        rejectionValue = error;
	        rejectionOccurred = true;
	      }
	      checkForCompletion();
	    };

	    if (value && typeof value.then == "function") {
	      value.then(resolver, rejecter);
	    } else {
	      // Given value is not a promise, forward it as a resolution value.
	      resolver(value);
	    }
	  }

	  return deferred.promise;
	};

	/**
	 * When the testing flag is set, various behaviors may be altered from
	 * production mode, typically to enable easier testing or enhanced debugging.
	 */
	var testing = false;
	Object.defineProperty(exports, "testing", {
	  get: function () {
	    return testing;
	  },
	  set: function (state) {
	    testing = state;
	  }
	});

	/**
	 * Open the file at the given path for reading.
	 *
	 * @param {String} filePath
	 *
	 * @returns Promise<nsIInputStream>
	 */
	exports.openFileStream = function (filePath) {
	  return new Promise(function (resolve, reject) {
	    const uri = NetUtil.newURI(new FileUtils.File(filePath));
	    NetUtil.asyncFetch({ uri, loadUsingSystemPrincipal: true }, function (stream, result) {
	      if (!components.isSuccessCode(result)) {
	        reject(new Error(`Could not open "${ filePath }": result = ${ result }`));
	        return;
	      }

	      resolve(stream);
	    });
	  });
	};

	exports.isGenerator = function (fn) {
	  if (typeof fn !== "function") {
	    return false;
	  }
	  let proto = Object.getPrototypeOf(fn);
	  if (!proto) {
	    return false;
	  }
	  let ctor = proto.constructor;
	  if (!ctor) {
	    return false;
	  }
	  return ctor.name == "GeneratorFunction";
	};

	exports.isPromise = function (p) {
	  return p && typeof p.then === "function";
	};

	/**
	 * Return true if `thing` is a SavedFrame, false otherwise.
	 */
	exports.isSavedFrame = function (thing) {
	  return Object.prototype.toString.call(thing) === "[object SavedFrame]";
	};

/***/ },
/* 13 */
/***/ function(module, exports) {

	"use strict";

	/*
	 * A sham for https://dxr.mozilla.org/mozilla-central/source/toolkit/modules/Promise.jsm
	 */

	/**
	 * Promise.jsm is mostly the Promise web API with a `defer` method. Just drop this in here,
	 * and use the native web API (although building with webpack/babel, it may replace this
	 * with it's own version if we want to target environments that do not have `Promise`.
	 */
	Promise.defer = function defer() {
	  var resolve, reject;
	  var promise = new Promise(function () {
	    resolve = arguments[0];
	    reject = arguments[1];
	  });
	  return {
	    resolve: resolve,
	    reject: reject,
	    promise: promise
	  };
	};

	module.exports = Promise;

/***/ },
/* 14 */
/***/ function(module, exports) {

	/*
	 * A sham for https://dxr.mozilla.org/mozilla-central/source/toolkit/modules/FileUtils.jsm
	 */
	"use strict";

/***/ },
/* 15 */
/***/ function(module, exports) {

	/*
	 * A sham for https://dxr.mozilla.org/mozilla-central/source/toolkit/modules/AppConstants.jsm
	 */
	"use strict";

/***/ },
/* 16 */
/***/ function(module, exports) {

	/*
	 * A sham for https://dxr.mozilla.org/mozilla-central/source/netwerk/base/NetUtil.jsm
	 */
	"use strict";

/***/ },
/* 17 */
/***/ function(module, exports) {

	/*
	 * A sham for https://dxr.mozilla.org/mozilla-central/source/toolkit/components/osfile/osfile.jsm
	 */
	"use strict";

/***/ },
/* 18 */
/***/ function(module, exports, __webpack_require__) {

	/* vim:set ts=2 sw=2 sts=2 et: */
	/*
	 * Software License Agreement (BSD License)
	 *
	 * Copyright (c) 2007, Parakey Inc.
	 * All rights reserved.
	 *
	 * Redistribution and use of this software in source and binary forms, with or without modification,
	 * are permitted provided that the following conditions are met:
	 *
	 * * Redistributions of source code must retain the above
	 *   copyright notice, this list of conditions and the
	 *   following disclaimer.
	 *
	 * * Redistributions in binary form must reproduce the above
	 *   copyright notice, this list of conditions and the
	 *   following disclaimer in the documentation and/or other
	 *   materials provided with the distribution.
	 *
	 * * Neither the name of Parakey Inc. nor the names of its
	 *   contributors may be used to endorse or promote products
	 *   derived from this software without specific prior
	 *   written permission of Parakey Inc.
	 *
	 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
	 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
	 * FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
	 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
	 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
	 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
	 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
	 * OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
	 */

	/*
	 * Creator:
	 *  Joe Hewitt
	 * Contributors
	 *  John J. Barton (IBM Almaden)
	 *  Jan Odvarko (Mozilla Corp.)
	 *  Max Stepanov (Aptana Inc.)
	 *  Rob Campbell (Mozilla Corp.)
	 *  Hans Hillen (Paciello Group, Mozilla)
	 *  Curtis Bartley (Mozilla Corp.)
	 *  Mike Collins (IBM Almaden)
	 *  Kevin Decker
	 *  Mike Ratcliffe (Comartis AG)
	 *  Hernan Rodríguez Colmeiro
	 *  Austin Andrews
	 *  Christoph Dorn
	 *  Steven Roussey (AppCenter Inc, Network54)
	 *  Mihai Sucan (Mozilla Corp.)
	 */

	"use strict";

	var _require = __webpack_require__(1);

	const components = _require.components;
	const Cc = _require.Cc;
	const Ci = _require.Ci;
	const Cu = _require.Cu;

	var _require2 = __webpack_require__(16);

	const NetUtil = _require2.NetUtil;

	const DevToolsUtils = __webpack_require__(12);

	// The cache used in the `nsIURL` function.
	const gNSURLStore = new Map();

	/**
	 * Helper object for networking stuff.
	 *
	 * Most of the following functions have been taken from the Firebug source. They
	 * have been modified to match the Firefox coding rules.
	 */
	var NetworkHelper = {
	  /**
	   * Converts aText with a given aCharset to unicode.
	   *
	   * @param string aText
	   *        Text to convert.
	   * @param string aCharset
	   *        Charset to convert the text to.
	   * @returns string
	   *          Converted text.
	   */
	  convertToUnicode: function NH_convertToUnicode(aText, aCharset) {
	    let conv = Cc("@mozilla.org/intl/scriptableunicodeconverter").createInstance(Ci.nsIScriptableUnicodeConverter);
	    try {
	      conv.charset = aCharset || "UTF-8";
	      return conv.ConvertToUnicode(aText);
	    } catch (ex) {
	      return aText;
	    }
	  },

	  /**
	   * Reads all available bytes from aStream and converts them to aCharset.
	   *
	   * @param nsIInputStream aStream
	   * @param string aCharset
	   * @returns string
	   *          UTF-16 encoded string based on the content of aStream and aCharset.
	   */
	  readAndConvertFromStream: function NH_readAndConvertFromStream(aStream, aCharset) {
	    let text = null;
	    try {
	      text = NetUtil.readInputStreamToString(aStream, aStream.available());
	      return this.convertToUnicode(text, aCharset);
	    } catch (err) {
	      return text;
	    }
	  },

	  /**
	  * Reads the posted text from aRequest.
	  *
	  * @param nsIHttpChannel aRequest
	  * @param string aCharset
	  *        The content document charset, used when reading the POSTed data.
	  * @returns string or null
	  *          Returns the posted string if it was possible to read from aRequest
	  *          otherwise null.
	  */
	  readPostTextFromRequest: function NH_readPostTextFromRequest(aRequest, aCharset) {
	    if (aRequest instanceof Ci.nsIUploadChannel) {
	      let iStream = aRequest.uploadStream;

	      let isSeekableStream = false;
	      if (iStream instanceof Ci.nsISeekableStream) {
	        isSeekableStream = true;
	      }

	      let prevOffset;
	      if (isSeekableStream) {
	        prevOffset = iStream.tell();
	        iStream.seek(Ci.nsISeekableStream.NS_SEEK_SET, 0);
	      }

	      // Read data from the stream.
	      let text = this.readAndConvertFromStream(iStream, aCharset);

	      // Seek locks the file, so seek to the beginning only if necko hasn't
	      // read it yet, since necko doesn't seek to 0 before reading (at lest
	      // not till 459384 is fixed).
	      if (isSeekableStream && prevOffset == 0) {
	        iStream.seek(Ci.nsISeekableStream.NS_SEEK_SET, 0);
	      }
	      return text;
	    }
	    return null;
	  },

	  /**
	   * Reads the posted text from the page's cache.
	   *
	   * @param nsIDocShell aDocShell
	   * @param string aCharset
	   * @returns string or null
	   *          Returns the posted string if it was possible to read from
	   *          aDocShell otherwise null.
	   */
	  readPostTextFromPage: function NH_readPostTextFromPage(aDocShell, aCharset) {
	    let webNav = aDocShell.QueryInterface(Ci.nsIWebNavigation);
	    return this.readPostTextFromPageViaWebNav(webNav, aCharset);
	  },

	  /**
	   * Reads the posted text from the page's cache, given an nsIWebNavigation
	   * object.
	   *
	   * @param nsIWebNavigation aWebNav
	   * @param string aCharset
	   * @returns string or null
	   *          Returns the posted string if it was possible to read from
	   *          aWebNav, otherwise null.
	   */
	  readPostTextFromPageViaWebNav: function NH_readPostTextFromPageViaWebNav(aWebNav, aCharset) {
	    if (aWebNav instanceof Ci.nsIWebPageDescriptor) {
	      let descriptor = aWebNav.currentDescriptor;

	      if (descriptor instanceof Ci.nsISHEntry && descriptor.postData && descriptor instanceof Ci.nsISeekableStream) {
	        descriptor.seek(NS_SEEK_SET, 0);

	        return this.readAndConvertFromStream(descriptor, aCharset);
	      }
	    }
	    return null;
	  },

	  /**
	   * Gets the web appId that is associated with aRequest.
	   *
	   * @param nsIHttpChannel aRequest
	   * @returns number|null
	   *          The appId for the given request, if available.
	   */
	  getAppIdForRequest: function NH_getAppIdForRequest(aRequest) {
	    try {
	      return this.getRequestLoadContext(aRequest).appId;
	    } catch (ex) {
	      // request loadContent is not always available.
	    }
	    return null;
	  },

	  /**
	   * Gets the topFrameElement that is associated with aRequest. This
	   * works in single-process and multiprocess contexts. It may cross
	   * the content/chrome boundary.
	   *
	   * @param nsIHttpChannel aRequest
	   * @returns nsIDOMElement|null
	   *          The top frame element for the given request.
	   */
	  getTopFrameForRequest: function NH_getTopFrameForRequest(aRequest) {
	    try {
	      return this.getRequestLoadContext(aRequest).topFrameElement;
	    } catch (ex) {
	      // request loadContent is not always available.
	    }
	    return null;
	  },

	  /**
	   * Gets the nsIDOMWindow that is associated with aRequest.
	   *
	   * @param nsIHttpChannel aRequest
	   * @returns nsIDOMWindow or null
	   */
	  getWindowForRequest: function NH_getWindowForRequest(aRequest) {
	    try {
	      return this.getRequestLoadContext(aRequest).associatedWindow;
	    } catch (ex) {
	      // TODO: bug 802246 - getWindowForRequest() throws on b2g: there is no
	      // associatedWindow property.
	    }
	    return null;
	  },

	  /**
	   * Gets the nsILoadContext that is associated with aRequest.
	   *
	   * @param nsIHttpChannel aRequest
	   * @returns nsILoadContext or null
	   */
	  getRequestLoadContext: function NH_getRequestLoadContext(aRequest) {
	    try {
	      return aRequest.notificationCallbacks.getInterface(Ci.nsILoadContext);
	    } catch (ex) {}

	    try {
	      return aRequest.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext);
	    } catch (ex) {}

	    return null;
	  },

	  /**
	   * Determines whether the request has been made for the top level document.
	   *
	   * @param nsIHttpChannel aRequest
	   * @returns Boolean True if the request represents the top level document.
	   */
	  isTopLevelLoad: function (aRequest) {
	    if (aRequest instanceof Ci.nsIChannel) {
	      let loadInfo = aRequest.loadInfo;
	      if (loadInfo && loadInfo.parentOuterWindowID == loadInfo.outerWindowID) {
	        return aRequest.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI;
	      }
	    }

	    return false;
	  },

	  /**
	   * Loads the content of aUrl from the cache.
	   *
	   * @param string aUrl
	   *        URL to load the cached content for.
	   * @param string aCharset
	   *        Assumed charset of the cached content. Used if there is no charset
	   *        on the channel directly.
	   * @param function aCallback
	   *        Callback that is called with the loaded cached content if available
	   *        or null if something failed while getting the cached content.
	   */
	  loadFromCache: function NH_loadFromCache(aUrl, aCharset, aCallback) {
	    var _this = this;

	    let channel = NetUtil.newChannel({ uri: aUrl, loadUsingSystemPrincipal: true });

	    // Ensure that we only read from the cache and not the server.
	    channel.loadFlags = Ci.nsIRequest.LOAD_FROM_CACHE | Ci.nsICachingChannel.LOAD_ONLY_FROM_CACHE | Ci.nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE_IF_BUSY;

	    NetUtil.asyncFetch(channel, function (aInputStream, aStatusCode, aRequest) {
	      if (!components.isSuccessCode(aStatusCode)) {
	        aCallback(null);
	        return;
	      }

	      // Try to get the encoding from the channel. If there is none, then use
	      // the passed assumed aCharset.
	      let aChannel = aRequest.QueryInterface(Ci.nsIChannel);
	      let contentCharset = aChannel.contentCharset || aCharset;

	      // Read the content of the stream using contentCharset as encoding.
	      aCallback(_this.readAndConvertFromStream(aInputStream, contentCharset));
	    });
	  },

	  /**
	   * Parse a raw Cookie header value.
	   *
	   * @param string aHeader
	   *        The raw Cookie header value.
	   * @return array
	   *         Array holding an object for each cookie. Each object holds the
	   *         following properties: name and value.
	   */
	  parseCookieHeader: function NH_parseCookieHeader(aHeader) {
	    let cookies = aHeader.split(";");
	    let result = [];

	    cookies.forEach(function (aCookie) {
	      let equal = aCookie.indexOf("=");
	      let name = aCookie.substr(0, equal);
	      let value = aCookie.substr(equal + 1);
	      result.push({ name: unescape(name.trim()),
	        value: unescape(value.trim()) });
	    });

	    return result;
	  },

	  /**
	   * Parse a raw Set-Cookie header value.
	   *
	   * @param string aHeader
	   *        The raw Set-Cookie header value.
	   * @return array
	   *         Array holding an object for each cookie. Each object holds the
	   *         following properties: name, value, secure (boolean), httpOnly
	   *         (boolean), path, domain and expires (ISO date string).
	   */
	  parseSetCookieHeader: function NH_parseSetCookieHeader(aHeader) {
	    let rawCookies = aHeader.split(/\r\n|\n|\r/);
	    let cookies = [];

	    rawCookies.forEach(function (aCookie) {
	      let equal = aCookie.indexOf("=");
	      let name = unescape(aCookie.substr(0, equal).trim());
	      let parts = aCookie.substr(equal + 1).split(";");
	      let value = unescape(parts.shift().trim());

	      let cookie = { name: name, value: value };

	      parts.forEach(function (aPart) {
	        let part = aPart.trim();
	        if (part.toLowerCase() == "secure") {
	          cookie.secure = true;
	        } else if (part.toLowerCase() == "httponly") {
	          cookie.httpOnly = true;
	        } else if (part.indexOf("=") > -1) {
	          let pair = part.split("=");
	          pair[0] = pair[0].toLowerCase();
	          if (pair[0] == "path" || pair[0] == "domain") {
	            cookie[pair[0]] = pair[1];
	          } else if (pair[0] == "expires") {
	            try {
	              pair[1] = pair[1].replace(/-/g, ' ');
	              cookie.expires = new Date(pair[1]).toISOString();
	            } catch (ex) {}
	          }
	        }
	      });

	      cookies.push(cookie);
	    });

	    return cookies;
	  },

	  // This is a list of all the mime category maps jviereck could find in the
	  // firebug code base.
	  mimeCategoryMap: {
	    "text/plain": "txt",
	    "text/html": "html",
	    "text/xml": "xml",
	    "text/xsl": "txt",
	    "text/xul": "txt",
	    "text/css": "css",
	    "text/sgml": "txt",
	    "text/rtf": "txt",
	    "text/x-setext": "txt",
	    "text/richtext": "txt",
	    "text/javascript": "js",
	    "text/jscript": "txt",
	    "text/tab-separated-values": "txt",
	    "text/rdf": "txt",
	    "text/xif": "txt",
	    "text/ecmascript": "js",
	    "text/vnd.curl": "txt",
	    "text/x-json": "json",
	    "text/x-js": "txt",
	    "text/js": "txt",
	    "text/vbscript": "txt",
	    "view-source": "txt",
	    "view-fragment": "txt",
	    "application/xml": "xml",
	    "application/xhtml+xml": "xml",
	    "application/atom+xml": "xml",
	    "application/rss+xml": "xml",
	    "application/vnd.mozilla.maybe.feed": "xml",
	    "application/vnd.mozilla.xul+xml": "xml",
	    "application/javascript": "js",
	    "application/x-javascript": "js",
	    "application/x-httpd-php": "txt",
	    "application/rdf+xml": "xml",
	    "application/ecmascript": "js",
	    "application/http-index-format": "txt",
	    "application/json": "json",
	    "application/x-js": "txt",
	    "multipart/mixed": "txt",
	    "multipart/x-mixed-replace": "txt",
	    "image/svg+xml": "svg",
	    "application/octet-stream": "bin",
	    "image/jpeg": "image",
	    "image/jpg": "image",
	    "image/gif": "image",
	    "image/png": "image",
	    "image/bmp": "image",
	    "application/x-shockwave-flash": "flash",
	    "video/x-flv": "flash",
	    "audio/mpeg3": "media",
	    "audio/x-mpeg-3": "media",
	    "video/mpeg": "media",
	    "video/x-mpeg": "media",
	    "audio/ogg": "media",
	    "application/ogg": "media",
	    "application/x-ogg": "media",
	    "application/x-midi": "media",
	    "audio/midi": "media",
	    "audio/x-mid": "media",
	    "audio/x-midi": "media",
	    "music/crescendo": "media",
	    "audio/wav": "media",
	    "audio/x-wav": "media",
	    "text/json": "json",
	    "application/x-json": "json",
	    "application/json-rpc": "json",
	    "application/x-web-app-manifest+json": "json",
	    "application/manifest+json": "json"
	  },

	  /**
	   * Check if the given MIME type is a text-only MIME type.
	   *
	   * @param string aMimeType
	   * @return boolean
	   */
	  isTextMimeType: function NH_isTextMimeType(aMimeType) {
	    if (aMimeType.indexOf("text/") == 0) {
	      return true;
	    }

	    // XML and JSON often come with custom MIME types, so in addition to the
	    // standard "application/xml" and "application/json", we also look for
	    // variants like "application/x-bigcorp+xml". For JSON we allow "+json" and
	    // "-json" as suffixes.
	    if (/^application\/\w+(?:[\.-]\w+)*(?:\+xml|[-+]json)$/.test(aMimeType)) {
	      return true;
	    }

	    let category = this.mimeCategoryMap[aMimeType] || null;
	    switch (category) {
	      case "txt":
	      case "js":
	      case "json":
	      case "css":
	      case "html":
	      case "svg":
	      case "xml":
	        return true;

	      default:
	        return false;
	    }
	  },

	  /**
	   * Takes a securityInfo object of nsIRequest, the nsIRequest itself and
	   * extracts security information from them.
	   *
	   * @param object securityInfo
	   *        The securityInfo object of a request. If null channel is assumed
	   *        to be insecure.
	   * @param object httpActivity
	   *        The httpActivity object for the request with at least members
	   *        { private, hostname }.
	   *
	   * @return object
	   *         Returns an object containing following members:
	   *          - state: The security of the connection used to fetch this
	   *                   request. Has one of following string values:
	   *                    * "insecure": the connection was not secure (only http)
	   *                    * "weak": the connection has minor security issues
	   *                    * "broken": secure connection failed (e.g. expired cert)
	   *                    * "secure": the connection was properly secured.
	   *          If state == broken:
	   *            - errorMessage: full error message from nsITransportSecurityInfo.
	   *          If state == secure:
	   *            - protocolVersion: one of TLSv1, TLSv1.1, TLSv1.2.
	   *            - cipherSuite: the cipher suite used in this connection.
	   *            - cert: information about certificate used in this connection.
	   *                    See parseCertificateInfo for the contents.
	   *            - hsts: true if host uses Strict Transport Security, false otherwise
	   *            - hpkp: true if host uses Public Key Pinning, false otherwise
	   *          If state == weak: Same as state == secure and
	   *            - weaknessReasons: list of reasons that cause the request to be
	   *                               considered weak. See getReasonsForWeakness.
	   */
	  parseSecurityInfo: function NH_parseSecurityInfo(securityInfo, httpActivity) {
	    const info = {
	      state: "insecure"
	    };

	    // The request did not contain any security info.
	    if (!securityInfo) {
	      return info;
	    }

	    /**
	     * Different scenarios to consider here and how they are handled:
	     * - request is HTTP, the connection is not secure
	     *   => securityInfo is null
	     *      => state === "insecure"
	     *
	     * - request is HTTPS, the connection is secure
	     *   => .securityState has STATE_IS_SECURE flag
	     *      => state === "secure"
	     *
	     * - request is HTTPS, the connection has security issues
	     *   => .securityState has STATE_IS_INSECURE flag
	     *   => .errorCode is an NSS error code.
	     *      => state === "broken"
	     *
	     * - request is HTTPS, the connection was terminated before the security
	     *   could be validated
	     *   => .securityState has STATE_IS_INSECURE flag
	     *   => .errorCode is NOT an NSS error code.
	     *   => .errorMessage is not available.
	     *      => state === "insecure"
	     *
	     * - request is HTTPS but it uses a weak cipher or old protocol, see
	     *   http://hg.mozilla.org/mozilla-central/annotate/def6ed9d1c1a/
	     *   security/manager/ssl/nsNSSCallbacks.cpp#l1233
	     * - request is mixed content (which makes no sense whatsoever)
	     *   => .securityState has STATE_IS_BROKEN flag
	     *   => .errorCode is NOT an NSS error code
	     *   => .errorMessage is not available
	     *      => state === "weak"
	     */

	    securityInfo.QueryInterface(Ci.nsITransportSecurityInfo);
	    securityInfo.QueryInterface(Ci.nsISSLStatusProvider);

	    const wpl = Ci.nsIWebProgressListener;
	    const NSSErrorsService = Cc['@mozilla.org/nss_errors_service;1'].getService(Ci.nsINSSErrorsService);
	    const SSLStatus = securityInfo.SSLStatus;
	    if (!NSSErrorsService.isNSSErrorCode(securityInfo.errorCode)) {
	      const state = securityInfo.securityState;

	      let uri = null;
	      if (httpActivity.channel && httpActivity.channel.URI) {
	        uri = httpActivity.channel.URI;
	      }
	      if (uri && !uri.schemeIs("https") && !uri.schemeIs("wss")) {
	        // it is not enough to look at the transport security info - schemes other than
	        // https and wss are subject to downgrade/etc at the scheme level and should
	        // always be considered insecure
	        info.state = "insecure";
	      } else if (state & wpl.STATE_IS_SECURE) {
	        // The connection is secure if the scheme is sufficient
	        info.state = "secure";
	      } else if (state & wpl.STATE_IS_BROKEN) {
	        // The connection is not secure, there was no error but there's some
	        // minor security issues.
	        info.state = "weak";
	        info.weaknessReasons = this.getReasonsForWeakness(state);
	      } else if (state & wpl.STATE_IS_INSECURE) {
	        // This was most likely an https request that was aborted before
	        // validation. Return info as info.state = insecure.
	        return info;
	      } else {
	        DevToolsUtils.reportException("NetworkHelper.parseSecurityInfo", "Security state " + state + " has no known STATE_IS_* flags.");
	        return info;
	      }

	      // Cipher suite.
	      info.cipherSuite = SSLStatus.cipherName;

	      // Protocol version.
	      info.protocolVersion = this.formatSecurityProtocol(SSLStatus.protocolVersion);

	      // Certificate.
	      info.cert = this.parseCertificateInfo(SSLStatus.serverCert);

	      // HSTS and HPKP if available.
	      if (httpActivity.hostname) {
	        const sss = Cc("@mozilla.org/ssservice;1").getService(Ci.nsISiteSecurityService);

	        // SiteSecurityService uses different storage if the channel is
	        // private. Thus we must give isSecureHost correct flags or we
	        // might get incorrect results.
	        let flags = httpActivity.private ? Ci.nsISocketProvider.NO_PERMANENT_STORAGE : 0;

	        let host = httpActivity.hostname;

	        info.hsts = sss.isSecureHost(sss.HEADER_HSTS, host, flags);
	        info.hpkp = sss.isSecureHost(sss.HEADER_HPKP, host, flags);
	      } else {
	        DevToolsUtils.reportException("NetworkHelper.parseSecurityInfo", "Could not get HSTS/HPKP status as hostname is not available.");
	        info.hsts = false;
	        info.hpkp = false;
	      }
	    } else {
	      // The connection failed.
	      info.state = "broken";
	      info.errorMessage = securityInfo.errorMessage;
	    }

	    return info;
	  },

	  /**
	   * Takes an nsIX509Cert and returns an object with certificate information.
	   *
	   * @param nsIX509Cert cert
	   *        The certificate to extract the information from.
	   * @return object
	   *         An object with following format:
	   *           {
	   *             subject: { commonName, organization, organizationalUnit },
	   *             issuer: { commonName, organization, organizationUnit },
	   *             validity: { start, end },
	   *             fingerprint: { sha1, sha256 }
	   *           }
	   */
	  parseCertificateInfo: function NH_parseCertifificateInfo(cert) {
	    let info = {};
	    if (cert) {
	      info.subject = {
	        commonName: cert.commonName,
	        organization: cert.organization,
	        organizationalUnit: cert.organizationalUnit
	      };

	      info.issuer = {
	        commonName: cert.issuerCommonName,
	        organization: cert.issuerOrganization,
	        organizationUnit: cert.issuerOrganizationUnit
	      };

	      info.validity = {
	        start: cert.validity.notBeforeLocalDay,
	        end: cert.validity.notAfterLocalDay
	      };

	      info.fingerprint = {
	        sha1: cert.sha1Fingerprint,
	        sha256: cert.sha256Fingerprint
	      };
	    } else {
	      DevToolsUtils.reportException("NetworkHelper.parseCertificateInfo", "Secure connection established without certificate.");
	    }

	    return info;
	  },

	  /**
	   * Takes protocolVersion of SSLStatus object and returns human readable
	   * description.
	   *
	   * @param Number version
	   *        One of nsISSLStatus version constants.
	   * @return string
	   *         One of TLSv1, TLSv1.1, TLSv1.2 if @param version is valid,
	   *         Unknown otherwise.
	   */
	  formatSecurityProtocol: function NH_formatSecurityProtocol(version) {
	    switch (version) {
	      case Ci.nsISSLStatus.TLS_VERSION_1:
	        return "TLSv1";
	      case Ci.nsISSLStatus.TLS_VERSION_1_1:
	        return "TLSv1.1";
	      case Ci.nsISSLStatus.TLS_VERSION_1_2:
	        return "TLSv1.2";
	      default:
	        DevToolsUtils.reportException("NetworkHelper.formatSecurityProtocol", "protocolVersion " + version + " is unknown.");
	        return "Unknown";
	    }
	  },

	  /**
	   * Takes the securityState bitfield and returns reasons for weak connection
	   * as an array of strings.
	   *
	   * @param Number state
	   *        nsITransportSecurityInfo.securityState.
	   *
	   * @return Array[String]
	   *         List of weakness reasons. A subset of { cipher } where
	   *         * cipher: The cipher suite is consireded to be weak (RC4).
	   */
	  getReasonsForWeakness: function NH_getReasonsForWeakness(state) {
	    const wpl = Ci.nsIWebProgressListener;

	    // If there's non-fatal security issues the request has STATE_IS_BROKEN
	    // flag set. See http://hg.mozilla.org/mozilla-central/file/44344099d119
	    // /security/manager/ssl/nsNSSCallbacks.cpp#l1233
	    let reasons = [];

	    if (state & wpl.STATE_IS_BROKEN) {
	      let isCipher = state & wpl.STATE_USES_WEAK_CRYPTO;

	      if (isCipher) {
	        reasons.push("cipher");
	      }

	      if (!isCipher) {
	        DevToolsUtils.reportException("NetworkHelper.getReasonsForWeakness", "STATE_IS_BROKEN without a known reason. Full state was: " + state);
	      }
	    }

	    return reasons;
	  },

	  /**
	   * Parse a url's query string into its components
	   *
	   * @param string aQueryString
	   *        The query part of a url
	   * @return array
	   *         Array of query params {name, value}
	   */
	  parseQueryString: function (aQueryString) {
	    // Make sure there's at least one param available.
	    // Be careful here, params don't necessarily need to have values, so
	    // no need to verify the existence of a "=".
	    if (!aQueryString) {
	      return;
	    }

	    // Turn the params string into an array containing { name: value } tuples.
	    let paramsArray = aQueryString.replace(/^[?&]/, "").split("&").map(function (e) {
	      let param = e.split("=");
	      return {
	        name: param[0] ? NetworkHelper.convertToUnicode(unescape(param[0])) : "",
	        value: param[1] ? NetworkHelper.convertToUnicode(unescape(param[1])) : ""
	      };
	    });

	    return paramsArray;
	  },

	  /**
	   * Helper for getting an nsIURL instance out of a string.
	   */
	  nsIURL: function (aUrl, aStore = gNSURLStore) {
	    if (aStore.has(aUrl)) {
	      return aStore.get(aUrl);
	    }

	    let uri = Services.io.newURI(aUrl, null, null).QueryInterface(Ci.nsIURL);
	    aStore.set(aUrl, uri);
	    return uri;
	  }
	};

	for (let prop of Object.getOwnPropertyNames(NetworkHelper)) {
	  exports[prop] = NetworkHelper[prop];
	}

/***/ },
/* 19 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(module) {/* This Source Code Form is subject to the terms of the Mozilla Public
	 * License, v. 2.0. If a copy of the MPL was not distributed with this
	 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
	"use strict";

	module.metadata = {
	  "stability": "unstable"
	};

	const UNCAUGHT_ERROR = 'An error event was emitted for which there was no listener.';
	const BAD_LISTENER = 'The event listener must be a function.';

	var _require = __webpack_require__(21);

	const ns = _require.ns;

	const event = ns();

	const EVENT_TYPE_PATTERN = /^on([A-Z]\w+$)/;
	exports.EVENT_TYPE_PATTERN = EVENT_TYPE_PATTERN;

	// Utility function to access given event `target` object's event listeners for
	// the specific event `type`. If listeners for this type does not exists they
	// will be created.
	const observers = function observers(target, type) {
	  if (!target) throw TypeError("Event target must be an object");
	  let listeners = event(target);
	  return type in listeners ? listeners[type] : listeners[type] = [];
	};

	/**
	 * Registers an event `listener` that is called every time events of
	 * specified `type` is emitted on the given event `target`.
	 * @param {Object} target
	 *    Event target object.
	 * @param {String} type
	 *    The type of event.
	 * @param {Function} listener
	 *    The listener function that processes the event.
	 */
	function on(target, type, listener) {
	  if (typeof listener !== 'function') throw new Error(BAD_LISTENER);

	  let listeners = observers(target, type);
	  if (! ~listeners.indexOf(listener)) listeners.push(listener);
	}
	exports.on = on;

	var onceWeakMap = new WeakMap();

	/**
	 * Registers an event `listener` that is called only the next time an event
	 * of the specified `type` is emitted on the given event `target`.
	 * @param {Object} target
	 *    Event target object.
	 * @param {String} type
	 *    The type of the event.
	 * @param {Function} listener
	 *    The listener function that processes the event.
	 */
	function once(target, type, listener) {
	  let replacement = function observer(...args) {
	    off(target, type, observer);
	    onceWeakMap.delete(listener);
	    listener.apply(target, args);
	  };
	  onceWeakMap.set(listener, replacement);
	  on(target, type, replacement);
	}
	exports.once = once;

	/**
	 * Execute each of the listeners in order with the supplied arguments.
	 * All the exceptions that are thrown by listeners during the emit
	 * are caught and can be handled by listeners of 'error' event. Thrown
	 * exceptions are passed as an argument to an 'error' event listener.
	 * If no 'error' listener is registered exception will be logged into an
	 * error console.
	 * @param {Object} target
	 *    Event target object.
	 * @param {String} type
	 *    The type of event.
	 * @params {Object|Number|String|Boolean} args
	 *    Arguments that will be passed to listeners.
	 */
	function emit(target, type, ...args) {
	  emitOnObject(target, type, target, ...args);
	}
	exports.emit = emit;

	/**
	 * A variant of emit that allows setting the this property for event listeners
	 */
	function emitOnObject(target, type, thisArg, ...args) {
	  let all = observers(target, '*').length;
	  let state = observers(target, type);
	  let listeners = state.slice();
	  let count = listeners.length;
	  let index = 0;

	  // If error event and there are no handlers (explicit or catch-all)
	  // then print error message to the console.
	  if (count === 0 && type === 'error' && all === 0) console.exception(args[0]);
	  while (index < count) {
	    try {
	      let listener = listeners[index];
	      // Dispatch only if listener is still registered.
	      if (~state.indexOf(listener)) listener.apply(thisArg, args);
	    } catch (error) {
	      // If exception is not thrown by a error listener and error listener is
	      // registered emit `error` event. Otherwise dump exception to the console.
	      if (type !== 'error') emit(target, 'error', error);else console.exception(error);
	    }
	    index++;
	  }
	  // Also emit on `"*"` so that one could listen for all events.
	  if (type !== '*') emit(target, '*', type, ...args);
	}
	exports.emitOnObject = emitOnObject;

	/**
	 * Removes an event `listener` for the given event `type` on the given event
	 * `target`. If no `listener` is passed removes all listeners of the given
	 * `type`. If `type` is not passed removes all the listeners of the given
	 * event `target`.
	 * @param {Object} target
	 *    The event target object.
	 * @param {String} type
	 *    The type of event.
	 * @param {Function} listener
	 *    The listener function that processes the event.
	 */
	function off(target, type, listener) {
	  let length = arguments.length;
	  if (length === 3) {
	    if (onceWeakMap.has(listener)) {
	      listener = onceWeakMap.get(listener);
	      onceWeakMap.delete(listener);
	    }

	    let listeners = observers(target, type);
	    let index = listeners.indexOf(listener);
	    if (~index) listeners.splice(index, 1);
	  } else if (length === 2) {
	    observers(target, type).splice(0);
	  } else if (length === 1) {
	    let listeners = event(target);
	    Object.keys(listeners).forEach(function (type) {
	      return delete listeners[type];
	    });
	  }
	}
	exports.off = off;

	/**
	 * Returns a number of event listeners registered for the given event `type`
	 * on the given event `target`.
	 */
	function count(target, type) {
	  return observers(target, type).length;
	}
	exports.count = count;

	/**
	 * Registers listeners on the given event `target` from the given `listeners`
	 * dictionary. Iterates over the listeners and if property name matches name
	 * pattern `onEventType` and property is a function, then registers it as
	 * an `eventType` listener on `target`.
	 *
	 * @param {Object} target
	 *    The type of event.
	 * @param {Object} listeners
	 *    Dictionary of listeners.
	 */
	function setListeners(target, listeners) {
	  Object.keys(listeners || {}).forEach(function (key) {
	    let match = EVENT_TYPE_PATTERN.exec(key);
	    let type = match && match[1].toLowerCase();
	    if (!type) return;

	    let listener = listeners[key];
	    if (typeof listener === 'function') on(target, type, listener);
	  });
	}
	exports.setListeners = setListeners;
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(20)(module)))

/***/ },
/* 20 */
/***/ function(module, exports) {

	module.exports = function(module) {
		if(!module.webpackPolyfill) {
			module.deprecate = function() {};
			module.paths = [];
			// module.parent = undefined by default
			module.children = [];
			module.webpackPolyfill = 1;
		}
		return module;
	}


/***/ },
/* 21 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(module) {/* This Source Code Form is subject to the terms of the Mozilla Public
	 * License, v. 2.0. If a copy of the MPL was not distributed with this
	 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

	"use strict";

	module.metadata = {
	  "stability": "unstable"
	};

	const create = Object.create;
	const prototypeOf = Object.getPrototypeOf;

	/**
	 * Returns a new namespace, function that may can be used to access an
	 * namespaced object of the argument argument. Namespaced object are associated
	 * with owner objects via weak references. Namespaced objects inherit from the
	 * owners ancestor namespaced object. If owner's ancestor is `null` then
	 * namespaced object inherits from given `prototype`. Namespaces can be used
	 * to define internal APIs that can be shared via enclosing `namespace`
	 * function.
	 * @examples
	 *    const internals = ns();
	 *    internals(object).secret = secret;
	 */
	function ns() {
	  const map = new WeakMap();
	  return function namespace(target) {
	    if (!target) // If `target` is not an object return `target` itself.
	      return target;
	    // If target has no namespaced object yet, create one that inherits from
	    // the target prototype's namespaced object.
	    if (!map.has(target)) map.set(target, create(namespace(prototypeOf(target) || null)));

	    return map.get(target);
	  };
	};

	// `Namespace` is a e4x function in the scope, so we export the function also as
	// `ns` as alias to avoid clashing.
	exports.ns = ns;
	exports.Namespace = ns;
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(20)(module)))

/***/ },
/* 22 */
/***/ function(module, exports, __webpack_require__) {

	/* -*- js-indent-level: 2; indent-tabs-mode: nil -*- */
	/* vim: set ts=2 et sw=2 tw=80: */
	/* This Source Code Form is subject to the terms of the Mozilla Public
	 * License, v. 2.0. If a copy of the MPL was not distributed with this
	 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

	"use strict";

	var _require = __webpack_require__(1);

	const Cc = _require.Cc;
	const Ci = _require.Ci;
	const Cu = _require.Cu;

	const DevToolsUtils = __webpack_require__(12);
	const EventEmitter = __webpack_require__(23);
	const promise = __webpack_require__(13);

	var _require2 = __webpack_require__(!(function webpackMissingModule() { var e = new Error("Cannot find module \"devtools/shared/client/main\""); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

	const LongStringClient = _require2.LongStringClient;

	/**
	 * A WebConsoleClient is used as a front end for the WebConsoleActor that is
	 * created on the server, hiding implementation details.
	 *
	 * @param object aDebuggerClient
	 *        The DebuggerClient instance we live for.
	 * @param object aResponse
	 *        The response packet received from the "startListeners" request sent to
	 *        the WebConsoleActor.
	 */

	function WebConsoleClient(aDebuggerClient, aResponse) {
	  this._actor = aResponse.from;
	  this._client = aDebuggerClient;
	  this._longStrings = {};
	  this.traits = aResponse.traits || {};
	  this.events = [];
	  this._networkRequests = new Map();

	  this.pendingEvaluationResults = new Map();
	  this.onEvaluationResult = this.onEvaluationResult.bind(this);
	  this.onNetworkEvent = this._onNetworkEvent.bind(this);
	  this.onNetworkEventUpdate = this._onNetworkEventUpdate.bind(this);

	  this._client.addListener("evaluationResult", this.onEvaluationResult);
	  this._client.addListener("networkEvent", this.onNetworkEvent);
	  this._client.addListener("networkEventUpdate", this.onNetworkEventUpdate);
	  EventEmitter.decorate(this);
	}

	exports.WebConsoleClient = WebConsoleClient;

	WebConsoleClient.prototype = {
	  _longStrings: null,
	  traits: null,

	  /**
	   * Holds the network requests currently displayed by the Web Console. Each key
	   * represents the connection ID and the value is network request information.
	   * @private
	   * @type object
	   */
	  _networkRequests: null,

	  getNetworkRequest(actorId) {
	    return this._networkRequests.get(actorId);
	  },

	  hasNetworkRequest(actorId) {
	    return this._networkRequests.has(actorId);
	  },

	  removeNetworkRequest(actorId) {
	    this._networkRequests.delete(actorId);
	  },

	  getNetworkEvents() {
	    return this._networkRequests.values();
	  },

	  get actor() {
	    return this._actor;
	  },

	  /**
	   * The "networkEvent" message type handler. We redirect any message to
	   * the UI for displaying.
	   *
	   * @private
	   * @param string type
	   *        Message type.
	   * @param object packet
	   *        The message received from the server.
	   */
	  _onNetworkEvent: function (type, packet) {
	    if (packet.from == this._actor) {
	      let actor = packet.eventActor;
	      let networkInfo = {
	        _type: "NetworkEvent",
	        timeStamp: actor.timeStamp,
	        node: null,
	        actor: actor.actor,
	        discardRequestBody: true,
	        discardResponseBody: true,
	        startedDateTime: actor.startedDateTime,
	        request: {
	          url: actor.url,
	          method: actor.method
	        },
	        isXHR: actor.isXHR,
	        response: {},
	        timings: {},
	        updates: [], // track the list of network event updates
	        private: actor.private,
	        fromCache: actor.fromCache
	      };
	      this._networkRequests.set(actor.actor, networkInfo);

	      this.emit("networkEvent", networkInfo);
	    }
	  },

	  /**
	   * The "networkEventUpdate" message type handler. We redirect any message to
	   * the UI for displaying.
	   *
	   * @private
	   * @param string type
	   *        Message type.
	   * @param object packet
	   *        The message received from the server.
	   */
	  _onNetworkEventUpdate: function (type, packet) {
	    let networkInfo = this.getNetworkRequest(packet.from);
	    if (!networkInfo) {
	      return;
	    }

	    networkInfo.updates.push(packet.updateType);

	    switch (packet.updateType) {
	      case "requestHeaders":
	        networkInfo.request.headersSize = packet.headersSize;
	        break;
	      case "requestPostData":
	        networkInfo.discardRequestBody = packet.discardRequestBody;
	        networkInfo.request.bodySize = packet.dataSize;
	        break;
	      case "responseStart":
	        networkInfo.response.httpVersion = packet.response.httpVersion;
	        networkInfo.response.status = packet.response.status;
	        networkInfo.response.statusText = packet.response.statusText;
	        networkInfo.response.headersSize = packet.response.headersSize;
	        networkInfo.response.remoteAddress = packet.response.remoteAddress;
	        networkInfo.response.remotePort = packet.response.remotePort;
	        networkInfo.discardResponseBody = packet.response.discardResponseBody;
	        break;
	      case "responseContent":
	        networkInfo.response.content = {
	          mimeType: packet.mimeType
	        };
	        networkInfo.response.bodySize = packet.contentSize;
	        networkInfo.response.transferredSize = packet.transferredSize;
	        networkInfo.discardResponseBody = packet.discardResponseBody;
	        break;
	      case "eventTimings":
	        networkInfo.totalTime = packet.totalTime;
	        break;
	      case "securityInfo":
	        networkInfo.securityInfo = packet.state;
	        break;
	    }

	    this.emit("networkEventUpdate", {
	      packet: packet,
	      networkInfo
	    });
	  },

	  /**
	   * Retrieve the cached messages from the server.
	   *
	   * @see this.CACHED_MESSAGES
	   * @param array types
	   *        The array of message types you want from the server. See
	   *        this.CACHED_MESSAGES for known types.
	   * @param function aOnResponse
	   *        The function invoked when the response is received.
	   */
	  getCachedMessages: function WCC_getCachedMessages(types, aOnResponse) {
	    let packet = {
	      to: this._actor,
	      type: "getCachedMessages",
	      messageTypes: types
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Inspect the properties of an object.
	   *
	   * @param string aActor
	   *        The WebConsoleObjectActor ID to send the request to.
	   * @param function aOnResponse
	   *        The function invoked when the response is received.
	   */
	  inspectObjectProperties: function WCC_inspectObjectProperties(aActor, aOnResponse) {
	    let packet = {
	      to: aActor,
	      type: "inspectProperties"
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Evaluate a JavaScript expression.
	   *
	   * @param string aString
	   *        The code you want to evaluate.
	   * @param function aOnResponse
	   *        The function invoked when the response is received.
	   * @param object [aOptions={}]
	   *        Options for evaluation:
	   *
	   *        - bindObjectActor: an ObjectActor ID. The OA holds a reference to
	   *        a Debugger.Object that wraps a content object. This option allows
	   *        you to bind |_self| to the D.O of the given OA, during string
	   *        evaluation.
	   *
	   *        See: Debugger.Object.executeInGlobalWithBindings() for information
	   *        about bindings.
	   *
	   *        Use case: the variable view needs to update objects and it does so
	   *        by knowing the ObjectActor it inspects and binding |_self| to the
	   *        D.O of the OA. As such, variable view sends strings like these for
	   *        eval:
	   *          _self["prop"] = value;
	   *
	   *        - frameActor: a FrameActor ID. The FA holds a reference to
	   *        a Debugger.Frame. This option allows you to evaluate the string in
	   *        the frame of the given FA.
	   *
	   *        - url: the url to evaluate the script as. Defaults to
	   *        "debugger eval code".
	   *
	   *        - selectedNodeActor: the NodeActor ID of the current selection in the
	   *        Inspector, if such a selection exists. This is used by helper functions
	   *        that can reference the currently selected node in the Inspector, like
	   *        $0.
	   */
	  evaluateJS: function WCC_evaluateJS(aString, aOnResponse, aOptions = {}) {
	    let packet = {
	      to: this._actor,
	      type: "evaluateJS",
	      text: aString,
	      bindObjectActor: aOptions.bindObjectActor,
	      frameActor: aOptions.frameActor,
	      url: aOptions.url,
	      selectedNodeActor: aOptions.selectedNodeActor,
	      selectedObjectActor: aOptions.selectedObjectActor
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Evaluate a JavaScript expression asynchronously.
	   * See evaluateJS for parameter and response information.
	   */
	  evaluateJSAsync: function (aString, aOnResponse, aOptions = {}) {
	    var _this = this;

	    // Pre-37 servers don't support async evaluation.
	    if (!this.traits.evaluateJSAsync) {
	      this.evaluateJS(aString, aOnResponse, aOptions);
	      return;
	    }

	    let packet = {
	      to: this._actor,
	      type: "evaluateJSAsync",
	      text: aString,
	      bindObjectActor: aOptions.bindObjectActor,
	      frameActor: aOptions.frameActor,
	      url: aOptions.url,
	      selectedNodeActor: aOptions.selectedNodeActor,
	      selectedObjectActor: aOptions.selectedObjectActor
	    };

	    this._client.request(packet, function (response) {
	      // Null check this in case the client has been detached while waiting
	      // for a response.
	      if (_this.pendingEvaluationResults) {
	        _this.pendingEvaluationResults.set(response.resultID, aOnResponse);
	      }
	    });
	  },

	  /**
	   * Handler for the actors's unsolicited evaluationResult packet.
	   */
	  onEvaluationResult: function (aNotification, aPacket) {
	    // The client on the main thread can receive notification packets from
	    // multiple webconsole actors: the one on the main thread and the ones
	    // on worker threads.  So make sure we should be handling this request.
	    if (aPacket.from !== this._actor) {
	      return;
	    }

	    // Find the associated callback based on this ID, and fire it.
	    // In a sync evaluation, this would have already been called in
	    // direct response to the client.request function.
	    let onResponse = this.pendingEvaluationResults.get(aPacket.resultID);
	    if (onResponse) {
	      onResponse(aPacket);
	      this.pendingEvaluationResults.delete(aPacket.resultID);
	    } else {
	      DevToolsUtils.reportException("onEvaluationResult", "No response handler for an evaluateJSAsync result (resultID: " + aPacket.resultID + ")");
	    }
	  },

	  /**
	   * Autocomplete a JavaScript expression.
	   *
	   * @param string aString
	   *        The code you want to autocomplete.
	   * @param number aCursor
	   *        Cursor location inside the string. Index starts from 0.
	   * @param function aOnResponse
	   *        The function invoked when the response is received.
	   * @param string aFrameActor
	   *        The id of the frame actor that made the call.
	   */
	  autocomplete: function WCC_autocomplete(aString, aCursor, aOnResponse, aFrameActor) {
	    let packet = {
	      to: this._actor,
	      type: "autocomplete",
	      text: aString,
	      cursor: aCursor,
	      frameActor: aFrameActor
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Clear the cache of messages (page errors and console API calls).
	   */
	  clearMessagesCache: function WCC_clearMessagesCache() {
	    let packet = {
	      to: this._actor,
	      type: "clearMessagesCache"
	    };
	    this._client.request(packet);
	  },

	  /**
	   * Get Web Console-related preferences on the server.
	   *
	   * @param array aPreferences
	   *        An array with the preferences you want to retrieve.
	   * @param function [aOnResponse]
	   *        Optional function to invoke when the response is received.
	   */
	  getPreferences: function WCC_getPreferences(aPreferences, aOnResponse) {
	    let packet = {
	      to: this._actor,
	      type: "getPreferences",
	      preferences: aPreferences
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Set Web Console-related preferences on the server.
	   *
	   * @param object aPreferences
	   *        An object with the preferences you want to change.
	   * @param function [aOnResponse]
	   *        Optional function to invoke when the response is received.
	   */
	  setPreferences: function WCC_setPreferences(aPreferences, aOnResponse) {
	    let packet = {
	      to: this._actor,
	      type: "setPreferences",
	      preferences: aPreferences
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Retrieve the request headers from the given NetworkEventActor.
	   *
	   * @param string aActor
	   *        The NetworkEventActor ID.
	   * @param function aOnResponse
	   *        The function invoked when the response is received.
	   */
	  getRequestHeaders: function WCC_getRequestHeaders(aActor, aOnResponse) {
	    let packet = {
	      to: aActor,
	      type: "getRequestHeaders"
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Retrieve the request cookies from the given NetworkEventActor.
	   *
	   * @param string aActor
	   *        The NetworkEventActor ID.
	   * @param function aOnResponse
	   *        The function invoked when the response is received.
	   */
	  getRequestCookies: function WCC_getRequestCookies(aActor, aOnResponse) {
	    let packet = {
	      to: aActor,
	      type: "getRequestCookies"
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Retrieve the request post data from the given NetworkEventActor.
	   *
	   * @param string aActor
	   *        The NetworkEventActor ID.
	   * @param function aOnResponse
	   *        The function invoked when the response is received.
	   */
	  getRequestPostData: function WCC_getRequestPostData(aActor, aOnResponse) {
	    let packet = {
	      to: aActor,
	      type: "getRequestPostData"
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Retrieve the response headers from the given NetworkEventActor.
	   *
	   * @param string aActor
	   *        The NetworkEventActor ID.
	   * @param function aOnResponse
	   *        The function invoked when the response is received.
	   */
	  getResponseHeaders: function WCC_getResponseHeaders(aActor, aOnResponse) {
	    let packet = {
	      to: aActor,
	      type: "getResponseHeaders"
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Retrieve the response cookies from the given NetworkEventActor.
	   *
	   * @param string aActor
	   *        The NetworkEventActor ID.
	   * @param function aOnResponse
	   *        The function invoked when the response is received.
	   */
	  getResponseCookies: function WCC_getResponseCookies(aActor, aOnResponse) {
	    let packet = {
	      to: aActor,
	      type: "getResponseCookies"
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Retrieve the response content from the given NetworkEventActor.
	   *
	   * @param string aActor
	   *        The NetworkEventActor ID.
	   * @param function aOnResponse
	   *        The function invoked when the response is received.
	   */
	  getResponseContent: function WCC_getResponseContent(aActor, aOnResponse) {
	    let packet = {
	      to: aActor,
	      type: "getResponseContent"
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Retrieve the timing information for the given NetworkEventActor.
	   *
	   * @param string aActor
	   *        The NetworkEventActor ID.
	   * @param function aOnResponse
	   *        The function invoked when the response is received.
	   */
	  getEventTimings: function WCC_getEventTimings(aActor, aOnResponse) {
	    let packet = {
	      to: aActor,
	      type: "getEventTimings"
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Retrieve the security information for the given NetworkEventActor.
	   *
	   * @param string aActor
	   *        The NetworkEventActor ID.
	   * @param function aOnResponse
	   *        The function invoked when the response is received.
	   */
	  getSecurityInfo: function WCC_getSecurityInfo(aActor, aOnResponse) {
	    let packet = {
	      to: aActor,
	      type: "getSecurityInfo"
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Send a HTTP request with the given data.
	   *
	   * @param string aData
	   *        The details of the HTTP request.
	   * @param function aOnResponse
	   *        The function invoked when the response is received.
	   */
	  sendHTTPRequest: function WCC_sendHTTPRequest(aData, aOnResponse) {
	    let packet = {
	      to: this._actor,
	      type: "sendHTTPRequest",
	      request: aData
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Start the given Web Console listeners.
	   *
	   * @see this.LISTENERS
	   * @param array aListeners
	   *        Array of listeners you want to start. See this.LISTENERS for
	   *        known listeners.
	   * @param function aOnResponse
	   *        Function to invoke when the server response is received.
	   */
	  startListeners: function WCC_startListeners(aListeners, aOnResponse) {
	    let packet = {
	      to: this._actor,
	      type: "startListeners",
	      listeners: aListeners
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Stop the given Web Console listeners.
	   *
	   * @see this.LISTENERS
	   * @param array aListeners
	   *        Array of listeners you want to stop. See this.LISTENERS for
	   *        known listeners.
	   * @param function aOnResponse
	   *        Function to invoke when the server response is received.
	   */
	  stopListeners: function WCC_stopListeners(aListeners, aOnResponse) {
	    let packet = {
	      to: this._actor,
	      type: "stopListeners",
	      listeners: aListeners
	    };
	    this._client.request(packet, aOnResponse);
	  },

	  /**
	   * Return an instance of LongStringClient for the given long string grip.
	   *
	   * @param object aGrip
	   *        The long string grip returned by the protocol.
	   * @return object
	   *         The LongStringClient for the given long string grip.
	   */
	  longString: function WCC_longString(aGrip) {
	    if (aGrip.actor in this._longStrings) {
	      return this._longStrings[aGrip.actor];
	    }

	    let client = new LongStringClient(this._client, aGrip);
	    this._longStrings[aGrip.actor] = client;
	    return client;
	  },

	  /**
	   * Close the WebConsoleClient. This stops all the listeners on the server and
	   * detaches from the console actor.
	   *
	   * @param function aOnResponse
	   *        Function to invoke when the server response is received.
	   */
	  detach: function WCC_detach(aOnResponse) {
	    this._client.removeListener("evaluationResult", this.onEvaluationResult);
	    this._client.removeListener("networkEvent", this.onNetworkEvent);
	    this._client.removeListener("networkEventUpdate", this.onNetworkEventUpdate);
	    this.stopListeners(null, aOnResponse);
	    this._longStrings = null;
	    this._client = null;
	    this.pendingEvaluationResults.clear();
	    this.pendingEvaluationResults = null;
	    this.clearNetworkRequests();
	    this._networkRequests = null;
	  },

	  clearNetworkRequests: function () {
	    this._networkRequests.clear();
	  },

	  /**
	   * Fetches the full text of a LongString.
	   *
	   * @param object | string stringGrip
	   *        The long string grip containing the corresponding actor.
	   *        If you pass in a plain string (by accident or because you're lazy),
	   *        then a promise of the same string is simply returned.
	   * @return object Promise
	   *         A promise that is resolved when the full string contents
	   *         are available, or rejected if something goes wrong.
	   */
	  getString: function (stringGrip) {
	    // Make sure this is a long string.
	    if (typeof stringGrip != "object" || stringGrip.type != "longString") {
	      return promise.resolve(stringGrip); // Go home string, you're drunk.
	    }

	    // Fetch the long string only once.
	    if (stringGrip._fullText) {
	      return stringGrip._fullText.promise;
	    }

	    let deferred = stringGrip._fullText = promise.defer();
	    let actor = stringGrip.actor;
	    let initial = stringGrip.initial;
	    let length = stringGrip.length;

	    let longStringClient = this.longString(stringGrip);

	    longStringClient.substring(initial.length, length, function (aResponse) {
	      if (aResponse.error) {
	        DevToolsUtils.reportException("getString", aResponse.error + ": " + aResponse.message);

	        deferred.reject(aResponse);
	        return;
	      }
	      deferred.resolve(initial + aResponse.substring);
	    });

	    return deferred.promise;
	  }
	};

/***/ },
/* 23 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";

	/* This Source Code Form is subject to the terms of the Mozilla Public
	 * License, v. 2.0. If a copy of the MPL was not distributed with this
	 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

	/**
	 * EventEmitter.
	 */

	var EventEmitter = function EventEmitter() {};
	module.exports = EventEmitter;

	var _require = __webpack_require__(1);

	const Cu = _require.Cu;

	const promise = __webpack_require__(13);

	/**
	 * Decorate an object with event emitter functionality.
	 *
	 * @param Object aObjectToDecorate
	 *        Bind all public methods of EventEmitter to
	 *        the aObjectToDecorate object.
	 */
	EventEmitter.decorate = function EventEmitter_decorate(aObjectToDecorate) {
	  let emitter = new EventEmitter();
	  aObjectToDecorate.on = emitter.on.bind(emitter);
	  aObjectToDecorate.off = emitter.off.bind(emitter);
	  aObjectToDecorate.once = emitter.once.bind(emitter);
	  aObjectToDecorate.emit = emitter.emit.bind(emitter);
	};

	EventEmitter.prototype = {
	  /**
	   * Connect a listener.
	   *
	   * @param string aEvent
	   *        The event name to which we're connecting.
	   * @param function aListener
	   *        Called when the event is fired.
	   */
	  on: function EventEmitter_on(aEvent, aListener) {
	    if (!this._eventEmitterListeners) this._eventEmitterListeners = new Map();
	    if (!this._eventEmitterListeners.has(aEvent)) {
	      this._eventEmitterListeners.set(aEvent, []);
	    }
	    this._eventEmitterListeners.get(aEvent).push(aListener);
	  },

	  /**
	   * Listen for the next time an event is fired.
	   *
	   * @param string aEvent
	   *        The event name to which we're connecting.
	   * @param function aListener
	   *        (Optional) Called when the event is fired. Will be called at most
	   *        one time.
	   * @return promise
	   *        A promise which is resolved when the event next happens. The
	   *        resolution value of the promise is the first event argument. If
	   *        you need access to second or subsequent event arguments (it's rare
	   *        that this is needed) then use aListener
	   */
	  once: function EventEmitter_once(aEvent, aListener) {
	    var _this = this;

	    let deferred = promise.defer();

	    let handler = function (aEvent, aFirstArg, ...aRest) {
	      _this.off(aEvent, handler);
	      if (aListener) {
	        aListener.apply(null, [aEvent, aFirstArg, ...aRest]);
	      }
	      deferred.resolve(aFirstArg);
	    };

	    handler._originalListener = aListener;
	    this.on(aEvent, handler);

	    return deferred.promise;
	  },

	  /**
	   * Remove a previously-registered event listener.  Works for events
	   * registered with either on or once.
	   *
	   * @param string aEvent
	   *        The event name whose listener we're disconnecting.
	   * @param function aListener
	   *        The listener to remove.
	   */
	  off: function EventEmitter_off(aEvent, aListener) {
	    if (!this._eventEmitterListeners) return;
	    let listeners = this._eventEmitterListeners.get(aEvent);
	    if (listeners) {
	      this._eventEmitterListeners.set(aEvent, listeners.filter(function (l) {
	        return l !== aListener && l._originalListener !== aListener;
	      }));
	    }
	  },

	  /**
	   * Emit an event.  All arguments to this method will
	   * be sent to listener functions.
	   */
	  emit: function EventEmitter_emit(aEvent) {
	    if (!this._eventEmitterListeners || !this._eventEmitterListeners.has(aEvent)) {
	      return;
	    }

	    let originalListeners = this._eventEmitterListeners.get(aEvent);
	    for (let listener of this._eventEmitterListeners.get(aEvent)) {
	      // If the object was destroyed during event emission, stop
	      // emitting.
	      if (!this._eventEmitterListeners) {
	        break;
	      }

	      // If listeners were removed during emission, make sure the
	      // event handler we're going to fire wasn't removed.
	      if (originalListeners === this._eventEmitterListeners.get(aEvent) || this._eventEmitterListeners.get(aEvent).some(function (l) {
	        return l === listener;
	      })) {
	        try {
	          listener.apply(null, arguments);
	        } catch (ex) {
	          // Prevent a bad listener from interfering with the others.
	          let msg = ex + ": " + ex.stack;
	          Cu.reportError(msg);
	          dump(msg + "\n");
	        }
	      }
	    }
	  }
	};

/***/ }
/******/ ]);
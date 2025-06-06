/**
 * Copyright by N-Dream AG 2025.
 * @version 2.5.7
 */

/**
 * Sets up the communication to the screen.
 */

function App(container, web_config, progress_config) {
    var me = this;
    me.is_native_app = typeof Unity != "undefined";
    me.is_editor = !!me.getURLParameterByName("unity-editor-websocket-port");
    me.top_bar_height = window.outerHeight - window.innerHeight;
    me.is_unity_ready = false;
    me.queue = false;
    me.web_config = web_config || {};
    me.web_config.width = me.web_config.width || 16;
    me.web_config.height = me.web_config.height || 9;

    if (me.is_editor) {
        me.setupEditorSocket();
    } else {
        me.initAirConsole();
        if (!me.is_native_app) {
            if (progress_config) {
                me.web_config.onProgress = function(game, progress) {
                    me.updateProgress(progress_config, game, progress);
                };
            }
            me.setupErrorHandler();
            me.game = UnityLoader.instantiate(container, "Build/game.json", me.web_config);
            if (progress_config) {
                me.updateProgress(progress_config, me.game, 0);
            }
            me.resizeCanvas();
        } else {
            me.startNativeApp();
        }
    }
};

App.prototype.updateProgress = function(progress_config, game, progress) {
    if (!game.progress) {
        container = game.container;
        var bar = document.createElement("div");
        bar.style.position = "absolute";
        bar.style.left = progress_config.left;
        bar.style.top = progress_config.top;
        bar.style.width = progress_config.width;
        bar.style.height = progress_config.height;
        bar.style.background = progress_config.background;
        var fill = document.createElement("div");
        fill.style.width = "0%";
        fill.style.height = "100%";
        fill.style.top = "0";
        fill.style.left = "0";
        fill.style.background = progress_config.color;
        bar.appendChild(fill);
        game.progress = bar;
        container.appendChild(bar);
    }
    game.progress.childNodes[0].style.width = progress * 100 + "%";
    if (progress >= 1) {
        game.progress.style.display = "none";
    }
};

App.prototype.startNativeApp = function() {
    var me = this;
    me.is_unity_ready = true;
    window.onbeforeunload = function() {
        Unity.call(JSON.stringify({"action": "onGameEnd"}));
    };
    Unity.call(JSON.stringify({"action": "onUnityWebviewResize",
                               "top_bar_height": me.top_bar_height }));
    // forward WebView postMessage data from parent window
    window.addEventListener('message', function (event) {
        if (event.data["action"] == "androidunity") {
            window.app.processUnityData(event.data["data_string"]);
        }
    });
    // tell webView screen.html is ready
    var parts = document.location.href.split("/");
    Unity.call(JSON.stringify({"action": "onLaunchApp", "game_id" : parts[parts.length-3].replace(".cdn.airconsole.com", ""), "game_version" : parts[parts.length-2]}));
};

App.prototype.setupEditorSocket = function() {
    var me = this;
    var wsPort = me.getURLParameterByName("unity-editor-websocket-port");

    me.unity_socket = new WebSocket("ws://127.0.0.1:" + wsPort + "/api");

    me.unity_socket.onopen = function () {
        me.is_unity_ready = true;
        me.initAirConsole();
    };

    me.unity_socket.onmessage = function (event) {
        me.processUnityData(event.data);
    };

    me.unity_socket.onclose = function () {
        document.body.innerHTML = "<div style='position:absolute; top:50%; left:0%; width:100%; margin-top:-32px; color:white;'><div style='font-size:32px'>Game <span style='color:red'>stopped</span> in Unity. Please close this tab.</div></div>";
    };
    document.body.innerHTML = "<div style='position:absolute; top:50%; left:0%; width:100%; margin-top:-32px; color:white;'>"
        + "<div id='editor-message' style='text-align:center; font-family: Arial'><div style='font-size:32px;'>You can see the game scene in the Unity Editor.</div><br>Keep this window open in the background.</div>"
        + "</div>";
};

/**
 * @private
 */
App.prototype.validateNotLatestApi = function () {
    const referencedAirconsoleAPIScripts = Array.prototype.slice.call(document.getElementsByTagName('script'), 0)
        .map(it => it.src).filter(it => it.includes('api/airconsole-'));

    if (referencedAirconsoleAPIScripts.length > 0) {
        airconsoleApiVersion = referencedAirconsoleAPIScripts[0]
            .match(new RegExp('https?://.*/api/airconsole-(.*).js'));
        if(airconsoleApiVersion.length > 1 && airconsoleApiVersion[1] === 'latest') {            
            const url = window.location.pathname;
            const fileName = url.substring(url.lastIndexOf('/')+1);
            alert(`Please update ${fileName} to the latest version. airconsole-latest.js must not be referenced.`);
            window.open('https://github.com/AirConsole/airconsole-unity-plugin/blob/master/README.md#upgrading-from-v214--to-v250');
            throw new Error(`The usage of the AirConsole API must be updated in ${fileName}`);
        };
    }
}

App.prototype.initAirConsole = function() {
    this.validateNotLatestApi();
    
    var me = this;
    var translation = window.AIRCONSOLE_TRANSLATION;
    var silence_inactive_players = window.AIRCONSOLE_INACTIVE_PLAYERS_SILENCED;

    me.airconsole = new AirConsole({ "synchronize_time": true, "translation": translation, "silence_inactive_players": silence_inactive_players });
    
    const version = me.airconsole.version.split('.');
    if(version.length < 3 || version[0] < 1 || version[1] < 9) {
        confirm('Unity AirConsole Plugin 2.5.0 requires at minimum the AirConsole API version 1.9.0. Please review the upgrade instructions');
        window.open('https://github.com/AirConsole/airconsole-unity-plugin/blob/release/2.5.0/README.md#upgrading-from-v214--to-v250');
    }

    me.airconsole.onMessage = function (from, data) {
        me.postToUnity({
            "action": "onMessage",
            "from": from,
            "data": data
        });
    };

    me.airconsole.onReady = function (code) {
        me.postToUnity({
            "action": "onReady",
            "code": code,
            "device_id": me.airconsole.device_id,
            "devices": me.airconsole.devices,
            "server_time_offset": me.airconsole.server_time_offset,
            "location": document.location.href,
            "translations": me.airconsole.translations
        });
    };

    me.airconsole.onDeviceStateChange = function (device_id, device_data) {
        me.postToUnity({
            "action": "onDeviceStateChange",
            "device_id": device_id,
            "device_data": device_data
        });
    };

    me.airconsole.onConnect = function (device_id) {
        me.postToUnity({
            "action": "onConnect",
            "device_id": device_id
        });
    };

    me.airconsole.onDisconnect = function (device_id) {
        me.postToUnity({
            "action": "onDisconnect",
            "device_id": device_id
        });
    };

    me.airconsole.onCustomDeviceStateChange = function (device_id) {
        me.postToUnity({
            "action": "onCustomDeviceStateChange",
            "device_id": device_id
        });
    };

    me.airconsole.onDeviceProfileChange = function(device_id) {
        me.postToUnity({
            "action": "onDeviceProfileChange",
            "device_id": device_id
        });
    };

    me.airconsole.onAdShow = function() {
        me.postToUnity({
            "action": "onAdShow"
        });
    };

    me.airconsole.onAdComplete = function(ad_was_shown) {
        me.postToUnity({
            "action": "onAdComplete",
            "ad_was_shown": ad_was_shown
        });
    };

    me.airconsole.onHighScores = function(highscores) {
        me.postToUnity({
            "action": "onHighScores",
            "highscores": highscores
        });
    };

    me.airconsole.onHighScoreStored = function(highscore) {
        me.postToUnity({
            "action": "onHighScoreStored",
            "highscore": highscore
        });
    };

    me.airconsole.onPersistentDataStored = function(uid) {
        me.postToUnity({
            "action": "onPersistentDataStored",
            "uid": uid
        });
    };

        me.airconsole.onPersistentDataLoaded = function(data) {
        me.postToUnity({
            "action": "onPersistentDataLoaded",
            "data": data
        });
    };

    me.airconsole.onPremium = function(device_id) {
        me.postToUnity({
            "action": "onPremium",
            "device_id": device_id
        });
    };

    me.airconsole.onPause = function() {
        me.postToUnity({
            action: "onPause"
        });
    };

    me.airconsole.onResume = function() {
        me.postToUnity({
            action: "onResume"
        });
    };
};


App.prototype.getURLParameterByName = function(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
};

App.prototype.setupErrorHandler = function() {
    window.onerror = function(message) {
        if (message.indexOf("UnknownError") != -1 ||
            message.indexOf("Program terminated with exit(0)") != -1 ||
            message.indexOf("DISABLE_EXCEPTION_CATCHING") != -1) {
            // message already correct, but preserving order.
        } else if (message.indexOf("Cannot enlarge memory arrays") != -1) {
            window.setTimeout(function() {
                throw "Not enough memory. Allocate more memory in the WebGL player settings.";
            });
            return false;
        } else if (message.indexOf("Invalid array buffer length") != -1 ||
            message.indexOf("out of memory") != -1 ||
            message.indexOf("Array buffer allocation failed") != -1) {
            alert("Your browser ran out of memory. Try restarting your browser and close other applications running on your computer.");
            return true;
        }
        var container = document.createElement("div");
        container.style.position = "absolute";
        container.style.top = "0px";
        container.style.left = "0px";
        container.style.bottom = "0px";
        container.style.right = "0px";
        container.style.backgroundColor = "#000";
        container.style.color = "#fff";
        container.style.fontSize = "36px";
        var message = document.createElement("div");
        message.innerHTML = "An <span style='color:red'>error</span> has occured, the AirConsole team was informed.";
        message.style.position = "absolute";
        message.style.textAlign = "center";
        message.style.top = "40%";
        message.style.left = "0px";
        message.style.width = "100%";
        container.appendChild(message);
        document.body.appendChild(container);
        window.setTimeout(function() {
            if (window.app && window.app.airconsole) {
                window.app.airconsole.navigateHome();
            }
        }, 5000);
        return true;
    }
};

App.prototype.postQueue = function () {
    if (this.queue !== false) {
        for (var i = 0; i < this.queue.length; ++i) {
        this.postToUnity(this.queue[i]);
        }
        this.queue = false;
    }
};

App.prototype.postToUnity = function (data) {
    if (this.is_unity_ready) {
	    if (this.is_editor) {
	        // send data over websocket
	        this.unity_socket.send(JSON.stringify(data));
	    } else if (this.is_native_app) {
            // send data over webview interface
	        Unity.call(JSON.stringify(data));
	    } else {
	        // send data with SendMessage from Unity js library
	        this.game.SendMessage("AirConsole", "ProcessJS", JSON.stringify(data));
	    }
	} else {
	    if (this.queue === false && data.action == "onReady") {
		  this.queue = [];
		}
		if (this.queue !== false) {
		  this.queue.push(data);
		}
	}
};

App.prototype.processUnityData = function (data) {
    var data = JSON.parse(data);

    if (data.action == "message") {
        this.airconsole.message(data.from, data.data);
    } else if (data.action == "broadcast") {
        this.airconsole.broadcast(data.data);
    } else if (data.action == "setCustomDeviceState") {
        this.airconsole.setCustomDeviceState(data.data);
    } else if (data.action == "setCustomDeviceStateProperty") {
        this.airconsole.setCustomDeviceStateProperty(data.key, data.value);
    } else if (data.action == "navigateHome") {
        this.airconsole.navigateHome();
    } else if (data.action == "navigateTo") {
        this.airconsole.navigateTo(data.data);
    } else if (data.action == "setActivePlayers") {
        this.airconsole.setActivePlayers(data.max_players);
    } else if (data.action == "showAd") {
        this.airconsole.showAd();
    } else if (data.action == "requestHighScores") {
        this.airconsole.requestHighScores(data.level_name, data.level_version, data.uids, data.ranks, data.total, data.top);
    } else if (data.action == "storeHighScore") {
        this.airconsole.storeHighScore(data.level_name, data.level_version, data.score, data.uid, data.data, data.score_string);
    } else if (data.action == "requestPersistentData") {
        this.airconsole.requestPersistentData(data.uids);
    } else if (data.action == "storePersistentData") {
        this.airconsole.storePersistentData(data.key, data.value, data.uid);
    } else if (data.action == "setImmersiveState") {
        this.airconsole.setImmersiveState(data.state);
    } else if (data.action == "debug") {
        console.log("debug message:", data.data);
    }
};

App.prototype.resizeCanvas = function() {
    var container = this.game.container;
    var aspectRatio = this.web_config.width / this.web_config.height;
    var w, h;

    if (window.innerWidth/aspectRatio > window.innerHeight) {
        w = window.innerHeight * aspectRatio;
        h = window.innerHeight;
    } else {
        w = window.innerWidth;
        h = window.innerWidth / aspectRatio;
    }

    // Setting canvas size
    container.style.width = w + "px";
    container.style.height = h + "px";
};

App.prototype.onGameReady = function(autoScale) {
    var me = this;
    me.is_unity_ready = true;
    me.postQueue();

    if (autoScale) {
        window.addEventListener('resize', function() { me.resizeCanvas() });
        me.resizeCanvas();
    }
};

function onGameReady(autoScale) {
    window.app.onGameReady(autoScale);
}
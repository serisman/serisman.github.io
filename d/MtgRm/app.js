let _mqttCreds;
let _shouldReconnect;

const mics = ["nw", "ne", "sw", "se"];
const spks = ["nw", "ne", "mw", "me", "sw", "se"];

function onMQTTConnected() {
  if (_shouldReconnect) {
    setStatus("Connected");
    loadMainView();

    MQTT_Subscribe("MtgRm/mic/stat/+", (status, [mic]) => {
      // status: enabled, active, muted
      $(`#mic-${mic}`).removeClass(["pending", "enabled", "active", "muted"]).addClass(status);    
    });
    MQTT_Subscribe("MtgRm/spk/stat/+", (status, [spk]) => {
      // status: enabled, active
      $(`#spk-${spk}`).removeClass(["pending", "enabled", "muted"]).addClass(status);    
    });

  } else {
    MQTT_Disconnect();
  }
}

function onMQTTConnectionFailure(reason) {
  if (_shouldReconnect) {
    setStatus("Connection failed: " + reason.errorMessage);
    setTimeout(MQTT_Connect, 2000);
  } else {
    setStatus("Not connected");
  }
}

function onMQTTConnectionLost(reason) {
  if (_shouldReconnect) {
    setStatus("Connection lost: " + reason.errorMessage);
    setTimeout(MQTT_Connect, 2000);
  } else {
    setStatus("Not connected");
  }
  $("#statusPanel").show();
}

function setStatus(text) {
  $('#status').text(text);
}

function loadMainView() {
  $("#statusPanel").hide();
  $("#ConnectionView").hide();
  $("#MainView").show();
  $("#btnBar").show();
  $('link[rel="icon"]').attr('href', "icons/32/audio.png");
}

function loadConnectionView() {
  $("#MainView").hide();
  $("#btnBar").hide();
  $("#statusPanel").hide();
  $("#btnCancel").hide();
  if (_mqttCreds) {
    $("#txtMQTTHostName").val(_mqttCreds.host);
    $("#txtMQTTUserName").val(_mqttCreds.username);
    $("#txtMQTTPassword").val(_mqttCreds.password);
  }
  $("#btnConnect").removeAttr("disabled");
  $("#txtMQTTHostName").removeAttr("disabled");
  $("#txtMQTTUserName").removeAttr("disabled");
  $("#txtMQTTPassword").removeAttr("disabled");
  $("#ConnectionView").show();
  $('link[rel="icon"]').attr('href', "icons/32/connect.png");
}

// ----------------------------------------------------------------------------
// jQuery event wire-up
$(document).ready(function() {

  $("#btnConnect").on("click", function() {
    $("#txtMQTTHostName").attr('disabled','disabled');
    $("#txtMQTTUserName").attr('disabled','disabled');
    $("#txtMQTTPassword").attr('disabled','disabled');
    $("#btnConnect").attr('disabled','disabled');
    $("#btnCancel").show();
    _mqttCreds = {
      host: $("#txtMQTTHostName").val(),
      username: $("#txtMQTTUserName").val(),
      password: $("#txtMQTTPassword").val(),
    };
    localStorage.setItem("_mqttCreds", JSON.stringify(_mqttCreds));
    _shouldReconnect = true;
    setTimeout(MQTT_Connect,100);
  });

  $("#btnCancel").on("click", function() {
    MQTT_Disconnect();
    setStatus("Not connected");
    $("#btnConnect").removeAttr("disabled");
    $("#txtMQTTHostName").removeAttr("disabled");
    $("#txtMQTTUserName").removeAttr("disabled");
    $("#txtMQTTPassword").removeAttr("disabled");
    $("#btnCancel").hide();
  });

  $("#btnDisconnect").on("click", function() {
    MQTT_Disconnect();
    loadConnectionView();
  });

  for (const mic of mics) {
    const btn = $(`#mic-${mic}`);
    btn.on('click', function () {
      btn.addClass("pending");
      const newStatus = btn.hasClass("muted") ? "enabled" : "muted";
      MQTT_Publish(`MtgRm/mic/ctrl/${mic}`, newStatus, 0, true);
    });
  }

  for (const spk of spks) {
    const btn = $(`#spk-${spk}`);
    btn.on('click', function () {
      btn.addClass("pending");
      const newStatus = btn.hasClass("muted") ? "enabled" : "muted";
      MQTT_Publish(`MtgRm/spk/ctrl/${spk}`, newStatus, 0, true);
    });
  }
});

$(document).ready(function() {
  _mqttCreds = localStorage.getItem("_mqttCreds");
  if (_mqttCreds) {
    _mqttCreds = JSON.parse(_mqttCreds);
  }
  loadConnectionView();
});

// ----------------------------------------------------------------------------
// Documentation:
//   https://eclipse.dev/paho/index.php?page=clients/js/index.php
//   https://eclipse.dev/paho/files/jsdoc/index.html

let _mqttClient;
let _mqttSubscriptions;

function MQTT_Publish(topic, payload, qos=0, retained=false) {
  const message = new Paho.MQTT.Message(payload);
  message.destinationName = topic;
  message.qos = qos;
  message.retained = retained;
  _mqttClient.send(message);
}

function MQTT_Subscribe(topic, cb) {
  _mqttSubscriptions[topic] = cb;
  _mqttClient.subscribe(topic, {qos: 0});
}

function MQTT_Connect() {
  if (!_shouldReconnect) return;

  _mqttClient = new Paho.MQTT.Client(_mqttCreds.host, 443, "myclientid_" + parseInt(Math.random() * 100, 10));
  _mqttClient.onConnectionLost = onMQTTConnectionLost;

  _mqttClient.onMessageArrived = function(message) {
    for (const topic of Object.keys(_mqttSubscriptions)) {
      _tryDeliverToSubscriber(topic, message.destinationName, message.payloadString);
    }
  }

  function _tryDeliverToSubscriber(subTopic, msgTopic, msgPayload) {    
    const subParts = subTopic.split("/");
    const msgParts = msgTopic.split("/");
    const captures = [];
    for (let i=0; i<subParts.length; i++) {
      const namePart = msgParts[i];
      const topicPart = subParts[i];
      if (topicPart === "#") {
        for (; i<msgParts.length; i++) {
          captures.push(msgParts[i]);
        }
        break;
      } else if (topicPart === "+") {
        captures.push(namePart);
      } else if (namePart !== topicPart) {
        return;
      }
    }
    //console.log(subTopic, captures, msgTopic, msgPayload);
    _mqttSubscriptions[subTopic](msgPayload, captures);
  }

  setStatus("Connecting...");
  _shouldReconnect = true;
  _mqttClient.connect({
    useSSL: true,
    userName: _mqttCreds.username,
    password: _mqttCreds.password,
    timeout: 3,
    onSuccess: function() {
      _mqttSubscriptions = {};
      onMQTTConnected();
    },
    onFailure: onMQTTConnectionFailure
  });
}

function MQTT_Disconnect() {
  _shouldReconnect = false;
  if (_mqttClient) {
    try {
      _mqttClient.disconnect();
    }
    catch (ex) {}
  }
}

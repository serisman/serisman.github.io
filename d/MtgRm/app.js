// Documentation:
//   https://eclipse.dev/paho/index.php?page=clients/js/index.php
//   https://eclipse.dev/paho/files/jsdoc/index.html

let _mqttCreds;
let _mqttClient;
let _shouldReconnect;

const mics = ["nw", "ne", "sw", "se"];
const spks = ["nw", "ne", "mw", "me", "sw", "se"];

function onMQTTConnected() {
  $("#statusPanel").hide();
  if (_shouldReconnect) {
    setStatus("Connected");
    _mqttClient.subscribe("MtgRm/+/stat/+", {qos: 0});
    loadMainView();
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

function onMQTTMessage(topic, payload) {
  //console.log(topic, payload);
  if (topic.startsWith("MtgRm/mic/stat/")) {
    const mic = topic.replace("MtgRm/mic/stat/", "");
    // enabled, active, muted
    $(`#mic-${mic}`).removeClass(["pending", "enabled", "active", "muted"]).addClass(payload);    
  }
  if (topic.startsWith("MtgRm/spk/stat/")) {
    const spk = topic.replace("MtgRm/spk/stat/", "");
    // enabled, active
    $(`#spk-${spk}`).removeClass(["pending", "enabled", "muted"]).addClass(payload);    
  }
}

function numPadToX(num, X) {
  return num.toString().padStart(X,'0');
}

function roundToX(num, X) {
  return +(Math.round(num + "e+" + X) + "e-" + X);
}

function setStatus(text) {
  $('#status').text(text);
}

function loadMainView() {
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

function MQTT_Publish(topic, payload, qos=0, retained=false) {
  const message = new Paho.MQTT.Message(payload);
  message.destinationName = topic;
  message.qos = qos;
  message.retained = retained;
  _mqttClient.send(message);
}

function MQTT_Connect() {
  if (!_shouldReconnect) return;

  _mqttClient = new Paho.MQTT.Client(_mqttCreds.host, 443, "myclientid_" + parseInt(Math.random() * 100, 10));
  _mqttClient.onConnectionLost = onMQTTConnectionLost;

  _mqttClient.onMessageArrived = function(message) {
    onMQTTMessage(message.destinationName, message.payloadString);
  }

  setStatus("Connecting...");
  _shouldReconnect = true;
  _mqttClient.connect({
    useSSL: true,
    userName: _mqttCreds.username,
    password: _mqttCreds.password,
    timeout: 3,
    onSuccess: onMQTTConnected,        
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

// -------------------------------------------------------------------------------------------------------
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

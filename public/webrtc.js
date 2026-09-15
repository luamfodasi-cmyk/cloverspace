(() => {

let peers = {};
let localStream = null;

function signal(to, type, data) {
  if (!window.socket) return;

  window.socket.emit("signal", {
    to,
    type,
    data
  });
}

async function startVoice() {

  try {

    localStream =
      await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

    window.cloverMicStream = localStream;

    document.querySelectorAll(
      '[onclick*="toggleMic"]'
    ).forEach(btn => {
      btn.textContent = "🔇 Desativar microfone";
    });

  } catch (error) {

    alert(
      "Permissão do microfone negada ou indisponível."
    );

    console.error(error);
  }
}

function stopVoice() {

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  Object.values(peers).forEach(pc => pc.close());

  peers = {};
}

async function createPeer(id, offer) {

  if (peers[id]) {
    peers[id].close();
  }

  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  });

  peers[id] = pc;

  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  pc.onicecandidate = event => {

    if (event.candidate) {
      signal(id, "ice", event.candidate);
    }

  };

  pc.ontrack = event => {

    let audio =
      document.getElementById("audio-" + id);

    if (!audio) {

      audio = document.createElement("audio");

      audio.id = "audio-" + id;
      audio.autoplay = true;
      audio.playsInline = true;

      audio.style.display = "none";

      document.body.appendChild(audio);
    }

    audio.srcObject = event.streams[0];

    audio.play().catch(() => {});
  };

  pc.onconnectionstatechange = () => {

    if (
      pc.connectionState === "failed" ||
      pc.connectionState === "closed"
    ) {
      pc.close();
      delete peers[id];
    }

  };

  if (offer) {

    const description =
      await pc.createOffer();

    await pc.setLocalDescription(description);

    signal(
      id,
      "offer",
      pc.localDescription
    );
  }

  return pc;
}

window.startCloverVoice = startVoice;
window.stopCloverVoice = stopVoice;

window.setupCloverWebRTC = function(socket) {

  window.socket = socket;

  socket.on("existing-peers", async users => {

    for (const user of users) {
      await createPeer(user.id, true);
    }

  });

  socket.on("signal", async ({ from, type, data }) => {

    if (type === "offer") {

      const pc =
        await createPeer(from, false);

      await pc.setRemoteDescription(
        new RTCSessionDescription(data)
      );

      const answer =
        await pc.createAnswer();

      await pc.setLocalDescription(answer);

      signal(
        from,
        "answer",
        pc.localDescription
      );

    }

    else if (type === "answer") {

      const pc = peers[from];

      if (!pc) return;

      await pc.setRemoteDescription(
        new RTCSessionDescription(data)
      );

    }

    else if (type === "ice") {

      const pc = peers[from];

      if (!pc) return;

      try {
        await pc.addIceCandidate(
          new RTCIceCandidate(data)
        );
      } catch (error) {
        console.error(error);
      }

    }

  });

  socket.on("peer-left", id => {

    if (peers[id]) {
      peers[id].close();
      delete peers[id];
    }

    const audio =
      document.getElementById("audio-" + id);

    if (audio) audio.remove();

  });
};

})();

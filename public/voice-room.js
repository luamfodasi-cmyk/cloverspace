(() => {
  let socket, stream, room, peers = {};

  const ice = {
    iceServers: [
      {urls:"stun:stun.l.google.com:19302"},
      {urls:"stun:stun1.l.google.com:19302"}
    ]
  };

  window.CloverVoice = {
    async join(roomId, username) {
      room = roomId;
      socket = io();
      socket.on("connect", async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}
          });
          socket.emit("voice:join",{roomId,username});
        } catch(e) {
          alert("Permita o microfone para entrar na sala.");
        }
      });

      socket.on("voice:user-joined", async u => {
        await makePeer(u.id,true);
      });

      socket.on("voice:offer", async d => {
        const pc = await makePeer(d.from,false);
        await pc.setRemoteDescription(d.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("voice:answer",{to:d.from,answer:pc.localDescription});
      });

      socket.on("voice:answer", async d => {
        if(peers[d.from]) await peers[d.from].setRemoteDescription(d.answer);
      });

      socket.on("voice:ice", async d => {
        if(peers[d.from] && d.candidate)
          await peers[d.from].addIceCandidate(d.candidate);
      });

      socket.on("voice:user-left", d => {
        if(peers[d.id]) {
          peers[d.id].close();
          delete peers[d.id];
        }
        document.getElementById("audio-"+d.id)?.remove();
      });
    },

    mute() {
      if(stream) stream.getAudioTracks().forEach(t => t.enabled=!t.enabled);
    },

    leave() {
      if(socket) socket.emit("voice:leave");
      Object.values(peers).forEach(p=>p.close());
      if(stream) stream.getTracks().forEach(t=>t.stop());
      document.querySelectorAll("audio[data-clover-voice]").forEach(a=>a.remove());
      peers={};
      socket?.disconnect();
      socket=null;
    }
  };

  async function makePeer(id,offer) {
    if(peers[id]) return peers[id];

    const pc = new RTCPeerConnection(ice);
    peers[id]=pc;

    stream?.getTracks().forEach(t=>pc.addTrack(t,stream));

    pc.onicecandidate=e=>{
      if(e.candidate) socket.emit("voice:ice",{to:id,candidate:e.candidate});
    };

    pc.ontrack=e=>{
      let a=document.getElementById("audio-"+id);
      if(!a){
        a=document.createElement("audio");
        a.id="audio-"+id;
        a.autoplay=true;
        a.playsInline=true;
        a.dataset.cloverVoice="1";
        document.body.appendChild(a);
      }
      a.srcObject=e.streams[0];
      a.play().catch(()=>{});
    };

    if(offer){
      const o=await pc.createOffer();
      await pc.setLocalDescription(o);
      socket.emit("voice:offer",{to:id,offer:pc.localDescription});
    }

    return pc;
  }
})();

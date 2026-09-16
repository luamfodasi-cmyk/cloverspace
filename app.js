let socket;
let myId="";
let currentRoom="";
let myName="";

const peers=new Map();
const streams=new Map();

function connect(){
  const protocol=location.protocol==="https:"?"wss":"ws";
  socket=new WebSocket(`${protocol}://${location.host}`);

  socket.onopen=()=>{
    const savedName=localStorage.getItem("clover_name")||"Usuário";
    const savedRoom=localStorage.getItem("clover_room");

    myName=prompt("Seu nome:",savedName)||savedName;
    localStorage.setItem("clover_name",myName);

    if(savedRoom) entrarSala(savedRoom);
  };

  socket.onmessage=async e=>{
    const msg=JSON.parse(e.data);

    if(msg.type==="joined"){
      myId=msg.id;
      currentRoom=msg.room;
      localStorage.setItem("clover_room",currentRoom);
      renderRoom(msg.users);
      return;
    }

    if(msg.type==="user-joined"){
      addUser(msg.user);
      return;
    }

    if(msg.type==="user-left"){
      removeUser(msg.id);
      if(peers.has(msg.id)){
        peers.get(msg.id).close();
        peers.delete(msg.id);
      }
      return;
    }

    if(msg.type==="chat"){
      addChat(msg.name,msg.text);
      return;
    }

    if(msg.type==="signal"){
      await receiveSignal(msg.from,msg.data);
    }
  };

  socket.onclose=()=>{
    setTimeout(connect,2000);
  };
}

function entrarSala(nome){
  if(!socket||socket.readyState!==WebSocket.OPEN)return;

  socket.send(JSON.stringify({
    type:"join",
    room:nome,
    name:myName
  }));
}

function criarSala(){
  const nome=prompt("Nome da sala:");
  if(!nome)return;

  entrarSala(nome.trim());
  abrir("inicio",document.querySelector("nav button"));
}

function addUser(user){
  const box=document.getElementById("usuarios");
  if(!box)return;

  if(document.getElementById("u-"+user.id))return;

  const el=document.createElement("div");
  el.id="u-"+user.id;
  el.textContent="● "+user.name;
  box.appendChild(el);
}

function removeUser(id){
  const el=document.getElementById("u-"+id);
  if(el)el.remove();
}

function renderRoom(users){
  const box=document.getElementById("usuarios");
  if(!box)return;

  box.innerHTML="";

  users.forEach(addUser);

  const room=document.getElementById("salaAtual");
  if(room)room.textContent=currentRoom;
}

function enviarChat(){
  const input=document.getElementById("chatInput");
  const text=input.value.trim();

  if(!text||!socket)return;

  socket.send(JSON.stringify({
    type:"chat",
    text
  }));

  input.value="";
}

function addChat(name,text){
  const box=document.getElementById("chatMessages");
  if(!box)return;

  const el=document.createElement("div");
  el.textContent=name+": "+text;
  box.appendChild(el);
  box.scrollTop=box.scrollHeight;
}

async function iniciarCall(){
  const local=await navigator.mediaDevices.getUserMedia({
    audio:true,
    video:false
  });

  streams.set("local",local);

  const roomUsers=[...document.querySelectorAll("#usuarios div")];

  for(const el of roomUsers){
    const id=el.id.replace("u-","");
    if(id!==myId) criarPeer(id,true);
  }
}

async function criarPeer(id,offer){
  if(peers.has(id))return peers.get(id);

  const pc=new RTCPeerConnection({
    iceServers:[
      {urls:"stun:stun.l.google.com:19302"}
    ]
  });

  peers.set(id,pc);

  const local=streams.get("local");
  if(local){
    local.getTracks().forEach(track=>{
      pc.addTrack(track,local);
    });
  }

  pc.onicecandidate=e=>{
    if(e.candidate){
      socket.send(JSON.stringify({
        type:"signal",
        to:id,
        data:{candidate:e.candidate}
      }));
    }
  };

  pc.ontrack=e=>{
    let audio=document.getElementById("audio-"+id);

    if(!audio){
      audio=document.createElement("audio");
      audio.id="audio-"+id;
      audio.autoplay=true;
      document.body.appendChild(audio);
    }

    audio.srcObject=e.streams[0];
  };

  if(offer){
    const o=await pc.createOffer();
    await pc.setLocalDescription(o);

    socket.send(JSON.stringify({
      type:"signal",
      to:id,
      data:{sdp:pc.localDescription}
    }));
  }

  return pc;
}

async function receiveSignal(id,data){
  let pc=peers.get(id);

  if(!pc)pc=await criarPeer(id,false);

  if(data.sdp){
    await pc.setRemoteDescription(data.sdp);

    if(data.sdp.type==="offer"){
      const answer=await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.send(JSON.stringify({
        type:"signal",
        to:id,
        data:{sdp:pc.localDescription}
      }));
    }
  }

  if(data.candidate){
    try{
      await pc.addIceCandidate(data.candidate);
    }catch(e){}
  }
}

function abrir(id,botao){
  document.querySelectorAll(".page")
    .forEach(p=>p.classList.remove("active"));

  const page=document.getElementById(id);
  if(page)page.classList.add("active");

  document.querySelectorAll("nav button")
    .forEach(b=>b.classList.remove("active"));

  if(botao)botao.classList.add("active");
}

window.addEventListener("load",connect);

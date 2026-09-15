cat > public/cartao-visita.js <<'EOF'
(function () {
  const overlay = document.createElement("div");
  overlay.id = "cartao-visita-overlay";

  overlay.innerHTML = `
    <div class="cartao-backdrop"></div>
    <div class="cartao-modal">
      <button class="cartao-fechar">×</button>
      <div class="cartao-titulo">Cartão de Visita</div>

      <div class="cartao-card">
        <div class="cartao-banner" id="cartao-banner"></div>

        <div class="cartao-avatar-wrap">
          <img id="cartao-avatar" class="cartao-avatar">
          <span id="cartao-online"></span>
        </div>

        <div class="cartao-info">
          <div class="cartao-nome" id="cartao-nome"></div>
          <div class="cartao-user" id="cartao-user"></div>
          <div class="cartao-status">● Ativo agora</div>
          <div class="cartao-frase" id="cartao-frase"></div>
        </div>

        <div class="cartao-acoes">
          <button id="cartao-seguir">Seguir</button>
          <button id="cartao-chat">Chat</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const style = document.createElement("style");
  style.textContent = `
    #cartao-visita-overlay {
      display:none;
      position:fixed;
      inset:0;
      z-index:99999;
    }

    #cartao-visita-overlay.aberto {
      display:flex;
      align-items:center;
      justify-content:center;
    }

    .cartao-backdrop {
      position:absolute;
      inset:0;
      background:rgba(0,0,0,.78);
      backdrop-filter:blur(8px);
    }

    .cartao-modal {
      position:relative;
      width:min(92vw,520px);
      max-height:90vh;
      overflow:auto;
      padding:20px;
      border-radius:28px;
      background:#130b27;
      border:2px solid #7040ff;
      box-shadow:0 0 40px rgba(112,64,255,.45);
    }

    .cartao-titulo {
      color:white;
      text-align:center;
      font-size:26px;
      font-weight:800;
      margin-bottom:18px;
    }

    .cartao-fechar {
      position:absolute;
      right:15px;
      top:10px;
      z-index:3;
      background:none;
      color:white;
      border:0;
      font-size:34px;
      cursor:pointer;
    }

    .cartao-card {
      position:relative;
      min-height:430px;
      overflow:hidden;
      border-radius:24px;
      background:#211334;
      border:1px solid #7b4dff;
    }

    .cartao-banner {
      height:240px;
      background:
        linear-gradient(180deg,transparent 40%,rgba(15,5,25,.85)),
        linear-gradient(135deg,#30105f,#09020f);
      background-size:cover;
      background-position:center;
    }

    .cartao-avatar-wrap {
      position:absolute;
      left:24px;
      top:180px;
    }

    .cartao-avatar {
      width:105px;
      height:105px;
      border-radius:50%;
      object-fit:cover;
      border:5px solid #130b27;
      box-shadow:0 0 0 3px #8d55ff;
    }

    #cartao-online {
      position:absolute;
      right:3px;
      bottom:8px;
      width:19px;
      height:19px;
      border-radius:50%;
      background:#19e68c;
      border:3px solid #130b27;
    }

    .cartao-info {
      padding:55px 24px 20px;
    }

    .cartao-nome {
      color:white;
      font-size:27px;
      font-weight:800;
    }

    .cartao-user {
      color:#aaa;
      font-size:16px;
      margin-top:4px;
    }

    .cartao-status {
      color:#21df91;
      margin-top:5px;
    }

    .cartao-frase {
      color:white;
      font-size:18px;
      margin-top:18px;
    }

    .cartao-acoes {
      display:flex;
      gap:12px;
      padding:0 24px 24px;
    }

    .cartao-acoes button {
      flex:1;
      padding:14px;
      border-radius:15px;
      border:1px solid #7040ff;
      background:#21133d;
      color:white;
      font-size:16px;
      font-weight:700;
      cursor:pointer;
    }
  `;
  document.head.appendChild(style);

  window.abrirCartaoVisita = function (perfil) {
    perfil = perfil || {};

    document.getElementById("cartao-nome").textContent =
      perfil.nome || perfil.name || "Usuário";

    document.getElementById("cartao-user").textContent =
      perfil.usuario ? "@" + perfil.usuario : (perfil.username ? "@" + perfil.username : "");

    document.getElementById("cartao-frase").textContent =
      perfil.frase || perfil.bio || "";

    document.getElementById("cartao-avatar").src =
      perfil.avatar || perfil.foto || "/uploads/default-avatar.png";

    if (perfil.banner) {
      document.getElementById("cartao-banner").style.backgroundImage =
        `linear-gradient(180deg,transparent 40%,rgba(15,5,25,.85)),url("${perfil.banner}")`;
    }

    overlay.classList.add("aberto");
  };

  function fechar() {
    overlay.classList.remove("aberto");
  }

  overlay.querySelector(".cartao-fechar").onclick = fechar;
  overlay.querySelector(".cartao-backdrop").onclick = fechar;

  document.addEventListener("click", function (e) {
    const alvo = e.target.closest("[data-profile]");

    if (!alvo) return;

    e.preventDefault();

    window.abrirCartaoVisita({
      nome: alvo.dataset.name || alvo.dataset.profile,
      usuario: alvo.dataset.username || alvo.dataset.profile,
      avatar: alvo.dataset.avatar || alvo.querySelector("img")?.src,
      banner: alvo.dataset.banner,
      bio: alvo.dataset.bio
    });
  });
})();
EOF

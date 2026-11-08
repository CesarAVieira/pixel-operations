# Pixel Operations — CBB Asfaltos

Duas visões em pixel art da operação da CBB Asfaltos (filial Curitiba):

- **Painel de Pedidos** (`/painel.html`): cada pedido em uma linha, com o caminhão percorrendo as etapas *Preparando o pedido → Carregamento → Expedição* até as notas autorizadas e a viagem.
- **Planta virtual** (`/`): a planta industrial navegável, em vista de cima 3/4 com prédios em corte.

Protótipo corporativo. **Todos os dados são fictícios**, gerados por um simulador, até a integração com a API da empresa.

## Instalar com o Claude (copiar e colar)
Em um computador com o [Claude Code](https://claude.com/claude-code), abra uma conversa e cole o prompt abaixo:

```text
Instale e rode o projeto Pixel Operations (painel de pedidos da CBB em pixel art) neste computador:

1. Confira se o Git e o Node.js 18 ou mais novo estão instalados (`git --version` e `node -v`).
   Se faltar algum, pare e me explique como instalar. Este pode ser um computador da empresa:
   não tente contornar bloqueios de permissão, proxy ou antivírus; me diga o que pedir ao TI.
2. Clone https://github.com/CesarAVieira/pixel-operations em uma pasta de projetos do meu usuário
   (por exemplo, Documentos\pixel-operations). Se a pasta já existir, apenas atualize com `git pull`.
3. Dentro da pasta, rode `npm install` e depois `npm test` (todos os testes devem passar).
   Se o `npm install` falhar por proxy/certificado da rede, me mostre o erro e o que configurar.
4. Inicie o servidor com `npm run dev` e deixe rodando em segundo plano.
5. Abra http://127.0.0.1:5173/painel.html no navegador e confirme que os caminhões aparecem animados.
6. No final, me diga os endereços do painel e da planta (http://127.0.0.1:5173/) e como parar e
   iniciar de novo depois.
```

## Instalar à mão
Requisitos: [Git](https://git-scm.com/) e [Node.js](https://nodejs.org/) 18 ou mais novo (recomendado: versão LTS).

```bash
git clone https://github.com/CesarAVieira/pixel-operations.git
cd pixel-operations
npm install
npm run dev
```

Abra **http://127.0.0.1:5173/painel.html** (o painel) ou **http://127.0.0.1:5173/** (a planta). Para parar, use `Ctrl+C` no terminal. Para atualizar depois: `git pull` e `npm install`.

```bash
npm test         # 81 testes automatizados
npm run build    # versão de produção em dist/ (pode ser servida por qualquer servidor web estático)
```

## Painel de Pedidos — para apresentar
- **Clique no caminhão ou no cartão:** abre a ficha com placas, motorista, documentos e certificados, pesagens, notas e linha do tempo.
- **⟳ Auto / ☀ Dia / ☾ Noite:** iluminação pela hora do relógio, ou fixa.
- **⛶ Modo TV:** tela cheia com rolagem automática.
- **Demonstração:** pausar, velocidade 1x/2x/4x e "+ Pedido". Em 4x dá para ver em poucos minutos o ciclo completo, inclusive uma divergência de peso, que faz o caminhão voltar à fábrica, e uma nota rejeitada.

## Controles da planta virtual
- A simulação é automática; não há personagem controlável.
- **Mover a câmera:** arrastar, WASD ou setas. **Zoom:** roda do mouse.
- **Ficha de informações:** clique em prédios, máquinas, veículos ou pessoas.
- **"Visualizar fluxo":** modo operacional, com setores, rotas e etapas.
- **Iluminação:** ☀ / ⟳ / ☾ para dia, ciclo e noite.

## Estrutura
- `src/painel/`: Painel de Pedidos (React + PixiJS).
  - `dominio/`: movimentações, etapas e reducer.
  - `fonte/`: simulador; a futura fonte da API entra aqui.
  - `cena/`: coreografia dos caminhões e iluminação.
  - `arte/`: pixel art procedural e identidade CBB.
  - `render/`: palco PixiJS.
- `src/game/`, `src/data/`, `src/ui/`: planta virtual (Phaser): mapa, prédios, equipamentos, pessoas e fluxos.
- `tests/`: testes de núcleo, dados, rotas e do painel (incluindo a animação junto com o domínio).
- `mockups/`: o primeiro mockup do painel.

const TRANSLATIONS = {
  en: {
    loginTitle: "Sign in",
    loginSubtitle: "Enter your username and password to access the lab.",
    login_title: "Sign in",
    login_subtitle: "Enter your username and password to access the lab.",
    login_username: "Username",
    login_password: "Password",
    login_btn: "Login",
    login_no_account: "No account yet?",
    login_register_link: "Register here",
    admin_setup_title: "Set admin password",
    admin_setup_subtitle: "First sign-in for this admin account. Choose a password to secure it.",
    admin_setup_new_password: "New password",
    admin_setup_confirm_password: "Confirm password",
    admin_setup_btn: "Set password & sign in",
    adminSetupTooShort: "Password must be at least 8 characters.",
    adminSetupMismatch: "Passwords do not match.",
    register_title: "Create account",
    register_subtitle: "Register with your username, password and the workshop registration code.",
    register_code_label: "Registration Code",
    register_btn: "Create Account",
    register_have_account: "Already registered?",
    register_login_link: "Sign in",
    labelAccessCode: "Access Code",
    loginBtn: "Login",
    loginError: "Invalid credentials. Please try again.",
    sidebarNewChat: "New chat",
    sidebarToday: "Today",
    sidebarLabGuide: "Guidelines",
    sidebarPromptLibrary: "Prompt Library",
    sidebarConfig: "Settings",
    sidebarThemeLight: "Light mode",
    sidebarThemeDark: "Dark mode",
    sidebarLogout: "Sign out",
    participantSessionKicker: "Workshop session",
    emptyKicker: "Netskope AI Gateway Workshop & CTF All in one",
    emptyTitle: "AI Gateway Lab Console",
    emptySubtitle: "Run workshop prompts, compare secured versus direct routing, and inspect how policy controls affect AI traffic.",
    emptyPromptTitle: "Prompt Library",
    emptyPromptBody: "Use prepared workshop prompts",
    emptyCtfTitle: "Capture the Flag",
    emptyCtfBody: "Solve challenges & score points",
    emptyGuideTitle: "Guidelines",
    emptyGuideBody: "Workshop objectives & challenges",
    inputHint: "Enter to send · Shift+Enter for new line",
    btnSend: "Send",
    inputFooter: "Routed through Netskope AI Gateway · All traffic is monitored and logged",
    panelConfigTitle: "Settings",
    cfgSectionGateway: "Gateway",
    cfgLabelUrl: "Netskope AI Gateway URL endpoint",
    cfgLabelApikey: "Your API Key (read-only)",
    cfgLabelTokenGroup: "Netskope AI GW Token Group",
    cfgLabelTokenName: "Netskope AI GW Token Name",
    cfgSectionMode: "Mode",
    cfgSectionLlm: "LLM Settings",
    cfgLabelProvider: "Provider",
    cfgLabelModel: "Model",
    cfgSectionMcp: "MCP Settings",
    cfgLabelMcpServer: "MCP Server URL",
    panelLabTitle: "Guidelines",
    panelPromptLibraryTitle: "Prompt Library",
    promptLibraryLoading: "Loading prompts...",
    promptLibraryLoadError: "Could not load prompts.",
    promptLibraryEmpty: "No prompts available.",
    promptLibraryHint: "drag or click",
    promptLibraryUse: "Use →",
    userRole: "Workshop participant",
    headerModelLabel: (model, mode) => `${model} · ${mode === 'mcp' ? 'MCP mode' : 'LLM mode'}`,
    participantTourStepLabel: (current, total) => `Step ${current} of ${total}`,
    participantTourSkip: "Skip",
    participantTourBack: "Back",
    participantTourNext: "Next",
    participantTourFinish: "Finish",
    participantTourSteps: {
      workspace: {
        title: "Start from the lab console",
        body: "This is your participant workspace. Use the chat, prepared prompts, guidelines, CTF challenges, ranking, and settings from one screen."
      },
      routing: {
        title: "Choose Secured or Direct",
        body: "Secured sends prompts through Netskope AI Gateway for policy, DLP, logging, and user attribution. Direct bypasses the gateway and is mainly for challenges that ask you to compare behavior."
      },
      quota: {
        title: "Watch your prompt quota",
        body: "The counter shows how many prompts you have left for the session. Secured and Direct messages both consume the workshop quota."
      },
      timer: {
        title: "Keep an eye on the CTF clock",
        body: "When the instructor starts a timed run, the clock shows the remaining time. When time expires, chat and challenge submissions are blocked."
      },
      chat: {
        title: "Send prompts here",
        body: "Write your prompt in the composer. The footer and placeholder tell you whether the CTF is running, in standby, stopped, or out of time."
      },
      guidelines: {
        title: "Review the guidelines",
        body: "Guidelines explain the workshop objective, how Secured and Direct differ, how scoring works, and what to do if you get stuck."
      },
      prompts: {
        title: "Use the Prompt Library",
        body: "Open the library to reuse instructor-provided prompts. Click a prompt or drag it into the composer before sending."
      },
      challenges: {
        title: "Complete CTF challenges",
        body: "Capture the Flag contains the challenge list, your progress, and the rules. Correct answers award points once; wrong attempts and hints subtract 5 points, and repeated failures can trigger a cooldown."
      },
      leaderboard: {
        title: "Track the leaderboard",
        body: "When the instructor makes it visible, the leaderboard shows live scores and ranking. Ties are decided by who reached the score first."
      },
      settings: {
        title: "Check your settings",
        body: "Settings shows your assigned Netskope token group and token name, plus the available providers, models, LLM/MCP mode, and MCP server choices."
      }
    },
    labSteps: [
      { title: "🎯 Workshop Objectives", body: "You will learn how Netskope AI Gateway intercepts, inspects, and controls AI traffic in real time. By the end of this session you will understand how to apply policy controls, compare secured vs direct routing, and analyze how the gateway handles sensitive data and prompt injections." },
      { title: "🏆 Challenges", body: "Complete the challenges listed in the <strong>Challenges</strong> panel. You have <strong>100 prompts</strong> shared across all challenges — use them wisely. Scoring: each challenge awards a fixed number of points on first completion; points are not awarded again if you retry. Your total score is the sum of all completed challenges." },
      { title: "📊 Leaderboard", body: "Your score updates in real time as you complete challenges. Open the <strong>Leaderboard</strong> panel to see your ranking among all workshop participants. The top 3 participants will be displayed on the podium. Keep going — every challenge counts!" },
      { title: "🔒 Secured vs Direct", body: "<strong>Secured</strong> routes your prompts through the Netskope AI Gateway — policies are enforced, traffic is logged, and DLP controls apply. <strong>Direct</strong> sends your prompts straight to the LLM provider, bypassing the gateway entirely. Use Direct only when a challenge explicitly asks you to compare both modes." },
      { title: "🌐 Netskope Tenant", body: "Remember to access your Netskope tenant to configure your Token Group and view the AI Gateway logs. There you can inspect every request your session sends through the gateway, check applied policies, and see how your traffic is classified in real time." },
      { title: "🆘 Support", body: "If you get stuck, ask your instructor. For technical issues (connection errors, missing prompts, score not updating), try refreshing the page — your session is saved automatically. If the problem persists, note the error message and notify the workshop team." },
    ]
  },
  es: {
    loginTitle: "Bienvenido al Laboratorio",
    loginSubtitle: "Introduce tu código de acceso para comenzar el Netskope AI Gateway Workshop & CTF All in one.",
    login_title: "Iniciar sesión",
    login_subtitle: "Introduce tu usuario y contraseña para acceder al laboratorio.",
    login_username: "Usuario",
    login_password: "Contraseña",
    login_btn: "Login",
    login_no_account: "¿No tienes cuenta?",
    login_register_link: "Regístrate aquí",
    admin_setup_title: "Configurar contraseña de admin",
    admin_setup_subtitle: "Primer acceso de esta cuenta de admin. Elige una contraseña para protegerla.",
    admin_setup_new_password: "Nueva contraseña",
    admin_setup_confirm_password: "Confirmar contraseña",
    admin_setup_btn: "Guardar contraseña y entrar",
    adminSetupTooShort: "La contraseña debe tener al menos 8 caracteres.",
    adminSetupMismatch: "Las contraseñas no coinciden.",
    register_title: "Crear cuenta",
    register_subtitle: "Regístrate con tu usuario, contraseña y el código de registro del workshop.",
    register_code_label: "Código de registro",
    register_btn: "Crear cuenta",
    register_have_account: "¿Ya estás registrado?",
    register_login_link: "Iniciar sesión",
    labelAccessCode: "Código de acceso",
    loginBtn: "Entrar al Workshop",
    loginError: "Código de acceso inválido. Inténtalo de nuevo.",
    sidebarNewChat: "Nueva conversación",
    sidebarToday: "Hoy",
    sidebarLabGuide: "Directrices",
    sidebarPromptLibrary: "Biblioteca de prompts",
    sidebarConfig: "Configuración",
    sidebarThemeLight: "Modo claro",
    sidebarThemeDark: "Modo oscuro",
    sidebarLogout: "Cerrar sesión",
    participantSessionKicker: "Sesión del workshop",
    emptyKicker: "Netskope AI Gateway Workshop & CTF All in one",
    emptyTitle: "Consola del laboratorio AI Gateway",
    emptySubtitle: "Ejecuta prompts del workshop, compara el enrutado secured y direct, y revisa cómo las políticas afectan al tráfico de IA.",
    emptyPromptTitle: "Biblioteca de prompts",
    emptyPromptBody: "Usa prompts preparados del workshop",
    emptyCtfTitle: "Capture the Flag",
    emptyCtfBody: "Resuelve desafíos y suma puntos",
    emptyGuideTitle: "Directrices",
    emptyGuideBody: "Objetivos del workshop y desafíos",
    inputHint: "Enter para enviar · Shift+Enter para nueva línea",
    btnSend: "Enviar",
    inputFooter: "Enrutado a través de Netskope AI Gateway · Todo el tráfico es monitoreado y registrado",
    panelConfigTitle: "Configuración",
    cfgSectionGateway: "Gateway",
    cfgLabelUrl: "Netskope AI Gateway URL endpoint",
    cfgLabelApikey: "Tu API Key (solo lectura)",
    cfgLabelTokenGroup: "Netskope AI GW Token Group",
    cfgLabelTokenName: "Netskope AI GW Token Name",
    cfgSectionMode: "Modo",
    cfgSectionLlm: "Configuración LLM",
    cfgLabelProvider: "Proveedor",
    cfgLabelModel: "Modelo",
    cfgSectionMcp: "Configuración MCP",
    cfgLabelMcpServer: "URL del servidor MCP",
    panelLabTitle: "Directrices",
    panelPromptLibraryTitle: "Biblioteca de prompts",
    promptLibraryLoading: "Cargando prompts...",
    promptLibraryLoadError: "No se pudieron cargar los prompts.",
    promptLibraryEmpty: "No hay prompts disponibles.",
    promptLibraryHint: "arrastra o haz clic",
    promptLibraryUse: "Usar →",
    userRole: "Participante del workshop",
    headerModelLabel: (model, mode) => `${model} · Modo ${mode === 'mcp' ? 'MCP' : 'LLM'}`,
    participantTourStepLabel: (current, total) => `Paso ${current} de ${total}`,
    participantTourSkip: "Omitir",
    participantTourBack: "Atrás",
    participantTourNext: "Siguiente",
    participantTourFinish: "Finalizar",
    participantTourSteps: {
      workspace: {
        title: "Empieza en la consola del laboratorio",
        body: "Este es tu espacio de participante. Desde una sola pantalla puedes usar el chat, prompts preparados, directrices, desafíos CTF, ranking y configuración."
      },
      routing: {
        title: "Elige Secured o Direct",
        body: "Secured envía los prompts a través de Netskope AI Gateway para aplicar políticas, DLP, registro y atribución por usuario. Direct evita el gateway y se usa sobre todo en desafíos que piden comparar comportamientos."
      },
      quota: {
        title: "Controla tu cuota de prompts",
        body: "El contador muestra cuántos prompts te quedan en la sesión. Los mensajes Secured y Direct consumen la misma cuota del workshop."
      },
      timer: {
        title: "Vigila el reloj del CTF",
        body: "Cuando el instructor inicia una ronda con tiempo, el reloj muestra cuánto queda. Al agotarse, se bloquean el chat y los envíos de desafíos."
      },
      chat: {
        title: "Envía prompts desde aquí",
        body: "Escribe tu prompt en el editor. El pie y el placeholder indican si el CTF está en marcha, en espera, detenido o sin tiempo."
      },
      guidelines: {
        title: "Revisa las directrices",
        body: "Las directrices explican el objetivo del workshop, la diferencia entre Secured y Direct, cómo funciona la puntuación y qué hacer si te bloqueas."
      },
      prompts: {
        title: "Usa la biblioteca de prompts",
        body: "Abre la biblioteca para reutilizar prompts preparados por el instructor. Haz clic en un prompt o arrástralo al editor antes de enviarlo."
      },
      challenges: {
        title: "Completa los desafíos CTF",
        body: "Capture the Flag contiene la lista de desafíos, tu progreso y las reglas. Las respuestas correctas puntúan una sola vez; los fallos y las pistas restan 5 puntos, y varios fallos pueden activar un cooldown."
      },
      leaderboard: {
        title: "Sigue el ranking",
        body: "Cuando el instructor lo hace visible, el leaderboard muestra puntuaciones y posiciones en vivo. En caso de empate, gana quien alcanzó antes la puntuación."
      },
      settings: {
        title: "Comprueba tu configuración",
        body: "Configuración muestra tu token group y token name de Netskope, además de proveedores, modelos, modo LLM/MCP y servidores MCP disponibles."
      }
    },
    labSteps: [
      { title: "🎯 Objetivos del Workshop", body: "Aprenderás cómo Netskope AI Gateway intercepta, inspecciona y controla el tráfico de IA en tiempo real. Al finalizar comprenderás cómo aplicar controles de política, comparar el enrutado secured vs direct y analizar cómo el gateway gestiona datos sensibles e inyecciones de prompts." },
      { title: "🏆 Desafíos", body: "Completa los desafíos del panel <strong>Challenges</strong>. Tienes <strong>100 prompts</strong> compartidos entre todos los desafíos — úsalos con cabeza. Puntuación: cada desafío otorga una cantidad fija de puntos la primera vez que lo completas; reintentar no suma más puntos. Tu puntuación total es la suma de todos los desafíos completados." },
      { title: "📊 Leaderboard", body: "Tu puntuación se actualiza en tiempo real al completar desafíos. Abre el panel <strong>Leaderboard</strong> para ver tu posición entre todos los participantes. Los 3 mejores estudiantes aparecerán en el podio. ¡Cada desafío cuenta!" },
      { title: "🔒 Secured vs Direct", body: "<strong>Secured</strong> enruta tus prompts a través del Netskope AI Gateway — se aplican políticas, el tráfico queda registrado y entran en juego los controles DLP. <strong>Direct</strong> envía tus prompts directamente al proveedor LLM, saltándose el gateway por completo. Usa Direct solo cuando un desafío te pida comparar ambos modos explícitamente." },
      { title: "🌐 Tenant de Netskope", body: "Recuerda acceder a tu tenant de Netskope para configurar tu Token Group y consultar los logs del AI Gateway. Allí puedes inspeccionar cada petición que tu sesión envía a través del gateway, revisar las políticas aplicadas y ver cómo se clasifica tu tráfico en tiempo real." },
      { title: "🆘 Soporte", body: "Si te bloqueas, consulta al instructor. Para problemas técnicos (errores de conexión, prompts no disponibles, puntuación sin actualizar), intenta refrescar la página — tu sesión se guarda automáticamente. Si el problema persiste, anota el error y notifica al equipo del workshop." },
    ]
  },
  pt: {
    loginTitle: "Bem-vindo ao Laboratório",
    loginSubtitle: "Insira seu código de acesso para iniciar o Netskope AI Gateway Workshop & CTF All in one.",
    login_title: "Entrar",
    login_subtitle: "Insira seu usuário e senha para acessar o laboratório.",
    login_username: "Usuário",
    login_password: "Senha",
    login_btn: "Login",
    login_no_account: "Ainda não tem conta?",
    login_register_link: "Registre-se aqui",
    admin_setup_title: "Definir senha de admin",
    admin_setup_subtitle: "Primeiro acesso desta conta de admin. Escolha uma senha para protegê-la.",
    admin_setup_new_password: "Nova senha",
    admin_setup_confirm_password: "Confirmar senha",
    admin_setup_btn: "Salvar senha e entrar",
    adminSetupTooShort: "A senha deve ter pelo menos 8 caracteres.",
    adminSetupMismatch: "As senhas não coincidem.",
    register_title: "Criar conta",
    register_subtitle: "Registre-se com seu usuário, senha e o código de registro do workshop.",
    register_code_label: "Código de registro",
    register_btn: "Criar conta",
    register_have_account: "Já está registrado?",
    register_login_link: "Entrar",
    labelAccessCode: "Código de acesso",
    loginBtn: "Entrar no Workshop",
    loginError: "Código de acesso inválido. Tente novamente.",
    sidebarNewChat: "Nova conversa",
    sidebarToday: "Hoje",
    sidebarLabGuide: "Diretrizes",
    sidebarPromptLibrary: "Biblioteca de prompts",
    sidebarConfig: "Configuração",
    sidebarThemeLight: "Modo claro",
    sidebarThemeDark: "Modo escuro",
    sidebarLogout: "Sair",
    participantSessionKicker: "Sessão do workshop",
    emptyKicker: "Netskope AI Gateway Workshop & CTF All in one",
    emptyTitle: "Console do laboratório AI Gateway",
    emptySubtitle: "Execute prompts do workshop, compare o roteamento secured e direct e veja como as políticas afetam o tráfego de IA.",
    emptyPromptTitle: "Biblioteca de prompts",
    emptyPromptBody: "Use prompts preparados do workshop",
    emptyCtfTitle: "Capture the Flag",
    emptyCtfBody: "Resolva desafios e ganhe pontos",
    emptyGuideTitle: "Diretrizes",
    emptyGuideBody: "Objetivos do workshop e desafios",
    inputHint: "Enter para enviar · Shift+Enter para nova linha",
    btnSend: "Enviar",
    inputFooter: "Roteado pelo Netskope AI Gateway · Todo o tráfego é monitorado e registrado",
    panelConfigTitle: "Configuração",
    cfgSectionGateway: "Gateway",
    cfgLabelUrl: "Netskope AI Gateway URL endpoint",
    cfgLabelApikey: "Sua API Key (somente leitura)",
    cfgLabelTokenGroup: "Netskope AI GW Token Group",
    cfgLabelTokenName: "Netskope AI GW Token Name",
    cfgSectionMode: "Modo",
    cfgSectionLlm: "Configurações LLM",
    cfgLabelProvider: "Provedor",
    cfgLabelModel: "Modelo",
    cfgSectionMcp: "Configurações MCP",
    cfgLabelMcpServer: "URL do servidor MCP",
    panelLabTitle: "Diretrizes",
    panelPromptLibraryTitle: "Biblioteca de prompts",
    promptLibraryLoading: "Carregando prompts...",
    promptLibraryLoadError: "Não foi possível carregar os prompts.",
    promptLibraryEmpty: "Nenhum prompt disponível.",
    promptLibraryHint: "arraste ou clique",
    promptLibraryUse: "Usar →",
    userRole: "Participante do workshop",
    headerModelLabel: (model, mode) => `${model} · Modo ${mode === 'mcp' ? 'MCP' : 'LLM'}`,
    participantTourStepLabel: (current, total) => `Passo ${current} de ${total}`,
    participantTourSkip: "Pular",
    participantTourBack: "Voltar",
    participantTourNext: "Avançar",
    participantTourFinish: "Concluir",
    participantTourSteps: {
      workspace: {
        title: "Comece pelo console do laboratório",
        body: "Este é o seu espaço de participante. Em uma só tela você usa o chat, prompts preparados, diretrizes, desafios CTF, ranking e configuração."
      },
      routing: {
        title: "Escolha Secured ou Direct",
        body: "Secured envia os prompts pelo Netskope AI Gateway para política, DLP, registro e atribuição por usuário. Direct ignora o gateway e é usado principalmente nos desafios que pedem comparação de comportamento."
      },
      quota: {
        title: "Acompanhe sua cota de prompts",
        body: "O contador mostra quantos prompts restam na sessão. Mensagens Secured e Direct consomem a mesma cota do workshop."
      },
      timer: {
        title: "Fique de olho no relógio do CTF",
        body: "Quando o instrutor inicia uma rodada com tempo, o relógio mostra o tempo restante. Ao expirar, o chat e os envios de desafios são bloqueados."
      },
      chat: {
        title: "Envie prompts aqui",
        body: "Escreva seu prompt no editor. O rodapé e o placeholder indicam se o CTF está em execução, em espera, parado ou sem tempo."
      },
      guidelines: {
        title: "Revise as diretrizes",
        body: "As diretrizes explicam o objetivo do workshop, a diferença entre Secured e Direct, como funciona a pontuação e o que fazer se você travar."
      },
      prompts: {
        title: "Use a biblioteca de prompts",
        body: "Abra a biblioteca para reutilizar prompts preparados pelo instrutor. Clique em um prompt ou arraste-o para o editor antes de enviar."
      },
      challenges: {
        title: "Complete os desafios CTF",
        body: "Capture the Flag contém a lista de desafios, seu progresso e as regras. Respostas corretas pontuam apenas uma vez; erros e dicas subtraem 5 pontos, e muitas falhas podem ativar um cooldown."
      },
      leaderboard: {
        title: "Acompanhe o ranking",
        body: "Quando o instrutor deixa visível, o leaderboard mostra pontuações e posições ao vivo. Empates são decididos por quem chegou primeiro à pontuação."
      },
      settings: {
        title: "Confira sua configuração",
        body: "Configuração mostra seu token group e token name do Netskope, além de provedores, modelos, modo LLM/MCP e servidores MCP disponíveis."
      }
    },
    labSteps: [
      { title: "🎯 Objetivos do Workshop", body: "Você aprenderá como o Netskope AI Gateway intercepta, inspeciona e controla o tráfego de IA em tempo real. Ao final, você entenderá como aplicar controles de política, comparar roteamento secured vs direct e analisar como o gateway lida com dados sensíveis e injeções de prompt." },
      { title: "🏆 Desafios", body: "Complete os desafios listados no painel <strong>Challenges</strong>. Você tem <strong>100 prompts</strong> compartilhados entre todos os desafios — use-os com sabedoria. Pontuação: cada desafio concede uma quantidade fixa de pontos na primeira conclusão; tentar novamente não adiciona mais pontos. Sua pontuação total é a soma de todos os desafios concluídos." },
      { title: "📊 Leaderboard", body: "Sua pontuação é atualizada em tempo real conforme você completa os desafios. Abra o painel <strong>Leaderboard</strong> para ver sua classificação. Os 3 melhores estudantes aparecem no pódio. Continue — cada desafio conta!" },
      { title: "🔒 Secured vs Direct", body: "<strong>Secured</strong> roteia seus prompts pelo Netskope AI Gateway — as políticas são aplicadas, o tráfego é registrado e os controles DLP entram em ação. <strong>Direct</strong> envia seus prompts diretamente ao provedor LLM, ignorando completamente o gateway. Use Direct apenas quando um desafio pedir explicitamente que você compare os dois modos." },
      { title: "🌐 Tenant Netskope", body: "Lembre-se de acessar seu tenant Netskope para configurar seu Token Group e visualizar os logs do AI Gateway. Lá você pode inspecionar cada requisição que sua sessão envia pelo gateway, verificar as políticas aplicadas e ver como seu tráfego é classificado em tempo real." },
      { title: "🆘 Suporte", body: "Se travar, consulte o instrutor. Para problemas técnicos (erros de conexão, prompts ausentes, pontuação não atualizada), tente atualizar a página — sua sessão é salva automaticamente. Se o problema persistir, anote a mensagem de erro e notifique a equipe do workshop." },
    ]
  },
  fr: {
    loginTitle: "Bienvenue dans le Lab",
    loginSubtitle: "Entrez votre code d'accès pour démarrer le Netskope AI Gateway Workshop & CTF All in one.",
    login_title: "Se connecter",
    login_subtitle: "Entrez votre nom d'utilisateur et votre mot de passe pour accéder au laboratoire.",
    login_username: "Nom d'utilisateur",
    login_password: "Mot de passe",
    login_btn: "Login",
    login_no_account: "Pas encore de compte ?",
    login_register_link: "S'inscrire ici",
    admin_setup_title: "Définir le mot de passe admin",
    admin_setup_subtitle: "Première connexion pour ce compte admin. Choisissez un mot de passe pour le sécuriser.",
    admin_setup_new_password: "Nouveau mot de passe",
    admin_setup_confirm_password: "Confirmer le mot de passe",
    admin_setup_btn: "Enregistrer et se connecter",
    adminSetupTooShort: "Le mot de passe doit comporter au moins 8 caractères.",
    adminSetupMismatch: "Les mots de passe ne correspondent pas.",
    register_title: "Créer un compte",
    register_subtitle: "Inscrivez-vous avec votre nom d'utilisateur, mot de passe et le code d'inscription du workshop.",
    register_code_label: "Code d'inscription",
    register_btn: "Créer le compte",
    register_have_account: "Déjà inscrit ?",
    register_login_link: "Se connecter",
    labelAccessCode: "Code d'accès",
    loginBtn: "Accéder au Workshop",
    loginError: "Code d'accès invalide. Veuillez réessayer.",
    sidebarNewChat: "Nouvelle conversation",
    sidebarToday: "Aujourd'hui",
    sidebarLabGuide: "Directives",
    sidebarPromptLibrary: "Bibliothèque de prompts",
    sidebarConfig: "Configuration",
    sidebarThemeLight: "Mode clair",
    sidebarThemeDark: "Mode sombre",
    sidebarLogout: "Se déconnecter",
    participantSessionKicker: "Session de workshop",
    emptyKicker: "Netskope AI Gateway Workshop & CTF All in one",
    emptyTitle: "Console du laboratoire AI Gateway",
    emptySubtitle: "Lancez des prompts de workshop, comparez les routes secured et direct, et observez l'effet des politiques sur le trafic IA.",
    emptyPromptTitle: "Bibliothèque de prompts",
    emptyPromptBody: "Utiliser les prompts préparés du workshop",
    emptyCtfTitle: "Capture the Flag",
    emptyCtfBody: "Relevez les défis et marquez des points",
    emptyGuideTitle: "Directives",
    emptyGuideBody: "Objectifs du workshop et défis",
    inputHint: "Entrée pour envoyer · Shift+Entrée pour nouvelle ligne",
    btnSend: "Envoyer",
    inputFooter: "Acheminé via Netskope AI Gateway · Tout le trafic est surveillé et enregistré",
    panelConfigTitle: "Configuration",
    cfgSectionGateway: "Gateway",
    cfgLabelUrl: "Netskope AI Gateway URL endpoint",
    cfgLabelApikey: "Votre clé API (lecture seule)",
    cfgLabelTokenGroup: "Netskope AI GW Token Group",
    cfgLabelTokenName: "Netskope AI GW Token Name",
    cfgSectionMode: "Mode",
    cfgSectionLlm: "Paramètres LLM",
    cfgLabelProvider: "Fournisseur",
    cfgLabelModel: "Modèle",
    cfgSectionMcp: "Paramètres MCP",
    cfgLabelMcpServer: "URL du serveur MCP",
    panelLabTitle: "Directives",
    panelPromptLibraryTitle: "Bibliothèque de prompts",
    promptLibraryLoading: "Chargement des prompts...",
    promptLibraryLoadError: "Impossible de charger les prompts.",
    promptLibraryEmpty: "Aucun prompt disponible.",
    promptLibraryHint: "glisser ou cliquer",
    promptLibraryUse: "Utiliser →",
    userRole: "Participant au workshop",
    headerModelLabel: (model, mode) => `${model} · Mode ${mode === 'mcp' ? 'MCP' : 'LLM'}`,
    participantTourStepLabel: (current, total) => `Étape ${current} sur ${total}`,
    participantTourSkip: "Ignorer",
    participantTourBack: "Retour",
    participantTourNext: "Suivant",
    participantTourFinish: "Terminer",
    participantTourSteps: {
      workspace: {
        title: "Commencez dans la console du lab",
        body: "Ceci est votre espace participant. Depuis un seul écran, vous utilisez le chat, les prompts préparés, les directives, les défis CTF, le classement et la configuration."
      },
      routing: {
        title: "Choisir Secured ou Direct",
        body: "Secured envoie les prompts via Netskope AI Gateway pour les politiques, la DLP, la journalisation et l'attribution utilisateur. Direct contourne le gateway et sert surtout aux défis qui demandent une comparaison."
      },
      quota: {
        title: "Surveiller votre quota de prompts",
        body: "Le compteur indique combien de prompts il vous reste pour la session. Les messages Secured et Direct consomment tous deux le quota du workshop."
      },
      timer: {
        title: "Surveiller le chrono CTF",
        body: "Lorsque l'instructeur lance une session chronométrée, le chrono indique le temps restant. À expiration, le chat et les soumissions de défis sont bloqués."
      },
      chat: {
        title: "Envoyer les prompts ici",
        body: "Rédigez votre prompt dans l'éditeur. Le pied de page et le placeholder indiquent si le CTF est lancé, en attente, arrêté ou terminé."
      },
      guidelines: {
        title: "Consulter les directives",
        body: "Les directives expliquent l'objectif du workshop, la différence entre Secured et Direct, le fonctionnement du score et quoi faire si vous êtes bloqué."
      },
      prompts: {
        title: "Utiliser la bibliothèque de prompts",
        body: "Ouvrez la bibliothèque pour réutiliser les prompts fournis par l'instructeur. Cliquez sur un prompt ou glissez-le dans l'éditeur avant l'envoi."
      },
      challenges: {
        title: "Compléter les défis CTF",
        body: "Capture the Flag contient la liste des défis, votre progression et les règles. Une bonne réponse rapporte des points une seule fois ; erreurs et indices retirent 5 points, et trop d'échecs peuvent déclencher un cooldown."
      },
      leaderboard: {
        title: "Suivre le classement",
        body: "Quand l'instructeur le rend visible, le leaderboard affiche les scores et positions en direct. Les égalités sont départagées par le premier arrivé au score."
      },
      settings: {
        title: "Vérifier votre configuration",
        body: "Configuration affiche votre token group et token name Netskope, ainsi que les fournisseurs, modèles, mode LLM/MCP et serveurs MCP disponibles."
      }
    },
    labSteps: [
      { title: "🎯 Objectifs du Workshop", body: "Vous apprendrez comment Netskope AI Gateway intercepte, inspecte et contrôle le trafic IA en temps réel. À la fin, vous comprendrez comment appliquer des contrôles de politique, comparer le routage secured vs direct et analyser comment le gateway traite les données sensibles et les injections de prompts." },
      { title: "🏆 Défis", body: "Complétez les défis listés dans le panneau <strong>Challenges</strong>. Vous disposez de <strong>100 prompts</strong> partagés entre tous les défis — utilisez-les judicieusement. Notation : chaque défi attribue un nombre fixe de points à la première réussite ; les tentatives suivantes ne rapportent pas de points supplémentaires. Votre score total est la somme de tous les défis complétés." },
      { title: "📊 Leaderboard", body: "Votre score se met à jour en temps réel à chaque défi complété. Ouvrez le panneau <strong>Leaderboard</strong> pour voir votre classement parmi tous les participants. Les 3 meilleurs étudiants apparaissent sur le podium. Continuez — chaque défi compte !" },
      { title: "🔒 Secured vs Direct", body: "<strong>Secured</strong> achemine vos prompts via le Netskope AI Gateway — les politiques sont appliquées, le trafic est journalisé et les contrôles DLP sont actifs. <strong>Direct</strong> envoie vos prompts directement au fournisseur LLM, en contournant entièrement le gateway. Utilisez Direct uniquement lorsqu'un défi vous demande explicitement de comparer les deux modes." },
      { title: "🌐 Tenant Netskope", body: "N'oubliez pas d'accéder à votre tenant Netskope pour configurer votre Token Group et consulter les logs de l'AI Gateway. Vous pouvez y inspecter chaque requête envoyée par votre session via le gateway, vérifier les politiques appliquées et voir comment votre trafic est classifié en temps réel." },
      { title: "🆘 Support", body: "Si vous êtes bloqué, demandez à l'instructeur. Pour les problèmes techniques (erreurs de connexion, prompts manquants, score non mis à jour), essayez de rafraîchir la page — votre session est sauvegardée automatiquement. Si le problème persiste, notez le message d'erreur et signalez-le à l'équipe du workshop." },
    ]
  },
  de: {
    loginTitle: "Willkommen im Labor",
    loginSubtitle: "Geben Sie Ihren Zugangscode ein, um den Netskope AI Gateway Workshop & CTF All in one zu starten.",
    login_title: "Anmelden",
    login_subtitle: "Geben Sie Ihren Benutzernamen und Ihr Passwort ein, um auf das Labor zuzugreifen.",
    login_username: "Benutzername",
    login_password: "Passwort",
    login_btn: "Login",
    login_no_account: "Noch kein Konto?",
    login_register_link: "Hier registrieren",
    admin_setup_title: "Admin-Passwort festlegen",
    admin_setup_subtitle: "Erste Anmeldung für dieses Admin-Konto. Wählen Sie ein Passwort zur Absicherung.",
    admin_setup_new_password: "Neues Passwort",
    admin_setup_confirm_password: "Passwort bestätigen",
    admin_setup_btn: "Passwort speichern & anmelden",
    adminSetupTooShort: "Das Passwort muss mindestens 8 Zeichen lang sein.",
    adminSetupMismatch: "Die Passwörter stimmen nicht überein.",
    register_title: "Konto erstellen",
    register_subtitle: "Registrieren Sie sich mit Benutzername, Passwort und dem Workshop-Registrierungscode.",
    register_code_label: "Registrierungscode",
    register_btn: "Konto erstellen",
    register_have_account: "Bereits registriert?",
    register_login_link: "Anmelden",
    labelAccessCode: "Zugangscode",
    loginBtn: "Workshop betreten",
    loginError: "Ungültiger Zugangscode. Bitte versuchen Sie es erneut.",
    sidebarNewChat: "Neues Gespräch",
    sidebarToday: "Heute",
    sidebarLabGuide: "Richtlinien",
    sidebarPromptLibrary: "Prompt-Bibliothek",
    sidebarConfig: "Konfiguration",
    sidebarThemeLight: "Heller Modus",
    sidebarThemeDark: "Dunkler Modus",
    sidebarLogout: "Abmelden",
    participantSessionKicker: "Workshop-Sitzung",
    emptyKicker: "Netskope AI Gateway Workshop & CTF All in one",
    emptyTitle: "AI Gateway Lab-Konsole",
    emptySubtitle: "Führen Sie Workshop-Prompts aus, vergleichen Sie secured und direct Routing und prüfen Sie, wie Richtlinien den KI-Traffic beeinflussen.",
    emptyPromptTitle: "Prompt-Bibliothek",
    emptyPromptBody: "Vorbereitete Workshop-Prompts verwenden",
    emptyCtfTitle: "Capture the Flag",
    emptyCtfBody: "Herausforderungen lösen und punkten",
    emptyGuideTitle: "Richtlinien",
    emptyGuideBody: "Workshop-Ziele und Herausforderungen",
    inputHint: "Enter zum Senden · Shift+Enter für neue Zeile",
    btnSend: "Senden",
    inputFooter: "Geleitet über Netskope AI Gateway · Gesamter Datenverkehr wird überwacht",
    panelConfigTitle: "Konfiguration",
    cfgSectionGateway: "Gateway",
    cfgLabelUrl: "Netskope AI Gateway URL endpoint",
    cfgLabelApikey: "Ihr API-Schlüssel (nur lesbar)",
    cfgLabelTokenGroup: "Netskope AI GW Token Group",
    cfgLabelTokenName: "Netskope AI GW Token Name",
    cfgSectionMode: "Modus",
    cfgSectionLlm: "LLM-Einstellungen",
    cfgLabelProvider: "Anbieter",
    cfgLabelModel: "Modell",
    cfgSectionMcp: "MCP-Einstellungen",
    cfgLabelMcpServer: "MCP-Server URL",
    panelLabTitle: "Richtlinien",
    panelPromptLibraryTitle: "Prompt-Bibliothek",
    promptLibraryLoading: "Prompts werden geladen...",
    promptLibraryLoadError: "Prompts konnten nicht geladen werden.",
    promptLibraryEmpty: "Keine Prompts verfügbar.",
    promptLibraryHint: "ziehen oder klicken",
    promptLibraryUse: "Verwenden →",
    userRole: "Workshop-Teilnehmer",
    headerModelLabel: (model, mode) => `${model} · ${mode === 'mcp' ? 'MCP-Modus' : 'LLM-Modus'}`,
    participantTourStepLabel: (current, total) => `Schritt ${current} von ${total}`,
    participantTourSkip: "Überspringen",
    participantTourBack: "Zurück",
    participantTourNext: "Weiter",
    participantTourFinish: "Fertig",
    participantTourSteps: {
      workspace: {
        title: "In der Lab-Konsole starten",
        body: "Dies ist Ihr Teilnehmerbereich. Von einem Bildschirm aus nutzen Sie Chat, vorbereitete Prompts, Richtlinien, CTF-Aufgaben, Rangliste und Konfiguration."
      },
      routing: {
        title: "Secured oder Direct wählen",
        body: "Secured sendet Prompts über Netskope AI Gateway für Richtlinien, DLP, Protokollierung und Benutzerzuordnung. Direct umgeht den Gateway und ist vor allem für Aufgaben gedacht, die einen Vergleich verlangen."
      },
      quota: {
        title: "Prompt-Kontingent beobachten",
        body: "Der Zähler zeigt, wie viele Prompts in der Sitzung übrig sind. Secured- und Direct-Nachrichten verbrauchen beide das Workshop-Kontingent."
      },
      timer: {
        title: "CTF-Uhr im Blick behalten",
        body: "Wenn der Trainer einen zeitgesteuerten Lauf startet, zeigt die Uhr die Restzeit. Nach Ablauf werden Chat und Aufgabeneingaben blockiert."
      },
      chat: {
        title: "Prompts hier senden",
        body: "Schreiben Sie Ihren Prompt in den Editor. Fußzeile und Platzhalter zeigen, ob der CTF läuft, wartet, gestoppt ist oder die Zeit abgelaufen ist."
      },
      guidelines: {
        title: "Richtlinien prüfen",
        body: "Die Richtlinien erklären das Workshop-Ziel, den Unterschied zwischen Secured und Direct, die Wertung und was bei Problemen zu tun ist."
      },
      prompts: {
        title: "Prompt-Bibliothek nutzen",
        body: "Öffnen Sie die Bibliothek, um vom Trainer vorbereitete Prompts zu verwenden. Klicken Sie einen Prompt an oder ziehen Sie ihn vor dem Senden in den Editor."
      },
      challenges: {
        title: "CTF-Aufgaben lösen",
        body: "Capture the Flag enthält Aufgabenliste, Fortschritt und Regeln. Richtige Antworten bringen nur einmal Punkte; Fehler und Hinweise kosten 5 Punkte, und wiederholte Fehler können einen Cooldown auslösen."
      },
      leaderboard: {
        title: "Rangliste verfolgen",
        body: "Wenn der Trainer sie sichtbar macht, zeigt das Leaderboard Live-Punkte und Platzierungen. Gleichstände entscheidet, wer die Punktzahl zuerst erreicht hat."
      },
      settings: {
        title: "Konfiguration prüfen",
        body: "Konfiguration zeigt Ihre Netskope Token Group und den Token Name sowie verfügbare Anbieter, Modelle, LLM/MCP-Modus und MCP-Server."
      }
    },
    labSteps: [
      { title: "🎯 Workshop-Ziele", body: "Sie lernen, wie Netskope AI Gateway KI-Traffic in Echtzeit abfängt, inspiziert und kontrolliert. Am Ende verstehen Sie, wie Richtlinienkontrollen angewendet werden, wie Secured- vs. Direct-Routing verglichen wird und wie der Gateway mit sensiblen Daten und Prompt-Injektionen umgeht." },
      { title: "🏆 Herausforderungen", body: "Lösen Sie die Aufgaben im Panel <strong>Challenges</strong>. Sie verfügen über <strong>100 Prompts</strong>, die auf alle Aufgaben verteilt sind — setzen Sie sie gezielt ein. Punkte: Jede Aufgabe bringt beim ersten Lösen eine feste Punktzahl; erneute Versuche bringen keine weiteren Punkte. Ihr Gesamtpunktestand ergibt sich aus der Summe aller abgeschlossenen Aufgaben." },
      { title: "📊 Leaderboard", body: "Ihr Punktestand aktualisiert sich in Echtzeit. Öffnen Sie das Panel <strong>Leaderboard</strong>, um Ihre Position unter allen Teilnehmern zu sehen. Die 3 besten Studierenden erscheinen auf dem Podium. Weitermachen — jede Aufgabe zählt!" },
      { title: "🔒 Secured vs Direct", body: "<strong>Secured</strong> leitet Ihre Prompts über den Netskope AI Gateway — Richtlinien werden durchgesetzt, der Datenverkehr wird protokolliert und DLP-Kontrollen greifen. <strong>Direct</strong> sendet Ihre Prompts direkt an den LLM-Anbieter und umgeht den Gateway vollständig. Verwenden Sie Direct nur, wenn eine Aufgabe Sie ausdrücklich auffordert, beide Modi zu vergleichen." },
      { title: "🌐 Netskope-Tenant", body: "Denken Sie daran, Ihren Netskope-Tenant aufzurufen, um Ihre Token-Gruppe zu konfigurieren und die AI-Gateway-Logs einzusehen. Dort können Sie jede Anfrage Ihrer Sitzung über das Gateway inspizieren, angewendete Richtlinien prüfen und sehen, wie Ihr Datenverkehr in Echtzeit klassifiziert wird." },
      { title: "🆘 Support", body: "Bei Schwierigkeiten wenden Sie sich an den Trainer. Bei technischen Problemen (Verbindungsfehler, fehlende Prompts, Punktestand wird nicht aktualisiert) laden Sie die Seite neu — Ihre Sitzung wird automatisch gespeichert. Sollte das Problem bestehen bleiben, notieren Sie die Fehlermeldung und informieren Sie das Workshop-Team." },
    ]
  }
};

const MODELS = {
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { value: 'o4-mini', label: 'o4 mini' },
  ],
  anthropic: [
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  ],
  claude: [
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  ],
  gemini: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  ],
  google: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  ],
  mistral: [
    { value: 'mistral-small-latest', label: 'Mistral Small' },
    { value: 'mistral-small-2503', label: 'Mistral Small 25.03' },
    { value: 'open-mistral-nemo', label: 'Mistral Nemo' },
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek V3' },
    { value: 'deepseek-reasoner', label: 'DeepSeek R1' },
    { value: 'deepseek-v3-0324', label: 'DeepSeek V3 0324' },
  ],
  xai: [
    { value: 'grok-3-mini', label: 'Grok 3 Mini' },
    { value: 'grok-3-mini-fast', label: 'Grok 3 Mini Fast' },
    { value: 'grok-2-1212', label: 'Grok 2' },
  ],
  perplexity: [
    { value: 'sonar', label: 'Sonar' },
    { value: 'sonar-pro', label: 'Sonar Pro' },
    { value: 'sonar-reasoning', label: 'Sonar Reasoning' },
  ],
  cohere: [
    { value: 'command-r', label: 'Command R' },
    { value: 'command-r-plus', label: 'Command R+' },
    { value: 'command-a-03-2025', label: 'Command A' },
  ],
  bedrock: [
    { value: 'amazon.nova-lite-v1:0', label: 'Nova Lite' },
    { value: 'amazon.nova-micro-v1:0', label: 'Nova Micro' },
    { value: 'meta.llama3-3-70b-instruct-v1:0', label: 'Llama 3.3 70B' },
  ],
};

let currentLang = localStorage.getItem('cd_lang') || 'en';
document.addEventListener('DOMContentLoaded', () => updateLangPicker(currentLang));

function t(key, ...args) {
  const tr = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  const val = tr[key] || TRANSLATIONS.en[key] || key;
  return typeof val === 'function' ? val(...args) : val;
}

const LANG_FLAGS = { en: '🇬🇧', es: '🇪🇸', pt: '🇵🇹', fr: '🇫🇷', de: '🇩🇪' };

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('cd_lang', lang);
  updateLangPicker(lang);
  applyTranslations();
  if (typeof applyAdminLang === 'function') applyAdminLang(lang);
}

function updateLangPicker(lang) {
  const flag = LANG_FLAGS[lang] || '🌐';
  const f = document.getElementById('login-lang-flag'); if (f) f.textContent = flag;
  const l = document.getElementById('login-lang-label'); if (l) l.textContent = lang.toUpperCase();
  document.querySelectorAll('.lang-picker-dropdown button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  closeLangPicker();
}

function toggleLangPicker(e) {
  e.stopPropagation();
  document.getElementById('lang-picker-dropdown')?.classList.toggle('open');
}

function closeLangPicker() {
  document.getElementById('lang-picker-dropdown')?.classList.remove('open');
}

document.addEventListener('click', closeLangPicker);

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val && val !== key) el.textContent = val;
  });
  const set = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = t(key); };
  set('login-title', 'loginTitle');
  set('login-subtitle', 'loginSubtitle');
  set('label-access-code', 'labelAccessCode');
  set('login-btn-text', 'loginBtn');
  set('sidebar-new-chat', 'sidebarNewChat');
  set('sidebar-today', 'sidebarToday');
  set('sidebar-lab-guide', 'sidebarLabGuide');
  set('sidebar-prompts', 'sidebarPromptLibrary');
  set('sidebar-config', 'sidebarConfig');
  set('sidebar-logout', 'sidebarLogout');
  set('participant-session-kicker', 'participantSessionKicker');
  set('empty-kicker', 'emptyKicker');
  set('empty-title', 'emptyTitle');
  set('empty-subtitle', 'emptySubtitle');
  set('empty-prompt-title', 'emptyPromptTitle');
  set('empty-prompt-body', 'emptyPromptBody');
  set('empty-ctf-title', 'emptyCtfTitle');
  set('empty-ctf-body', 'emptyCtfBody');
  set('empty-guide-title', 'emptyGuideTitle');
  set('empty-guide-body', 'emptyGuideBody');
  set('input-hint', 'inputHint');
  set('btn-send-text', 'btnSend');
  set('input-footer', 'inputFooter');
  set('panel-config-title', 'panelConfigTitle');
  set('cfg-section-gateway', 'cfgSectionGateway');
  set('cfg-label-url', 'cfgLabelUrl');
  set('cfg-label-apikey', 'cfgLabelApikey');
  set('cfg-label-token-group', 'cfgLabelTokenGroup');
  set('cfg-label-token-name', 'cfgLabelTokenName');
  set('cfg-section-mode', 'cfgSectionMode');
  set('cfg-section-llm', 'cfgSectionLlm');
  set('cfg-label-provider', 'cfgLabelProvider');
  set('cfg-label-model', 'cfgLabelModel');
  set('cfg-section-mcp', 'cfgSectionMcp');
  set('cfg-label-mcp-server', 'cfgLabelMcpServer');
  set('panel-lab-title', 'panelLabTitle');
  set('participant-prompt-library-title', 'panelPromptLibraryTitle');

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const themeEl = document.getElementById('sidebar-theme');
  if (themeEl) themeEl.textContent = isDark ? t('sidebarThemeLight') : t('sidebarThemeDark');

  const userRoleEl = document.getElementById('user-role');
  if (userRoleEl) userRoleEl.textContent = t('userRole');

  renderLabInstructions();
  updateHeaderModelLabel();
  if (typeof renderStudentPromptLibrary === 'function' && document.getElementById('prompt-library-panel')?.classList.contains('open')) {
    renderStudentPromptLibrary();
  }
  if (typeof renderParticipantTourStep === 'function' && document.getElementById('participant-tour')?.classList.contains('open')) {
    renderParticipantTourStep();
  }
}

function renderLabInstructions() {
  const container = document.getElementById('lab-instructions-content');
  if (!container) return;
  const steps = t('labSteps');
  container.innerHTML = steps.map((s) => {
    const icon = [...s.title][0];
    const label = s.title.slice(icon.length).trim();
    return `
    <div class="lab-step">
      <div class="step-number">${icon}</div>
      <div class="step-content">
        <h3>${label}</h3>
        <p>${s.body}</p>
      </div>
    </div>`;
  }).join('');
}

function updateHeaderModelLabel() {
  const el = document.getElementById('header-model-label');
  if (!el) return;
  const model = document.getElementById('cfg-model')?.value || 'gpt-4o';
  const mode = document.getElementById('mode-llm')?.classList.contains('active') ? 'llm' : 'mcp';
  const routeMode = (typeof currentRouteMode !== 'undefined' ? currentRouteMode : 'secured');
  const routeLabel = routeMode === 'direct' ? '⚡ Direct' : '🔒 Secured';
  el.textContent = `${t('headerModelLabel', model, mode)} · ${routeLabel}`;
}

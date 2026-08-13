import type { AppRole } from "./auth-navigation";

export type HelpCategoryId = "primeiros-passos" | "operacoes" | "gestao" | "financeiro" | "acesso";

type HelpStep = {
  title: string;
  description: string;
};

export type HelpArticle = {
  id: string;
  category: HelpCategoryId;
  title: string;
  summary: string;
  roles: AppRole[];
  keywords: string[];
  steps: HelpStep[];
  tips?: string[];
  path?: string;
  pathLabel?: string;
  relatedIds?: string[];
};

type HelpFaq = {
  id: string;
  question: string;
  answer: string;
  roles: AppRole[];
  articleId?: string;
};

type HelpQuickAction = {
  id: string;
  label: string;
  description: string;
  href: string;
  roles: AppRole[];
};

type HelpChecklistItem = {
  id: string;
  label: string;
  description: string;
  articleId: string;
};

const companyRoles: AppRole[] = ["COMPANY_ADMIN"];
const financialRoles: AppRole[] = ["COMPANY_ADMIN", "SUPER_ADMIN"];
const everyRole: AppRole[] = ["COMPANY_ADMIN", "SUPER_ADMIN", "DRIVER"];

export const HELP_CATEGORIES: Array<{ id: HelpCategoryId; label: string; description: string }> = [
  { id: "primeiros-passos", label: "Primeiros passos", description: "Acesso, navegação e sequência inicial recomendada." },
  { id: "operacoes", label: "Operações e abastecimentos", description: "Jornadas, odômetros, importações e combustível." },
  { id: "gestao", label: "Gestão da empresa", description: "Motoristas, empresas e contratos." },
  { id: "financeiro", label: "Resultado e faturamento", description: "Indicadores, lançamentos, alertas, insights e fechamentos." },
  { id: "acesso", label: "Acesso e segurança", description: "Senha, perfis, permissões e encerramento de sessão." },
];

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "entrar-e-recuperar-senha",
    category: "acesso",
    title: "Entrar e recuperar a senha",
    summary: "Acesse com o e-mail cadastrado ou solicite um link temporário de recuperação.",
    roles: everyRole,
    keywords: ["login", "senha", "e-mail", "recuperação", "entrar", "acesso"],
    steps: [
      { title: "Abra a tela de login", description: "Informe o e-mail cadastrado pelo administrador e sua senha." },
      { title: "Entre na plataforma", description: "Use “Entrar na plataforma”. O sistema direciona cada perfil para sua página inicial." },
      { title: "Recupere o acesso, se necessário", description: "Em “Esqueci minha senha”, informe o e-mail. Se ele existir, o OperBase enviará as instruções de redefinição." },
    ],
    tips: ["O link de recuperação é temporário.", "O modo demo da tela de login permite explorar sem alterar dados reais."],
    path: "/forgot-password",
    pathLabel: "Ir para recuperação de senha",
  },
  {
    id: "navegar-sem-sair",
    category: "primeiros-passos",
    title: "Navegar, voltar e sair da conta",
    summary: "Use o menu, o logotipo e o botão de retorno para navegar; sair da conta é uma ação separada e confirmada.",
    roles: everyRole,
    keywords: ["menu", "dashboard", "voltar", "logo", "logout", "sair", "navegação"],
    steps: [
      { title: "Troque de módulo pelo menu", description: "Os itens disponíveis mudam conforme o seu perfil. No celular, abra o menu pelo botão no cabeçalho." },
      { title: "Volte sem encerrar a sessão", description: "Clique no logotipo OperBase, no breadcrumb ou em “Voltar para Dashboard” quando esse botão estiver disponível." },
      { title: "Encerre somente quando quiser", description: "“Sair da conta” abre uma confirmação. Cancelar mantém você na tela atual." },
    ],
    tips: ["Ajuda / Como usar nunca encerra a sessão."],
  },
  {
    id: "primeira-configuracao-empresa",
    category: "primeiros-passos",
    title: "Primeira configuração da empresa",
    summary: "Uma sequência curta para preparar motoristas, contratos e a primeira operação.",
    roles: companyRoles,
    keywords: ["começar", "configuração", "empresa", "primeiro uso", "checklist"],
    steps: [
      { title: "Cadastre os motoristas", description: "Crie os nomes que serão selecionados nas operações; e-mail não é obrigatório." },
      { title: "Cadastre o contrato, se houver", description: "Defina o modelo de receita, valores e quilômetros contratados para alimentar o resultado financeiro." },
      { title: "Registre a primeira operação", description: "Informe veículo, placa, motorista e odômetros. O total rodado é calculado automaticamente." },
      { title: "Confira o resultado", description: "Use a Dashboard financeira para acompanhar receitas, custos, alertas e sugestões." },
    ],
    relatedIds: ["cadastrar-motoristas", "criar-operacao", "gerenciar-contratos", "resultado-operacional"],
  },
  {
    id: "criar-operacao",
    category: "operacoes",
    title: "Criar ou editar uma operação",
    summary: "Registre a jornada com identificação, motorista e odômetros; o KM total é validado e calculado pelo sistema.",
    roles: companyRoles,
    keywords: ["nova operação", "rota", "jornada", "odômetro", "km inicial", "km final", "veículo", "placa"],
    steps: [
      { title: "Abra Nova operação", description: "Em Operações, use “Nova operação”. Para corrigir um registro existente, use a ação de editar na tabela." },
      { title: "Preencha a identificação", description: "Informe data, veículo, placa e um motorista ativo. Contrato, supervisor e solicitante são opcionais." },
      { title: "Informe os odômetros", description: "Digite KM inicial e KM final. O OperBase calcula o KM total como final menos inicial." },
      { title: "Revise e salve", description: "Distâncias extremas exigem justificativa e confirmação. Uma possível duplicidade também precisa de revisão explícita." },
    ],
    tips: ["O cadastro do veículo/placa acontece dentro da operação; ainda não existe um módulo separado de frota.", "Somente administradores podem associar contratos financeiros."],
    path: "/operacoes",
    pathLabel: "Abrir Operações",
    relatedIds: ["abastecimentos-da-operacao", "importar-operacoes"],
  },
  {
    id: "abastecimentos-da-operacao",
    category: "operacoes",
    title: "Registrar abastecimentos em uma operação",
    summary: "Cadastre cada parada em posto separadamente e deixe o OperBase calcular litros, preço por litro ou total pago.",
    roles: companyRoles,
    keywords: ["abastecimento", "posto", "diesel", "litros", "preço por litro", "valor pago", "comprovante", "bomba"],
    steps: [
      { title: "Marque que houve abastecimento", description: "Na aba Jornada da operação, ative “Houve abastecimento nesta operação”." },
      { title: "Abra a aba Abastecimentos", description: "Use “Adicionar posto” para cada parada. Isso mantém preços e comprovantes separados quando há mais de um posto." },
      { title: "Preencha os dados", description: "Informe posto, odômetro, data, combustível e tipo. Preencha quaisquer dois valores entre total pago, preço por litro e litros; o terceiro é calculado." },
      { title: "Anexe e salve", description: "Comprovante e foto da bomba são opcionais. O total pago da jornada é somado automaticamente." },
    ],
    tips: ["O odômetro do abastecimento deve ficar entre o KM inicial e o KM final da operação."],
    path: "/operacoes",
    pathLabel: "Abrir Operações",
    relatedIds: ["criar-operacao", "abastecimento-motorista"],
  },
  {
    id: "importar-operacoes",
    category: "operacoes",
    title: "Importar planilha, PDF ou imagem",
    summary: "Extraia dados de arquivos, revise a tabela e só então confirme a gravação.",
    roles: companyRoles,
    keywords: ["importar", "excel", "csv", "pdf", "imagem", "foto", "ocr", "planilha", "documento"],
    steps: [
      { title: "Abra Importar arquivo", description: "Selecione XLSX, XLS, CSV, PDF, JPG ou PNG de até 15 MB. No celular, também é possível abrir a câmera." },
      { title: "Aguarde a extração", description: "Bibliotecas e OCR são carregados somente quando necessários. Arquivos digitalizados podem levar mais tempo." },
      { title: "Revise todas as linhas", description: "Corrija campos destacados, confira a confiança do reconhecimento e ajuste o mapeamento de colunas quando solicitado." },
      { title: "Confirme a importação", description: "Nada é salvo automaticamente. Duplicidades exigem revisão e confirmação antes da gravação." },
    ],
    tips: ["Fotos retas, bem iluminadas e com texto legível melhoram o OCR."],
    path: "/operacoes?tab=imports",
    pathLabel: "Abrir Importações",
    relatedIds: ["criar-operacao"],
  },
  {
    id: "cadastrar-motoristas",
    category: "gestao",
    title: "Cadastrar e gerenciar motoristas",
    summary: "Crie o motorista pelo nome, sem convite ou e-mail obrigatório, e controle seu status.",
    roles: companyRoles,
    keywords: ["motorista", "cadastrar", "nome", "matrícula", "telefone", "ativar", "desativar", "excluir"],
    steps: [
      { title: "Abra Motoristas", description: "Use “Cadastrar motorista” para criar um registro interno da empresa." },
      { title: "Informe o nome", description: "Telefone e matrícula são opcionais. Esse fluxo não envia convite por e-mail." },
      { title: "Gerencie o cadastro", description: "Na tabela, edite os dados, ative ou desative o motorista e exclua registros que não devem mais ser usados." },
      { title: "Use nas operações", description: "Motoristas ativos ficam disponíveis no seletor de Nova operação." },
    ],
    path: "/usuarios",
    pathLabel: "Abrir Motoristas",
    relatedIds: ["criar-operacao"],
  },
  {
    id: "gerenciar-contratos",
    category: "gestao",
    title: "Criar e gerenciar contratos",
    summary: "Defina o modelo de receita, valores, KM contratado, provisão e ciclo de vida do contrato.",
    roles: financialRoles,
    keywords: ["contrato", "contratante", "receita", "km contratado", "km excedente", "provisão", "lixeira", "duplicar"],
    steps: [
      { title: "Crie o contrato", description: "Informe contratante, nome, modelo de receita, status e data inicial. Complete os valores que correspondem à negociação." },
      { title: "Revise as regras financeiras", description: "KM contratado é a franquia incluída; valor por KM atende contratos variáveis; KM excedente define a cobrança adicional." },
      { title: "Acompanhe e ajuste", description: "Use visualizar, editar ou duplicar. A cópia reaproveita configurações, mas não duplica históricos." },
      { title: "Encerre com segurança", description: "A exclusão envia o contrato para a Lixeira e preserva o histórico. A exclusão permanente é bloqueada quando existem referências." },
    ],
    path: "/contratos",
    pathLabel: "Abrir Contratos",
    relatedIds: ["resultado-operacional", "lancamentos-financeiros"],
  },
  {
    id: "resultado-operacional",
    category: "financeiro",
    title: "Ler a Dashboard e o Resultado Operacional",
    summary: "Entenda o caminho entre previsão, faturamento, recebimento, custos, resultado, alertas e insights.",
    roles: financialRoles,
    keywords: ["dashboard", "resultado operacional", "faturamento", "recebimento", "custos", "gráfico", "alerta", "insight", "margem"],
    steps: [
      { title: "Escolha o período", description: "Use os atalhos ou as datas. Filtros por contrato, contratante, linha, rota, veículo e motorista refinam todos os indicadores." },
      { title: "Leia o fluxo financeiro", description: "Entradas recebidas menos saídas formam o resultado. A margem mostra a proporção do resultado sobre a receita." },
      { title: "Acompanhe o funil", description: "Previsto, faturado e recebido revelam o que ainda precisa virar fatura ou caixa." },
      { title: "Aja com contexto", description: "Alertas priorizam desvios. Insights sugerem ações calculadas com os registros, mas documentos e regras contratuais devem ser validados antes da decisão." },
    ],
    tips: ["Clique em um indicador para abrir seus detalhes.", "Resultado operacional é a diferença entre receitas consideradas e despesas do período."],
    path: "/resultado-operacional",
    pathLabel: "Abrir Resultado Operacional",
    relatedIds: ["lancamentos-financeiros", "fechar-periodo", "exportar-excel"],
  },
  {
    id: "lancamentos-financeiros",
    category: "financeiro",
    title: "Registrar receitas, despesas e documentos financeiros",
    summary: "Cadastre fatos financeiros sem recadastrar operações e mantenha a origem explícita para evitar duplicidade.",
    roles: financialRoles,
    keywords: ["receita", "despesa", "fatura", "recebimento", "manutenção", "contratante", "lançamento"],
    steps: [
      { title: "Abra Cadastros e lançamentos", description: "Na Dashboard, escolha Nova receita, Nova despesa, Faturamento, Recebimento, Manutenção, Contrato ou Contratante." },
      { title: "Relacione quando existir vínculo", description: "Associe contrato, rota ou placa quando o formulário oferecer essa opção. Isso melhora análises e evita valores soltos." },
      { title: "Salve e confira", description: "Após a gravação, o OperBase recalcula os indicadores e registra a origem da movimentação." },
    ],
    path: "/resultado-operacional",
    pathLabel: "Abrir lançamentos",
    relatedIds: ["resultado-operacional", "gerenciar-contratos"],
  },
  {
    id: "fechar-periodo",
    category: "financeiro",
    title: "Fechar ou reabrir um período",
    summary: "Preserve uma fotografia histórica dos resultados e use justificativa quando precisar reabrir.",
    roles: financialRoles,
    keywords: ["fechar período", "reabrir", "snapshot", "histórico", "revisão", "competência"],
    steps: [
      { title: "Revise o período", description: "Confira filtros, contratos, faturas, recebimentos, abastecimentos e despesas antes do fechamento." },
      { title: "Feche o período", description: "Use “Fechar período”. O snapshot preserva os números daquele momento e aparece no histórico." },
      { title: "Reabra somente quando necessário", description: "No histórico, use Reabrir e registre uma justificativa. Uma nova revisão poderá ser fechada depois." },
    ],
    path: "/resultado-operacional",
    pathLabel: "Abrir histórico de fechamentos",
    relatedIds: ["resultado-operacional"],
  },
  {
    id: "exportar-excel",
    category: "financeiro",
    title: "Exportar o resultado para Excel",
    summary: "Baixe um arquivo com resumo, receitas, combustível, manutenção, despesas, veículos e contratos.",
    roles: financialRoles,
    keywords: ["excel", "exportar", "planilha", "resumo", "combustível", "manutenção"],
    steps: [
      { title: "Aplique os filtros", description: "O arquivo usa o mesmo período e recortes exibidos no painel." },
      { title: "Clique em Exportar Excel", description: "A biblioteca de exportação é carregada sob demanda e o botão mostra o progresso." },
      { title: "Revise as abas", description: "O arquivo inclui Resumo, Receitas, Combustível, Manutenção, Despesas, Veículos e Contratos." },
    ],
    path: "/resultado-operacional",
    pathLabel: "Abrir Resultado Operacional",
  },
  {
    id: "administracao-global",
    category: "gestao",
    title: "Administrar empresas e acessos da plataforma",
    summary: "Crie empresas, defina o primeiro responsável e gerencie usuários, perfis e status.",
    roles: ["SUPER_ADMIN"],
    keywords: ["super admin", "empresa", "tenant", "usuário", "perfil", "convite", "suspender", "redefinir senha"],
    steps: [
      { title: "Crie a empresa", description: "Use Nova empresa, informe os dados do tenant e o responsável. O primeiro administrador é convidado no mesmo fluxo." },
      { title: "Gerencie os acessos", description: "Crie usuários, selecione empresa e perfil, altere status ou redefina a senha." },
      { title: "Suspenda com cuidado", description: "Empresas suspensas e usuários inativos deixam de ter acesso conforme as regras do servidor." },
    ],
    path: "/admin",
    pathLabel: "Abrir Administração global",
  },
  {
    id: "minhas-rotas-motorista",
    category: "operacoes",
    title: "Consultar minhas rotas",
    summary: "Veja somente as operações atribuídas ao seu usuário e os dados essenciais de cada jornada.",
    roles: ["DRIVER"],
    keywords: ["motorista", "minhas rotas", "operação", "veículo", "placa", "odômetro"],
    steps: [
      { title: "Abra Minhas rotas", description: "A lista mostra somente operações vinculadas ao seu acesso de motorista." },
      { title: "Confira a jornada", description: "Revise rota, veículo, placa, data, odômetros e quilômetros apresentados no cartão." },
      { title: "Registre combustível quando necessário", description: "Use “Lançar abastecimento” na operação correta." },
    ],
    tips: ["O perfil de motorista não exibe contratos, faturamento, despesas ou administração."],
    path: "/motorista",
    pathLabel: "Abrir Minhas rotas",
    relatedIds: ["abastecimento-motorista"],
  },
  {
    id: "abastecimento-motorista",
    category: "operacoes",
    title: "Lançar um abastecimento como motorista",
    summary: "Registre posto, odômetro, data, combustível, valores e fotos na rota atribuída.",
    roles: ["DRIVER"],
    keywords: ["motorista", "abastecimento", "posto", "litros", "preço", "valor pago", "comprovante", "bomba"],
    steps: [
      { title: "Escolha a rota", description: "Em Minhas rotas, clique em “Lançar abastecimento” no cartão correto." },
      { title: "Preencha o abastecimento", description: "Informe posto, odômetro atual, data, combustível e tipo. Horário é opcional." },
      { title: "Informe dois valores", description: "Preencha quaisquer dois entre valor total, preço por litro e litros. O terceiro é calculado automaticamente." },
      { title: "Anexe e salve", description: "Comprovante, foto da bomba e observações são opcionais. Use “Salvar abastecimento” para concluir." },
    ],
    tips: ["Use “Voltar para minhas rotas” para cancelar a visualização do formulário sem sair da conta."],
    path: "/motorista",
    pathLabel: "Abrir Minhas rotas",
    relatedIds: ["minhas-rotas-motorista"],
  },
];

const HELP_FAQS: HelpFaq[] = [
  { id: "faq-ajuda-sai", question: "Abrir a Ajuda encerra minha sessão?", answer: "Não. Ajuda / Como usar é um item normal de navegação. A sessão só é encerrada depois de clicar em “Sair da conta” e confirmar.", roles: everyRole, articleId: "navegar-sem-sair" },
  { id: "faq-km", question: "Como o KM total é calculado?", answer: "O OperBase subtrai o KM inicial do KM final. O servidor valida o resultado; distâncias extremas exigem justificativa e confirmação.", roles: companyRoles, articleId: "criar-operacao" },
  { id: "faq-veiculo", question: "Onde cadastro um veículo?", answer: "Na versão atual, veículo e placa são informados na operação. Ainda não existe um módulo separado de cadastro de frota.", roles: companyRoles, articleId: "criar-operacao" },
  { id: "faq-dois-postos", question: "Como registrar abastecimento em mais de um posto?", answer: "Na aba Abastecimentos da operação, adicione uma parada para cada posto. O total pago é somado automaticamente.", roles: companyRoles, articleId: "abastecimentos-da-operacao" },
  { id: "faq-motorista-email", question: "Preciso do e-mail para cadastrar um motorista?", answer: "Não. O cadastro interno do motorista exige o nome; telefone e matrícula são opcionais e nenhum convite é enviado.", roles: companyRoles, articleId: "cadastrar-motoristas" },
  { id: "faq-importacao", question: "A importação salva o arquivo automaticamente?", answer: "Não. O documento é extraído para uma tabela de revisão. Você precisa corrigir pendências e confirmar antes de gravar.", roles: companyRoles, articleId: "importar-operacoes" },
  { id: "faq-resultado", question: "O que é resultado operacional?", answer: "É a diferença entre as receitas consideradas e as despesas do período filtrado. A margem apresenta esse resultado em relação à receita.", roles: financialRoles, articleId: "resultado-operacional" },
  { id: "faq-fechamento", question: "Posso alterar um período fechado?", answer: "O snapshot preserva o histórico. Quando uma correção for necessária, reabra o período com justificativa e depois gere uma nova revisão.", roles: financialRoles, articleId: "fechar-periodo" },
  { id: "faq-motorista-financeiro", question: "Por que não vejo contratos e valores financeiros?", answer: "O perfil de motorista é limitado às próprias rotas e aos abastecimentos vinculados. Dados administrativos e financeiros ficam restritos aos perfis autorizados.", roles: ["DRIVER"], articleId: "minhas-rotas-motorista" },
  { id: "faq-calculo-combustivel", question: "Preciso preencher litros, preço e valor total?", answer: "Não. No abastecimento, informe quaisquer dois desses três valores. O OperBase calcula o terceiro e valida a consistência.", roles: ["DRIVER"], articleId: "abastecimento-motorista" },
];

const HELP_QUICK_ACTIONS: HelpQuickAction[] = [
  { id: "quick-operation", label: "Quero criar uma operação", description: "Registre jornada, veículo, motorista e odômetros.", href: "/operacoes", roles: companyRoles },
  { id: "quick-import", label: "Quero importar um documento", description: "Revise planilha, PDF ou imagem antes de gravar.", href: "/operacoes?tab=imports", roles: companyRoles },
  { id: "quick-driver", label: "Quero cadastrar um motorista", description: "Crie o nome sem convite por e-mail.", href: "/usuarios", roles: companyRoles },
  { id: "quick-contract", label: "Quero gerenciar contratos", description: "Defina regras, valores e ciclo de vida.", href: "/contratos", roles: financialRoles },
  { id: "quick-results", label: "Quero analisar os resultados", description: "Abra indicadores, gráficos, alertas e insights.", href: "/resultado-operacional", roles: financialRoles },
  { id: "quick-admin", label: "Quero administrar acessos", description: "Gerencie empresas, usuários e perfis.", href: "/admin", roles: ["SUPER_ADMIN"] },
  { id: "quick-my-routes", label: "Quero ver minhas rotas", description: "Confira apenas as operações atribuídas a você.", href: "/motorista", roles: ["DRIVER"] },
  { id: "quick-driver-fuel", label: "Quero lançar abastecimento", description: "Escolha a rota e registre o combustível.", href: "/motorista", roles: ["DRIVER"] },
];

export const HELP_CHECKLISTS: Record<AppRole, HelpChecklistItem[]> = {
  COMPANY_ADMIN: [
    { id: "driver", label: "Cadastrar um motorista", description: "Prepare o nome que será selecionado nas operações.", articleId: "cadastrar-motoristas" },
    { id: "contract", label: "Cadastrar um contrato", description: "Opcional para operar, necessário para análises contratuais.", articleId: "gerenciar-contratos" },
    { id: "operation", label: "Registrar a primeira operação", description: "Informe os odômetros prioritários e salve.", articleId: "criar-operacao" },
    { id: "result", label: "Revisar o resultado", description: "Confira filtros, alertas e sugestões do painel.", articleId: "resultado-operacional" },
  ],
  SUPER_ADMIN: [
    { id: "company", label: "Criar uma empresa", description: "Cadastre o tenant e seu primeiro responsável.", articleId: "administracao-global" },
    { id: "access", label: "Revisar perfis e acessos", description: "Confirme empresa, perfil e status dos usuários.", articleId: "administracao-global" },
    { id: "contracts", label: "Consultar contratos", description: "Verifique o ciclo de vida e os vínculos financeiros.", articleId: "gerenciar-contratos" },
    { id: "results", label: "Consultar o resultado", description: "Use filtros e acompanhe o histórico de fechamentos.", articleId: "resultado-operacional" },
  ],
  DRIVER: [
    { id: "routes", label: "Conferir minhas rotas", description: "Valide veículo, placa, data e odômetros.", articleId: "minhas-rotas-motorista" },
    { id: "fuel", label: "Aprender a lançar abastecimento", description: "Veja campos, cálculo automático e anexos.", articleId: "abastecimento-motorista" },
    { id: "navigation", label: "Aprender a voltar sem sair", description: "Diferencie navegação e encerramento de sessão.", articleId: "navegar-sem-sair" },
  ],
};

export function normalizeHelpText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}

export function canRoleSeeHelpContent(roles: AppRole[], role: AppRole) {
  return roles.includes(role);
}

export function getHelpArticleById(id: string) {
  return HELP_ARTICLES.find((article) => article.id === id);
}

export function visibleHelpArticles(role: AppRole) {
  return HELP_ARTICLES.filter((article) => canRoleSeeHelpContent(article.roles, role));
}

export function searchHelpArticles(role: AppRole, query = "", category?: HelpCategoryId | "all") {
  const normalizedQuery = normalizeHelpText(query);
  return visibleHelpArticles(role).filter((article) => {
    if (category && category !== "all" && article.category !== category) return false;
    if (!normalizedQuery) return true;
    const searchable = normalizeHelpText([
      article.title,
      article.summary,
      article.keywords.join(" "),
      ...article.steps.flatMap((step) => [step.title, step.description]),
      ...(article.tips ?? []),
    ].join(" "));
    return normalizedQuery.split(" ").every((term) => searchable.includes(term));
  });
}

export function visibleHelpFaqs(role: AppRole) {
  return HELP_FAQS.filter((faq) => canRoleSeeHelpContent(faq.roles, role));
}

export function visibleHelpQuickActions(role: AppRole) {
  return HELP_QUICK_ACTIONS.filter((action) => canRoleSeeHelpContent(action.roles, role));
}

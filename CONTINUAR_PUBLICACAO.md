# Contexto operacional do RotaFlux

> Documento obrigatório para qualquer pessoa ou agente que trabalhe neste repositório. Leia-o antes de analisar, implementar, corrigir, mesclar ou publicar mudanças.

## Governança obrigatória no GitHub

Toda tarefa deve começar por uma Issue no repositório `essemesmo777/rotaflux-dashboard`. Não iniciar implementação sem uma Issue relacionada.

Cada Issue deve usar exatamente uma destas classificações:

- `Correção`: falha, regressão, erro de segurança ou comportamento diferente do esperado;
- `Melhoria`: aprimoramento de UX, desempenho, qualidade, arquitetura, documentação ou processo existente;
- `Nova função`: capacidade nova disponibilizada ao usuário ou à operação.

O título deve começar com `[Correção]`, `[Melhoria]` ou `[Nova função]`. A Issue deve registrar contexto, escopo, critérios de aceite, validação esperada e riscos conhecidos.

## Fluxo obrigatório de entrega

1. Confirmar ou criar a Issue e aplicar uma única classificação.
2. Atualizar a branch `main` local sem sobrescrever mudanças do usuário.
3. Criar uma branch `agent/<descrição-curta>` a partir de `main`.
4. Implementar somente o escopo acordado na Issue.
5. Executar validações proporcionais ao risco, incluindo os comandos padrão abaixo quando aplicáveis.
6. Fazer commit intencional e enviar a branch ao GitHub.
7. Abrir Pull Request relacionado à Issue. Não fazer push direto de mudanças funcionais em `main`.
8. Revisar o diff e o resultado das validações antes do merge.
9. Mesclar o Pull Request antes de qualquer deploy de produção.
10. Publicar exatamente o commit mesclado em `main` e registrar versão, commit e URL.

Todo Pull Request deve conter:

- `Closes #<número>` ou outra referência explícita à Issue relacionada;
- o que mudou e por que mudou;
- como a alteração foi validada, incluindo comandos e cenários manuais;
- riscos de regressão, segurança, dados e deploy;
- limitações conhecidas;
- próximos passos, mesmo quando não houver nenhum.

Use o template em `.github/PULL_REQUEST_TEMPLATE.md`. O PR deve permanecer em rascunho enquanto a implementação ou validação estiver incompleta.

## Validação padrão

Para mudanças na aplicação, executar antes do merge:

```bash
npx tsc --noEmit --incremental false
npm run lint
npm test
```

Registrar qualquer validação não executada, com a justificativa e o risco correspondente. Mudanças de autenticação, autorização, banco, RLS, uploads ou deploy exigem testes específicos além da suíte padrão.

## Esteira obrigatória antes da `main`

Toda Pull Request deve passar pelos checks definidos em `.github/workflows/quality.yml` e `.github/workflows/codeql.yml`. A proteção da branch `main` deve exigir Pull Request, checks atualizados, resolução de conversas e impedir force push e exclusão.

O contrato vigente inclui typecheck, ESLint, Biome, Commitlint, Knip, contrato de arquitetura, testes unitários e de integração com cobertura mínima, Playwright, auditoria de dependências, CodeQL, dependency review e performance budget. O Stryker roda semanalmente ou sob demanda. Consulte `docs/architecture/quality-contract.md` antes de adicionar bibliotecas, camadas, serviços ou componentes.

Use uma solução por responsabilidade enquanto não existir requisito concreto para outra: Sentry para observabilidade do Worker e Playwright para E2E. Datadog, New Relic, OpenTelemetry e Endtest só devem ser adicionados após registrar na Issue o problema que resolvem, o responsável operacional, custo, dados tratados e critério de sucesso. Não instalar ferramentas sobrepostas apenas para cumprir uma lista.

O rate limit de login, recuperação e OCR é aplicado no Worker e persistido no D1 sem armazenar o endereço IP em claro. Alterações nos limites ou no comportamento de falha exigem teste específico e revisão de segurança.

Termos de Uso e Política de Privacidade só podem ser marcados como aprovados quando houver evidência de revisão por profissional jurídico responsável. Agentes e automações não podem substituir ou presumir essa aprovação.

## Arquitetura e serviços atuais

- Aplicação: React 19 com Vinext e roteamento no estilo App Router.
- Autenticação e dados: Supabase, com sessão em cookies HttpOnly e isolamento por organização.
- Projeto Supabase: `gcqohezznnfrqnxzackb`.
- Projeto Sites: `appgprj_6a74f426ea84819185a0795e36524cdc`.
- URL de produção: `https://rotaflux-gestao-rotas.augustonanbrum.chatgpt.site`.
- Arquivo de hospedagem: `.openai/hosting.json`.
- Última versão confirmada no momento deste documento: Sites 13.
- Commit de produção confirmado: `1585ff2f660578f7b2cdd095ab0a5dcb2b66cf21`.

Antes de publicar, consultar o estado atual do GitHub e do Sites; os números acima são contexto histórico e podem ter avançado.

## Publicação no Sites

1. Usar as skills `sites-building` e `sites-hosting` quando disponíveis.
2. Reutilizar o `project_id` de `.openai/hosting.json`; nunca criar outro site para esta aplicação.
3. Obter credencial temporária nova para o repositório de origem quando necessário.
4. Não persistir nem exibir tokens do Sites, GitHub ou Supabase.
5. Fazer push do commit mesclado de `main` para a origem do Sites.
6. Gerar o build e empacotar o artefato a partir desse mesmo commit.
7. Salvar uma nova versão vinculada ao SHA exato e só então fazer o deploy.
8. Acompanhar o deployment até `succeeded` e validar a produção.

## Segurança e limites

- Nunca solicitar ou registrar senhas, tokens, chaves ou cookies de sessão.
- Nunca contornar RLS, proteção de rotas ou separação por organização para facilitar testes.
- Não fazer logout, excluir dados, mesclar ou publicar por consequência implícita de uma navegação.
- Não ampliar o escopo da Issue sem registrar a decisão e atualizar seus critérios de aceite.
- Preservar mudanças locais e externas que não pertençam à tarefa atual.

## Checklist de encerramento

- [ ] Issue classificada e relacionada ao PR;
- [ ] critérios de aceite atendidos;
- [ ] typecheck, lint, testes e build registrados;
- [ ] riscos, limitações e próximos passos documentados;
- [ ] PR revisado e mesclado;
- [ ] deploy, quando aplicável, vinculado ao commit mesclado;
- [ ] produção validada e URL informada;
- [ ] árvore de trabalho limpa.

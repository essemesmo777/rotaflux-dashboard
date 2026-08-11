# Contrato de qualidade e arquitetura

Este documento define a barreira mínima para uma alteração chegar à `main`. O objetivo é reduzir regressões sem transformar o RotaFlux em uma arquitetura maior que o produto.

## Fronteiras

- `app/` concentra páginas, layouts e adaptadores HTTP.
- `components/` contém interface reutilizável e não importa banco, Worker ou rotas de API.
- `lib/` contém regras de negócio e adaptadores de servidor; não depende da interface.
- `worker/` é a borda operacional: rate limit distribuído, observabilidade e entrega do Vinext.
- Supabase continua responsável por autenticação, dados de negócio e isolamento por organização. O D1 do Sites guarda somente contadores operacionais sem PII.

Depois de adicionar ou atualizar uma migração D1, execute `npm run db:migrate:local` antes de testar endpoints protegidos no servidor de desenvolvimento. O runtime falha fechado com 503 quando o armazenamento do rate limit não está disponível.

O comando `npm run arch:check` bloqueia dependências proibidas e exige que todo componente compartilhado esteja em `quality/component-registry.json`. Antes de criar um componente, o autor deve consultar esse registro e estender uma peça existente quando a responsabilidade for a mesma. O registro não substitui revisão humana: ele torna a decisão visível.

## Critérios pragmáticos

- Componentizar quando há responsabilidade própria, repetição real ou necessidade de teste isolado.
- Aplicar DRY depois que a duplicação e sua regra comum estiverem claras.
- Não criar serviços, filas, camadas ou abstrações para demanda hipotética.
- Medir desempenho antes de otimizar. O budget em `quality/performance-budget.json` impede crescimento silencioso do bundle.
- Manter frontend e backend separados por fronteiras de importação e por validação/autorização no servidor, sem dividir o produto prematuramente em repositórios ou microsserviços.

## Esteira

Cada Pull Request executa typecheck, ESLint, Biome, contrato de arquitetura, Knip, testes unitários/de integração com cobertura mínima, auditoria de dependências de produção, build, performance budget e Playwright. CodeQL e dependency review complementam a revisão de segurança. Mutation testing roda semanalmente e sob demanda, pois seu custo não deve alongar toda PR.

Codecov recebe o relatório LCOV; o limite de cobertura permanece bloqueante mesmo quando o serviço externo estiver indisponível. Sentry é a única integração APM inicial, adequada ao Cloudflare Worker. Datadog, New Relic e OpenTelemetry não são combinados agora porque sobrepõem função e aumentariam custo e instrumentação sem benefício proporcional. A decisão deve ser revista se surgir requisito concreto de correlação distribuída ou operação multi-runtime.

Endtest não é adicionado enquanto Playwright cobre os fluxos públicos e críticos no próprio repositório. Um serviço externo de synthetic monitoring pode ser adotado quando houver responsável por alertas, SLA e orçamento.

## Requisitos não automatizáveis

Termos de Uso e Política de Privacidade exigem revisão e aprovação de profissional jurídico responsável. A Issue #16 acompanha versão, parecer, data, responsável, publicação e gatilhos de nova revisão. Nenhum agente ou teste pode declarar essa aprovação em nome do jurídico.

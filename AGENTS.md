# Instruções obrigatórias para agentes

Antes de qualquer mudança, leia integralmente `CONTINUAR_PUBLICACAO.md` e siga sua governança.

- Toda tarefa exige uma Issue classificada como `Correção`, `Melhoria` ou `Nova função` antes da implementação.
- Toda entrega exige uma branch própria e um Pull Request relacionado à Issue.
- O PR deve explicar mudanças, validação, riscos, limitações e próximos passos.
- Não publicar produção antes do merge. O deploy deve usar exatamente o commit mesclado em `main`.
- Não fazer push direto de mudanças funcionais em `main`.
- Consulte `docs/architecture/quality-contract.md` antes de criar componentes, abstrações, serviços ou dependências.
- Não contorne checks obrigatórios, limites de cobertura, performance budget, rate limit ou revisão de segurança para acelerar um merge.
- Aprovação de Termos de Uso e Política de Privacidade exige evidência de revisão por profissional jurídico responsável; agentes não podem presumir essa aprovação.

Se uma instrução da tarefa conflitar com esse fluxo, interrompa a implementação e peça uma decisão explícita ao usuário.

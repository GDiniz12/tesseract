# Auditoria externa de segurança — Tesseract

Data: 25/09/2026. Alvos: https://synap-mocha.vercel.app e, após confirmação do proprietário, https://filled-blah-parade.ngrok-free.dev.

**Resultado principal:** há caminhos inseguros de inserção de HTML no editor, comprovados no JavaScript entregue em produção e parcialmente reproduzidos offline. São a prioridade de correção. Não foi demonstrada invasão de conta, execução remota no servidor ou leitura de dados privados.

As prioridades abaixo orientam correção; não são pontuações CVSS nem confirmação de exploração completa. Foram usadas requisições GET e OPTIONS, leitura de arquivos públicos e execução local de uma função isolada. Não foram criadas contas, editadas notas, enviados convites ou feitos testes de carga, força bruta ou gravação no backend.

## 1. Prioridade alta — HTML não sanitizado no editor

**Evidência confirmada:** no arquivo público `/_next/static/immutable/chunks/3pupnrvuiz3gk.js`, a função `sl`, no deslocamento de caractere 367286 da cópia analisada, devolve a entrada diretamente quando identifica determinadas tags HTML. Essa função alimenta `dangerouslySetInnerHTML` em visualizações de notas e `innerHTML` na inicialização do editor.

O teste offline executou a função extraída do bundle, com esta entrada inofensiva de demonstração:

```html
<p><img src="invalid-audit-image" onerror="this.dataset.audit=1"></p>
```

A saída foi **idêntica à entrada**, preservando o atributo executável `onerror`. O teste não renderizou o HTML nem enviou esse conteúdo ao site. Comprova a ausência de filtragem nesse caminho, não a possibilidade de um usuário persistir o conteúdo e atingir outro usuário em produção.

Outros caminhos encontrados no mesmo arquivo:

- Títulos de notas: interpolação de `${e.titulo}` em uma string atribuída a `innerHTML`.
- Frente de flashcards: interpolação de `${e.frente}` pelo mesmo mecanismo.
- Colaboração: o callback de `document_change` atribui diretamente o conteúdo recebido a `k.current.innerHTML`.
- Conversão de imagens Markdown: URL e texto alternativo interpolados em atributos HTML sem escape nesse trecho.

**Impacto potencial:** se conteúdo controlado por outra pessoa alcançar esses caminhos, pode executar JavaScript na origem da aplicação. Em workspaces compartilhados, isso pode afetar colaboradores. A exploração completa depende das validações do backend, da autorização dos canais de colaboração e da possibilidade de distribuir o conteúdo, que não foram verificadas com contas.

**Correção:** usar `textContent` ou filhos React para títulos e textos simples. Para conteúdo rico, aplicar sanitização por lista de permissões depois da conversão de Markdown e antes de cada inserção no DOM, incluindo mensagens de colaboração. Construir imagens e links com APIs do DOM e validar protocolos/atributos. Revisar conteúdo já salvo e validar entradas no servidor. O Marked converte Markdown, mas não sanitiza HTML, conforme sua [documentação oficial](https://marked.js.org/). A [OWASP explica a escolha de destinos seguros e sanitização](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).

**Reteste:** em staging, usar duas contas e um workspace descartável para testar notas, títulos, flashcards, importações e colaboração. O marcador deve permanecer inerte ou ser removido; nenhum evento HTML deve executar.

## 2. Prioridade alta de mitigação — token acessível a JavaScript

**Confirmado no código:** o login salva o token com `localStorage.setItem("token", t)`. O cliente HTTP o recupera e envia no cabeçalho `Authorization: Bearer ...`.

Isso não permite que qualquer site leia o token: a política de mesma origem continua valendo. Porém, um XSS executado na origem do Tesseract poderia acessá-lo, agravando o achado anterior. Não foi capturado token real.

**Correção:** avaliar sessão por cookie `HttpOnly; Secure` e `SameSite` adequado, preferencialmente com uma camada de API na mesma origem. Essa migração exige proteção contra CSRF e revisão de CORS; cookies HttpOnly reduzem a extração do token, mas não impedem todas as ações de um XSS. Verificar expiração, revogação e logout no servidor. O frontend observado remove o token local no logout; isso, sozinho, não prova ausência de revogação no backend. A [OWASP desaconselha identificadores de sessão no localStorage](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html).

## 3. Prioridade média — CORS aceita origens arbitrárias

**Confirmado:** o preflight de `/api/auth/login` respondeu a `Origin: https://security-audit.invalid` com:

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://security-audit.invalid
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: authorization,content-type,ngrok-skip-browser-warning
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
```

Um GET de `/api/workspaces` refletiu a mesma origem. `/api/auth/me` também respondeu com `Access-Control-Allow-Origin: null` quando enviado `Origin: null`.

**Limite importante:** ambos os GETs retornaram 401 sem token. Como o cliente usa Bearer token, CORS permissivo não fornece automaticamente a um site externo o token armazenado no Tesseract. Não foi demonstrado vazamento autenticado nem bypass de login. O código 204 de OPTIONS também não significa execução de uma operação protegida.

**Correção:** manter lista explícita de origens necessárias, rejeitar origens desconhecidas e `null`, e habilitar credenciais somente quando necessárias. Se o cliente desktop precisar de uma origem especial, definir uma estratégia própria em vez de liberar qualquer origem. Retestar preflight e respostas reais para origem legítima, arbitrária e nula.

## 4. Prioridade média — ausência de CSP e proteção de enquadramento

**Confirmado:** as respostas HTML de `/`, `/login` e `/dashboard` não contêm `Content-Security-Policy` nem `X-Frame-Options`. Também não contêm `X-Content-Type-Options`, `Referrer-Policy` ou `Permissions-Policy` explícitas.

A ausência de CSP reduz a defesa adicional contra execução de scripts. A ausência de `frame-ancestors`/`X-Frame-Options` deixa essas páginas sem proteção de enquadramento por cabeçalhos. Não foi realizada demonstração visual de clickjacking nem ação autenticada em iframe. A falta dos demais cabeçalhos é endurecimento de configuração, não prova independente de exploração; navegadores ainda podem aplicar padrões próprios.

**Correção:** adotar `frame-ancestors 'none'` ou uma lista de origens realmente necessárias, `X-Frame-Options: DENY` quando compatível e `X-Content-Type-Options: nosniff`. Elaborar CSP com nonce/hash para os scripts inline do Next.js e restrições de scripts, conexões, imagens e frames. Inventariar fontes, uploads, vídeos e API antes de ativá-la; iniciar o componente de scripts em Report-Only pode evitar quebra funcional. Não considerar `unsafe-inline` uma correção do XSS. Ver [orientação de CSP](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html) e [proteção contra clickjacking](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html).

## Observações para revisão posterior

- O cadastro valida mínimo de seis caracteres no frontend. Isso merece revisão da política de senhas, mas a política efetiva do servidor não foi testada, pois não foram criadas contas.
- O frontend publicado usa um domínio ngrok para a API, e a rota Vercel `/api/auth/session` devolveu uma resposta Express com metadados ngrok. Revisar operação, disponibilidade e exposição do backend. Uso de ngrok não é, por si só, uma vulnerabilidade.
- Respostas da API expõem `X-Powered-By: Express` e `Ngrok-Agent-Ips`. São metadados de infraestrutura; não demonstram comprometimento. Reduzir informações desnecessárias.
- `robots.txt` e `/.well-known/security.txt` retornaram 404. Ausência de `security.txt` dificulta o contato de pesquisadores, mas não é uma vulnerabilidade de acesso.

## Controles que responderam corretamente nos testes

| Verificação | Resultado observado |
|---|---|
| HTTP na raiz | 308 para HTTPS |
| HTTPS Vercel | HSTS com `max-age=63072000; includeSubDomains; preload` |
| `/.env` e `/.git/HEAD` na Vercel | 404, sem conteúdo desses arquivos |
| Source map do bundle de login | 403, não disponibilizado naquele caminho |
| `/api/workspaces` pela Vercel e diretamente no backend, sem token | 401 |
| `/api/workspaces` com Bearer fictício inválido | 401, `Token is invalid` |
| `/api/auth/me`, sem token | 401 |
| Notas, pastas, flashcards e threads de IA, sem token e com workspace fictício | 401 |

`/dashboard` e `/main/security-audit-nonexistent` retornam uma estrutura HTML pública. Isso não é, isoladamente, bypass de autenticação: as rotas de dados verificadas exigem token. O CORS `*` observado no HTML público também não foi tratado como vazamento de dados privados.

## Limites e próximos passos

Não foram avaliados autorização entre dois usuários (IDOR/BOLA), papéis de colaboradores, persistência de XSS, isolamento de canais em tempo real, upload de arquivos, verificação de JWT válida, rate limiting, recuperação de senha, SQL injection, SSRF, segredos do servidor ou vulnerabilidades de dependências pelo lockfile. Nenhuma conclusão de segurança nesses pontos pode ser extraída dos 401 observados.

Para corrigir e concluir a validação, fornecer o repositório frontend/backend e preparar duas contas de teste com workspaces descartáveis, preferencialmente em staging. Priorizar o tratamento de HTML e a sessão, depois CORS e cabeçalhos; em seguida testar autorização entre usuários e colaboração.

O arquivo `evidencias-auditoria.txt` reúne respostas HTTP, trechos do bundle, hashes e resultado do teste offline. Os nomes minificados podem mudar em outro deploy; localizar os padrões e os componentes equivalentes no código-fonte.

## Registro de implementação — 10/10/2026

Esta seção registra as alterações realizadas no repositório em resposta à auditoria. Ela não substitui o reteste em staging com duas contas nem altera as evidências originais acima.

### Controles implementados

- **XSS em conteúdo rico:** adicionada sanitização DOMPurify em `frontend/src/lib/sanitizeHtml.ts`, aplicada à conversão de Markdown/HTML do editor (`ensureHtmlContent`), na inicialização e sincronização colaborativa do editor, e nos sinks diretos de preview de notas, flashcards e cartões. O editor também sanitiza conteúdo recebido de colaboradores antes de atualizar o DOM. O backend filtra HTML nas operações do serviço de notas e nas criações/atualizações feitas pelas ferramentas de IA (`sanitizeNoteHtml`). Títulos de notas e frentes de flashcards interpolados anteriormente em `innerHTML` agora são inseridos via `textContent`.
- **CORS e colaboração:** a API usa `CORS_ORIGIN` como lista explícita de origens, com localhost como padrão de desenvolvimento; origens arbitrárias e `null` não recebem cabeçalhos CORS. O exemplo de configuração lista localhost e o domínio Vercel auditado. O WebSocket também rejeita conexões vindas de uma origem não permitida. CORS deixa de anunciar suporte a credenciais.
- **Cabeçalhos:** frontend adiciona `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` e `Permissions-Policy`. A CSP do frontend está inicialmente em `Content-Security-Policy-Report-Only` para permitir inventário de violações sem quebrar Next.js, fontes, conexões, imagens ou embeds existentes. A API define CSP restritiva para respostas JSON e os mesmos cabeçalhos de endurecimento; oculta `X-Powered-By` e envia HSTS em conexões HTTPS.

### Sessão e login implementados

- O cliente web usa o proxy same-origin `/api` do Next.js e autentica com cookie `tesseract_session` `HttpOnly`, `SameSite=Lax`, `Secure` em HTTPS e validade de sete dias. O cabeçalho `X-Session-Mode: cookie` torna a emissão explícita, sem depender de o proxy encaminhar `Origin`; respostas para o navegador não incluem o JWT no JSON. Tokens antigos do `localStorage` são removidos pelo cliente.
- O cliente móvel continua usando Bearer token. O backend aceita os dois modos, mas a colaboração web recebe um ticket assinado, limitado à sala, de uso único e válido por 30 segundos, enviado como protocolo WebSocket em vez de incluir o JWT de sessão na URL. A emissão do ticket e a conexão verificam acesso do usuário à nota no workspace.
- Adicionado `User.authVersion` para revogar sessões no logout e na troca de senha. As solicitações autenticadas com cookie validam a origem; o marcador de sessão é usado quando o proxy não encaminha `Origin`, e origens explícitas fora da lista continuam rejeitadas.
- A coluna `authVersion` foi aplicada ao banco local de desenvolvimento com `npm run prisma:push`. Antes de implantar backend em outro ambiente, executar `npm run prisma:push` nesse ambiente após conferir sua configuração de banco. A migration precisa preceder o deploy do código que consulta a coluna.

### Sobre o erro `GET /api/auth/me 401`

Uma chamada a `/auth/me` sem sessão válida retorna 401 e pode aparecer ao abrir o dashboard antes do login; isso, por si só, não é erro de CORS. A resposta `User no longer exists` do log indica token associado a usuário removido ou sessão antiga/revogada. O servidor agora diferencia sessão revogada com `Session expired or revoked`; após atualizar frontend/backend e aplicar a coluna no banco, faça login novamente para receber o cookie novo. Se persistir, confira no DevTools se o `POST /api/auth/login` responde com `Set-Cookie: tesseract_session` e se o próximo `/api/auth/me` envia esse cookie; não compartilhe o valor do cookie.

### Validação restante

Builds de frontend, backend e verificação de tipos do mobile passaram em 10/10/2026. Falta reteste em staging com duas contas: payloads XSS, login/logout e persistência de cookie, convite, colaboração, preflight de origens permitidas/arbitrárias/nulas e cabeçalhos. Tickets de colaboração são mantidos em memória por processo; uma implantação com múltiplas instâncias deverá compartilhar o controle de uso único. `CORS_ORIGIN` de produção deve listar somente origens reais; não usar `*`.

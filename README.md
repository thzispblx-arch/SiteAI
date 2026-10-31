# Grupo Conect — Painel de viagens

Site estático em HTML, CSS e JavaScript para controle de horários, viagens, consumo estimado de diesel e resultado financeiro.

## Como abrir
1. Extraia o arquivo ZIP.
2. Abra `index.html` em um navegador moderno ou publique os quatro arquivos no GitHub Pages.
3. A página inicial é o menu principal do Grupo Conect.

## Iniciar viagem
- Selecione empresa, motorista, modelo do ônibus e prefixo.
- Empresas ativas no seletor: **Progresso, Viação Cedro, Viação Conecta, Transportes Transportes e Galaxy Transportes**. A frota base da Progresso e da Viação Cedro já está disponível; para as outras empresas, cadastre modelos e prefixos na Área do Dono. O cadastro da frota não prende o veículo a uma cidade/linha nem pede tanque, lotação ou consumo fixos.
- Progresso mantém os prefixos anteriores 80, 195–199, 200–207, adiciona Apache Vip III MB OF-1721 (180) e Torino MB OF-1519 (211–213), e utiliza Mascarello Gran Micro S3 (208–210) sem a descrição “sem ar”.
- Viação Cedro: Spectrum Road (2500–2501), Audace (2502–2510), Gran Via (2511–2513), Viaggio G7 1050 (2514–2520), Neobus N10 (2521–2522), Apache Vip IV (2523–2525), Torino 2007 (2526), Apache Vip II (2527) e Paradiso G6 (2529–2533). O prefixo 2528 não foi cadastrado porque não foi informado.

## Calculadora de diesel
- Depois de iniciar a viagem, selecione o chassi/motorização.
- A capacidade do tanque é preenchida automaticamente com base na lista configurada no site.
- Informe a porcentagem inicial e a porcentagem final/atual do painel.
- O site calcula os litros estimados consumidos, o combustível restante e o custo de diesel ao preço inicial de R$ 7,99/L (editável).
- O cálculo presume que não houve abastecimento entre as duas medições. Se a porcentagem final for maior que a inicial, o site solicita rever as medições.

### Capacidades de tanque cadastradas
- **Mercedes-Benz:** OF-1722M (300 L); OF-1724L/OF-1724 (300 L); OF-1726L/OF-1726 (300 L); OF-1721/OF-1721L (300 L); OF-1619 (300 L); OF-1519 (250 L); LO-916 (150 L); LO-915 (150 L).
- **Volkswagen:** 17.260 ODS (275 L); 17.230 ODS (275 L); 17.230 EOD (275 L); 15.190 ODS (275 L); 14.190 ODS (275 L); 9.160 S (150 L).

## Registros e relatórios
- Selecione/crie Dia 1, Dia 2, Dia 3 etc.; viagens finalizadas são salvas no dia selecionado.
- O relatório de viagem contém empresa, motorista, ônibus/prefixo, chassi, nível inicial/final do tanque, passageiros, arrecadação, diesel e resultado.
- **Copiar relatório do dia** copia os totais e o detalhamento das viagens daquele dia.
- Horários podem ser adicionados como fotos e ficam armazenados no navegador.

## Arquivos
- `index.html`: estrutura e telas.
- `style.css`: aparência e adaptação para celular.
- `script.js`: seleção de frota, cálculo, histórico e relatórios.

## Observações importantes
- O histórico e as fotos são locais ao navegador/aparelho; eles não são sincronizados entre dispositivos.
- Os valores de tanque e a porcentagem do painel são estimativas. O resultado financeiro desconta apenas o diesel informado e não inclui salários, manutenção, pedágios ou outras despesas.
- Para atualizar um repositório já publicado, substitua `index.html`, `style.css`, `script.js` e `README.md` pelas versões desta pasta e envie um novo commit.


## Grupo Conect AI e recursos extras
- Abra **Consultar Grupo Conect AI** no controle diário. A previsão usa médias das viagens registradas no dia selecionado.
- O padrão é exigir pelo menos 3 viagens; é possível aumentar o mínimo. Sem esse mínimo, o sistema bloqueia a projeção.
- Informe os horários/linhas planejados e quantas viagens ainda espera fazer. Passageiros e litros de diesel são preenchidos com os totais registrados, mas podem ser ajustados para refletir o painel.
- A previsão estima lucro e diesel para o restante do dia, mas não é garantia e não inclui despesas além do diesel informado. O nome “AI” identifica a ferramenta; o cálculo é local e baseado em médias, sem conexão a um serviço de inteligência artificial externo.

## Três recursos úteis adicionados
1. **Exportar CSV:** baixa os registros do dia selecionado para abrir em planilha.
2. **Pagantes para cobrir o diesel:** mostra quantos passageiros pagantes seriam necessários para arrecadar o custo de diesel da viagem atual.
3. **Conferência de dados:** valida chassi, porcentagens do tanque e informações da viagem antes de finalizar; alerta quando o nível final é maior que o inicial ou quando nenhum passageiro foi informado.

## Calculadora de tarifa e cinco ferramentas extras
- **Calcular tarifa:** informe a quilometragem total do percurso que deseja calcular, consumo médio observado em km/L, preço do diesel, média de pagantes e, opcionalmente, outros custos e uma margem. O site exibe o custo estimado de diesel, o mínimo por pagante para cobrir apenas o combustível e uma referência de tarifa com os extras informados.
- **Planejar abastecimento:** converte a diferença entre nível atual e desejado em litros e custo estimado.
- **Estimar duração da linha:** usa distância, velocidade média e duração/quantidade das paradas.
- **Simular arrecadação:** calcula a receita prevista por pagantes, mostra total de passageiros e estima ocupação se você preencher a capacidade.
- **Checklist pré-viagem:** registra os itens marcados e permite copiar o checklist para uma anotação.
- **Controle de manutenção:** salva lembretes com serviço, veículo/prefixo, data prevista, quilometragem e prioridade; itens podem ser removidos.

Essas ferramentas mantêm os dados localmente no navegador usado. A calculadora de tarifa não é um sistema oficial de definição de preço: ela não consegue estimar a tarifa completa sem premissas sobre consumo, pagantes e custos. O resultado é apenas uma referência matemática baseada nos dados preenchidos.

## Dez ferramentas adicionais
- Diário de bordo: registra hodômetro inicial/final e calcula a distância percorrida.
- Histórico de abastecimentos: salva litros, preço, custo, veículo e hodômetro.
- Consumo real do ônibus: calcula km/L, L/100 km e custo por quilômetro.
- Meta de arrecadação: estima o que falta e quantos pagantes seriam necessários.
- Gerador de horários: gera uma grade de saídas por intervalo e permite copiá-la.
- Calculadora de turno: calcula tempo entre entrada/saída, descontando intervalo.
- Registro de ocorrências: guarda eventos com data, veículo, prioridade e descrição.
- Checklist de fim de viagem: salva a conferência e permite copiar o checklist.
- Comparar linhas: compara receita estimada menos diesel em duas linhas.
- Backup e restauração: exporta/importa os dados armazenados no localStorage em JSON.

Os dados ficam no navegador/aparelho atual. O backup JSON não inclui fotos salvas no IndexedDB. Faça cópias de segurança regulares. Estimativas são informativas e não substituem os procedimentos oficiais da empresa.

### Limite de uso local
O histórico é armazenado no navegador deste dispositivo. O backup exporta os dados do `localStorage` pertencentes ao Grupo Conect; as fotos dos horários usam armazenamento de imagens separado e precisam ser guardadas à parte. Teste a restauração com cuidado e baixe um backup atual antes de importar outro.


## Mais 10 funções operacionais
1. **Fluxo de passageiros por parada:** registra passageiros a bordo, embarques e desembarques; impede desembarques acima do total a bordo.
2. **Despesas operacionais:** guarda gastos de pedágio, estacionamento, lavagem, peças e outras categorias, com soma acumulada e relatório copiável.
3. **Inspeção de pneus:** registra pressão medida e compara com a referência e tolerância informadas pelo usuário; use sempre a referência técnica da frota/fabricante.
4. **Registro de limpeza:** registra data, veículo, itens de limpeza concluídos e pendências.
5. **Validade de documentos:** salva datas de vencimento e mostra alertas de vencidos, vencendo em até 30 dias ou em dia.
6. **Pontualidade da linha:** calcula diferença de saída e chegada em relação ao horário previsto, inclusive em horários próximos da meia-noite.
7. **Passagem de turno:** registra motorista que entrega/recebe, nível de tanque, hodômetro e observações.
8. **Achados e perdidos:** registra item, local, data, veículo e situação de encaminhamento. Evite guardar dados pessoais desnecessários.
9. **Planejador de paradas:** organiza paradas por linha e soma os minutos de permanência estimados.
10. **Conferência de arrecadação:** compara a receita esperada pelo número de pagantes e tarifa com dinheiro, Pix e cartão/ outros meios informados.

Os novos registros usam armazenamento local com chaves `grupoConect.*` e entram no backup JSON do site. Eles permanecem apenas no navegador/aparelho em uso e não sincronizam entre dispositivos automaticamente. Os indicadores são ferramentas de apoio; inspeções e decisões operacionais devem seguir os procedimentos oficiais da empresa.


## Gerador de documentos dos ônibus
- Acesse no menu inicial **Gerar documentos dos ônibus** e selecione **Pablo** para liberar o formulário da interface. Os outros nomes veem uma mensagem de acesso não liberado.
- Preencha tipo de documento, data, empresa/prefixo, situação do ônibus, marca e modelo da carroceria, ano de fabricação e ano-modelo da carroceria, marca/modelo do chassi e respectivos anos, além de placa, RENAVAM, VIN, combustível, tanque, capacidade de passageiros, hodômetro, ar-condicionado, acessibilidade e observações.
- O botão **Gerar ficha do ônibus** cria e salva uma ficha interna neste navegador. Você pode revisar a ficha, copiar o texto, baixar TXT ou imprimir/salvar em PDF pelo navegador. As fichas ficam disponíveis em **Fichas geradas** e podem ser abertas, baixadas, impressas ou excluídas.
- As fichas são registros internos digitados pelo usuário; elas **não substituem** CRLV, CRV, licenciamento nem outros documentos oficiais de trânsito. Confira todos os dados com os documentos originais antes de usar a ficha.
- **Limite importante de acesso:** o projeto usa HTML/JavaScript estático. A seleção de Pablo funciona como bloqueio visual da interface, não como autenticação segura. Quem puder abrir o código-fonte do site público poderá contornar a restrição; dados confidenciais exigem login e autorização no servidor.
- As fichas são salvas no `localStorage` com uma chave `grupoConect.*`, por isso entram no backup JSON. Elas ficam no navegador/aparelho atual e não sincronizam automaticamente com outros aparelhos.


## Atualização operacional (2026-10-24)
- Preço inicial do diesel atualizado para **R$ 7,99/L**.
- Calculadora de tarifa ampliada para incluir mão de obra, manutenção/pneus por km, custos fixos, outros custos, tributos e margem-alvo. Os padrões são ilustrativos e devem ser ajustados.
- **GPS manual de paradas**: salva o ponto e horário registrados pelo usuário; não utiliza GPS real nem sincroniza automaticamente entre dispositivos. Na interface, só o perfil Pablo pode editar.
- **Operação intermunicipal**: registro por dia, pagantes/gratuidades, contador de catraca, mapa de poltronas, maquininha/QR fictícios, relatório diário e impressão de passagem simulada. Não processa dinheiro real.
- **Área do Dono**: cadastro local de empresas/cidades/linhas/ônibus; cálculo de escala com passageiros, gratuidades, km, terreno, consumo, custos e tarifa de equilíbrio; projeção mensal e minuta municipal fictícia.
- Os novos dados usam chaves `grupoConect.*` e fazem parte do backup JSON existente.

### Observações importantes
O site estático do GitHub Pages não fornece privacidade real por seleção de perfil; para segurança real é necessário login e banco em servidor. Os dados `localStorage` ficam no navegador do aparelho e não sincronizam. Contratos, QR codes, pagamentos, GPS e aprovação de venda são recursos de simulação e não substituem serviços reais nem documentos oficiais.

## Atualização da Área do Dono: escala, operação, mercado, finanças e caixa (24/10/2026)

### Escala por dia da semana
- Selecione data e dia da semana (segunda a domingo), cidade, linha, empresa, ônibus e dados operacionais.
- A sugestão de demanda procura escalas salvas para o mesmo dia da semana, cidade e linha, usando a média de passageiros, gratuidades e partidas/dia. Se não houver histórico, o sistema avisa e usa os valores que você preencher manualmente.
- O cálculo de ônibus e custos é uma estimativa de simulação. Terreno, consumo, custo de pessoal, manutenção, preço do diesel e custos fixos são premissas editáveis.

### Visualizador de Operação
- O cadastro pode puxar ônibus e prefixos da frota ou das escalas salvas, e permite completar cidade, linha, horário, duração e dia de operação.
- Há três turnos de motorista (manhã, tarde e noite). O número de motoristas virtuais por empresa pode ser configurado de 3 a 60.
- A linha mostra estado operacional e animação verde após iniciar. O simulador pode gerar uma ocorrência com probabilidade de 10%. Para cada tipo de ocorrência há cinco respostas prontas; a escolha é registrada no histórico.
- As respostas são sugestões de jogo/organização, não instruções oficiais de segurança. Em situações reais, deve-se seguir a central da empresa, as autoridades e os procedimentos de emergência.

### Mercado de ônibus (catálogo ampliado)
- Catálogo de 80 modelos/configurações, com 20 por página, pesquisa por modelo, chassi, categoria, tração, lotação e configuração, além de simulador de financiamento.
- Cada ficha abre detalhes com dimensões aproximadas (comprimento × largura × altura), quantidade sentada/em pé e total estimado, odômetro simulado, combustível, capacidade de tanque/bateria, consumo de referência, tração/eixos, portas, câmbio, ar-condicionado e nota de acessibilidade.
- Preços e quilometragens são fictícios para o jogo, e capacidades/dimensões/configurações são aproximadas. Não são anúncios ativos nem dados de homologação da unidade real. Em especial, a lotação em pé é uma estimativa visual do simulador e não indica capacidade legal; confirme documentação, versão, chassi e carroceria reais.
- Fontes oficiais para conferir famílias e dimensões de versões: Marcopolo Torino https://onibus.marcopolo.com.br/produtos/urbanos/torino ; Marcopolo Paradiso G8 1800 DD https://onibus.marcopolo.com.br/produtos/marcopolo-g8/paradiso-g8-1800-dd ; Caio Apache VIP https://caio.com.br/produto/apache-vip-9.html ; Mascarello Granvia https://mascarello.com.br/produto/granvia/ ; Volare https://www.volare.com.br/ ; Comil https://www2.comilonibus.com.br/produtos ; Busscar https://busscar.com.br/produtos/ .

### Financeiro e caixa
- Registre ônibus financiados com modelo, chassi, ano, prefixo, valor, entrada, quantidade de parcelas, taxa mensal e vencimento. A parcela é estimada por amortização mensal; juros e prestações reais dependem do contrato efetivo.
- O sistema registra parcelas pagas e restantes, multa/juros de atraso conforme as taxas preenchidas e o histórico de pagamentos.
- Para pagar parcela, o saldo calculado do caixa precisa cobrir o valor total. O caixa soma os valores de receitas e diesel encontrados nos registros de viagem, mais entradas e saídas manuais e pagamentos de financiamento.
- O saldo pode ficar negativo se os custos registrados forem superiores às receitas. Antes de registrar uma entrada, confirme se ela representa dinheiro disponível no cenário; não conte uma receita futura como saldo já recebido.
- O sistema é um simulador local para OMSI 2: não integra bancos, não realiza pagamentos reais, não consulta cotações de crédito, não autentica usuários com segurança e não sincroniza dados entre dispositivos. Use backup JSON regularmente.


## Correções do GPS e sistema intermunicipal (GPcntv9)

- O GPS manual tem modo de consulta e modo de edição visual de Pablo. A seção “Linhas cadastradas na operação” lê as linhas registradas no Visualizador de Operação e permite preencher ônibus/linha para registrar ou editar a última parada. O histórico também permite editar e excluir registros.
- O painel intermunicipal é independente de “Iniciar viagem” municipal. Agora o site abre no menu principal e o usuário acessa o módulo intermunicipal diretamente.
- O mapa mostra 44 poltronas numeradas `S01` a `S44` e 36 posições de passageiros em pé `E01` a `E36`, totalizando 80 pessoas. Posições vendidas ficam bloqueadas no dia correspondente.
- A maquininha tem visual de terminal físico ilustrativo, tela de status, teclado, botão de aproximação simulada, comprovante aprovado, QR fictício e impressão para PDF. Nenhuma cobrança real ocorre.
- Dias, contadores, posições vendidas, passagens e paradas são salvos em `localStorage` no navegador. Os dados não sincronizam automaticamente entre aparelhos.

## Publicar no GitHub Pages

Extraia o ZIP e envie `index.html`, `style.css`, `script.js` e `README.md` diretamente para a raiz do repositório (não envie apenas o arquivo ZIP nem deixe os arquivos dentro de uma subpasta). Em **Settings → Pages**, selecione **Deploy from a branch**, branch `main` e pasta `/(root)`. Aguarde o Pages concluir a publicação e abra o endereço do repositório.


## Área do Dono: rotas, escala recomendada e contratos municipais

- A seleção de início de viagem agora apresenta veículos pré-cadastrados da Progresso e da Viação Cedro, além de veículos que forem cadastrados na Área do Dono para as demais empresas ativas: Viação Conecta, Transportes Transportes e Galaxy Transportes.
- A lista da Viação Cedro inclui os prefixos 2500–2501, 2502–2510, 2511–2513, 2514–2520, 2521–2522, 2523–2525, 2526, 2527 e 2529–2533. O prefixo 2528 não foi criado porque não foi informado.
- Progresso mantém seus cadastros anteriores, remove a expressão “sem ar” do Gran Micro S3 e adiciona o Apache Vip III MB OF-1721 prefixo 180 e o Torino MB OF-1519 prefixos 211–213.
- O botão “Colinha” orienta apenas os quatro módulos pedidos: GPS, sistema de parcelas, caixa e Área do Dono.
- Cidades e rotas do usuário aparecem como sugestões de preenchimento. Os dados continuam no armazenamento local do navegador.


### Colinha da Operação de Linha
- Dentro do Visualizador de Operação há um botão **Colinha da operação de linha**, acessível também durante uma ocorrência.
- O guia oferece passos de simulação para acidente/via bloqueada, falha mecânica, obra, trânsito e alagamento/mau tempo, além de explicar como registrar a decisão ou manter a linha parada.
- A Colinha geral também ganhou uma quinta seção com um atalho para o Visualizador de Operação.
- A chance de 10% é um sorteio fictício do jogo; orientações para ocorrências reais devem seguir os procedimentos da empresa e das autoridades.


## Revisão de estabilidade — GPcntv9

Esta revisão corrige a inicialização das chaves de armazenamento da Área do Dono, para o acesso do Pablo não falhar ao abrir os módulos. Também mantém o GPS manual liberado somente no modo Pablo e melhora a explicação dos controles de passageiros do setor intermunicipal. Os botões de incremento continuam respondendo ao toque; quando a lotação simulada de 80 pessoas for atingida, o site explica o limite, em vez de deixar o botão aparentemente inativo.

Na Área do Dono, o fluxo foi separado em três partes:

1. **Cidades, linhas e serviços:** cadastre município/região, nome da linha e tipo de operação. As rotas podem ser reutilizadas na escala ou para solicitar uma proposta municipal.
2. **Frota disponível:** cadastre cada veículo da empresa por prefixo, modelo e chassi opcional. A linha não fica vinculada permanentemente ao ônibus e não há formulário fixo para capacidade, tanque, consumo ou tarifa.
3. **Escala diária:** informe data, empresa, rota, tipo de serviço (ou detecção automática), passageiros, frequência, km, tempo, terreno e custos. O sistema ranqueia os ônibus livres naquele dia levando em conta tipo de serviço, capacidade aproximada, quilometragem e consumo. O resultado mostra a recomendação, as premissas e até três alternativas quando há veículos livres. Capacidade e consumo são estimativas de simulação e devem ser conferidos no veículo real.
4. **Contrato municipal:** usar uma rota cadastrada preenche município/linha, mas também é possível digitar cenário manual. “Solicitar proposta à prefeitura” gera uma oferta simulada com base no município, no tipo de serviço e nos custos/receita estimados. “Pedir aumento da proposta” faz uma contraproposta com probabilidade inferior a 100%; a prefeitura pode aceitar ou recusar. A oferta original permanece disponível caso recusem o aumento. “Aceitar proposta” registra o contrato simulado no histórico local. As premissas detalhadas são opcionais e começam com valores de exemplo.

Validações realizadas nesta versão: sintaxe JavaScript; IDs HTML sem duplicidade e referências literais de elementos existentes; destinos de navegação; teste no navegador de teste para acesso do Pablo; listagem da frota-base; cadastro independente de cidade/linha e de veículo; recomendação automática de ônibus urbano e rodoviário; atalhos de rota para escala e proposta municipal; gravação manual de parada no GPS; contadores, tarifas editáveis, mapa 44+36 e venda fictícia de passagem; lançamento no caixa e cadastro/pagamento de parcela simulada; proposta municipal aceita e recusada em simulações controladas; busca do mercado e atalho da Colinha para a operação de linha. Dados de teste foram usados apenas num navegador isolado, não incluídos no pacote final.

## Nova função: lucro histórico por motorista na Operação de Linha

1. Na calculadora de viagens normal, ao iniciar a viagem, preencha **Cidade da linha** e **Nome ou número da linha**. Exemplo: cidade `Nova Friburgo`, linha `32 Nova Suíça`.
2. Finalize a viagem normalmente para registrá-la no histórico do dia. A viagem salva contém empresa, cidade, linha, motorista, arrecadação, custo de diesel e resultado estimado.
3. Na **Área do Dono → Visualizador de Operação**, cadastre a operação com a mesma empresa, cidade e nome/número da linha e defina os motoristas por turno.
4. No cartão da linha, use **Ver lucro histórico por motorista**. A análise consulta todos os dias salvos no histórico normal, compara empresa + cidade + linha e apresenta por motorista o total e a média do resultado das viagens correspondentes.
5. Para evitar mistura de linhas, a cidade e a linha são comparadas sem diferenciar maiúsculas, acentos e pontuação. A empresa e o nome do motorista precisam corresponder.
6. Se houver viagens antigas sem cidade/linha, abra o histórico da calculadora normal e toque em **Identificar cidade/linha para análise** na viagem correta. Preencha cidade e linha e salve. O sistema não adivinha a rota antiga; após identificá-la manualmente, ela pode entrar na análise.

**Como interpretar o valor:** `resultado da viagem = arrecadação dos passageiros pagantes − custo do diesel registrado`. É uma estimativa antes de outros custos, não o salário ou a comissão pessoal do motorista. O relatório usa todos os dias do histórico, independentemente do Dia selecionado na calculadora.



## Operação de linha com cronômetro e lucro ao vivo

No Visualizador de Operação, informe o tempo de cada percurso e selecione a velocidade de simulação:
- **1× Tempo real:** 32 minutos de percurso levam 32 minutos reais.
- **10× Rápido:** 32 minutos de percurso levam 3 min e 12 s reais.
- **60× Turbo:** 32 minutos de percurso levam 32 segundos reais.

A cada percurso concluído o simulador registra uma viagem e soma arrecadação, custo de diesel e resultado ao motorista do turno correspondente. A tela exibe o cronômetro, viagens realizadas, lucro acumulado e resultado por motorista. A operação pode ser pausada e retomada. O progresso é baseado em carimbos de data no armazenamento local; ao reabrir a página, os percursos cujo tempo já passou são recuperados.

O simulador pesquisa o histórico das viagens normais usando empresa, cidade e linha. Se houver registros, usa suas médias de arrecadação e diesel. Se ainda não houver histórico compatível, usa os valores de pagantes, tarifa e custo do diesel informados no cadastro da operação, deixando claro que são estimativas.

**Integração automática com o Caixa:** o resultado líquido de cada viagem simulada passa a aparecer no Caixa como um movimento automático de lucro ou prejuízo da Operação de Linha. O saldo disponível inclui esses resultados sem precisar lançar nada manualmente. O lançamento informa empresa, cidade, linha, prefixo, motorista e número da viagem; ele não é apagado ao remover a linha da tela de operação. A integração impede duplicações quando o site atualiza ou recupera viagens após reabertura. Operações antigas recebem um lançamento inicial com o resultado acumulado antes da instalação desta correção, e as viagens seguintes passam a ser detalhadas individualmente. O histórico normal de viagens continua separado.

O relógio do motorista considera manhã das 06:00 às 11:59, tarde das 12:00 às 17:59 e noite das 18:00 às 05:59, usando o horário inicial da operação e os minutos simulados decorridos.


## Operação de linha em ciclo diário (05:00–23:00)
- A primeira partida pode ser definida entre 05:00 e 23:00.
- O sistema repete as viagens em ciclos diários: não agenda novas partidas entre 23:00 e 05:00.
- Uma viagem que já saiu antes do encerramento pode terminar depois das 23:00; a próxima partida só ocorre a partir das 05:00.
- O ciclo segue automaticamente dia após dia até Pablo pausar, resolver uma ocorrência que pare a linha ou remover a operação. O contador exibido na tela leva em conta a velocidade escolhida (1×, 10× ou 60×).
- Cada viagem concluída gera receita, custo de diesel e resultado acumulado para o motorista correspondente ao turno da partida. O ritmo real é controlado por 1×, 10× ou 60×.


## Correção: lucro automático da Operação de Linha no Caixa

- O Caixa mostra um indicador próprio **Lucro líquido das operações em linha** e adiciona esse resultado ao saldo disponível, para que possa financiar despesas e parcelas.
- Cada viagem concluída gera uma linha automática no extrato; lucro entra como entrada e prejuízo como saída. A linha informa rota, empresa, motorista, prefixo e número da viagem.
- Os lucros são sincronizados a partir dos totais cumulativos da operação. Se o site ficar fechado e recuperar várias viagens, os registros recentes aparecem individualmente e qualquer diferença que não esteja no log rotativo é registrada como recuperação consolidada.
- Os últimos 5.000 movimentos detalhados da operação são mantidos no estado de caixa. O lucro acumulado continua no total mesmo quando há mais movimentos antigos que o limite de detalhes; o extrato mostra um resumo do saldo acumulado anterior.
- Os resultados simulados são contabilizados uma única vez, mesmo após atualizar a página, pausar/retomar ou remover uma operação.


## Funções Extras do Dono (10 ferramentas)

Na Área do Dono, selecione **Pablo** e abra **Funções Extras do Dono**. O painel contém dez ferramentas com tutoriais expansíveis (“Para que serve e como usar”):

1. **Painel de operação ao vivo:** linhas em andamento, viagens concluídas, arrecadação, diesel, lucro e principais resultados por motorista.
2. **Projeção de lucro:** estima o resultado se uma operação completar mais viagens; é previsão e não altera o caixa.
3. **Reserva de caixa para parcelas:** compara o saldo disponível com parcelas vencidas ou próximas.
4. **Auditoria de prefixos e escalas:** procura prefixos repetidos em escalas no mesmo dia e em operações ativas.
5. **Conflitos de motoristas:** procura o mesmo motorista em mais de uma linha ativa no mesmo turno.
6. **Ranking de rentabilidade:** compara o resultado médio das linhas identificadas no histórico de viagens normais.
7. **Tarifa de equilíbrio:** calcula tarifa necessária por pagante para cobrir custos e a margem desejada.
8. **Planejador de diesel:** estima consumo/custo diário e mensal por km, quantidade de viagens, eficiência e preço.
9. **Frota reserva:** estima quantos veículos extras manter para cobrir o pico de operação.
10. **Backup de segurança:** exporta as chaves de dados do Grupo Conect em JSON.

Os cálculos são recursos da simulação. As projeções não registram dinheiro automaticamente; o caixa continua sendo atualizado pelos módulos já existentes. Os dados ficam no navegador local. O backup JSON abrange as chaves de `localStorage` com prefixo `grupoConect.`; fotos que possam estar guardadas separadamente no IndexedDB podem exigir exportação à parte.

## Atendimento Online (turismo, fretamento e escolar)
- Abra **Área do Dono → Pablo → Atendimento Online** para entrar no aplicativo de celular cenográfico Grupo Conect.
- A base gera **1.232 perfis potenciais de clientes** (44 perfis-base distribuídos por 28 cidades de 20 estados), incluindo escolas, empresas, famílias, agências, associações, eventos, prefeituras e organizações que podem pedir contratos contínuos. O catálogo não significa que todos estão contratando agora; apenas uma parte envia propostas.
- Propostas iniciais aparecem na primeira abertura. Depois, o simulador sorteia uma quantidade variável de novas solicitações com chance moderada por dia. Ao retornar depois de dias sem abrir o app, ele simula as oportunidades do período transcorrido. Como o GitHub Pages é estático, nenhum processo roda em segundo plano com o navegador totalmente fechado; a simulação é atualizada quando o app é aberto/atualizado.
- Cada proposta mostra cliente, cidade/estado, origem e destino, data e horários, tipo de serviço, passageiros, km estimados, orçamento, custos previstos, lucro e margem. A análise é indicativa: o custo real varia conforme ônibus, trânsito, pedágios, horas de motorista, pernoite e outras condições.
- Para aceitar uma proposta, abra **Analisar proposta**, selecione **empresa, modelo, prefixo, saída da garagem e chegada prevista** e confirme a escala. O sistema alerta se a lotação solicitada excede a capacidade de referência do ônibus.
- Após aceitar um serviço pontual, o valor oferecido é lançado uma única vez como entrada no **Caixa do Grupo Conect**, identificado como `Atendimento Online` e vinculado ao código da proposta. Em contratos contínuos, o valor oferecido é mensal: a primeira mensalidade entra ao aceitar e as seguintes são registradas uma vez por mês, até o prazo solicitado pelo cliente. A agenda mostra o prazo do contrato, veículo e horários. Se já houver lançamento de caixa, o sistema reutiliza o registro para evitar duplicação.
- Três ferramentas no app: **calculadora de orçamento**, **mensagens rápidas** e **catálogo pesquisável de clientes**. A aba Agenda acompanha os fretamentos aceitos.
- Clientes, contratos e movimentos financeiros são fictícios e permanecem no armazenamento local do navegador. Esse recurso não conecta clientes reais, não aceita pagamentos verdadeiros e não garante renda real. A seleção de Pablo é somente um bloqueio visual; não é autenticação segura para um site público.


## Alterações adicionais: reserva de frota e contratos contínuos

- A exclusividade de frota é validada em ambos os sentidos: ao aceitar Atendimento Online, calcular uma escala diária e criar uma Operação de Linha recorrente. Um ônibus não pode ter duas reservas na mesma data, mesmo que os horários não coincidam; operações recorrentes também são bloqueadas quando conflitam com contratos ou escalas futuras no dia da semana escolhido.
- Contratos contínuos usam prazos específicos solicitados pelo cliente: 12, 18, 24, 30, 36, 42 ou 48 meses. A tela mostra a duração exata; a prefeitura/empresa simulada escolhe o prazo da proposta. O catálogo inclui empresas e prefeituras de várias regiões.
- Nos contratos contínuos, o valor oferecido é uma mensalidade. A primeira mensalidade entra no Caixa quando a proposta é aceita. As mensalidades posteriores são registradas em lançamentos únicos conforme cada mês vencido, quando o Atendimento Online é aberto/atualizado. Como o GitHub Pages é estático, não há execução em background enquanto o navegador está fechado.
- O mesmo ônibus de contrato contínuo fica reservado nos dias úteis do período contratado. Os fretamentos pontuais reservam o ônibus para a data específica do serviço. Ao cadastrar uma operação recorrente, se houver um serviço já confirmado para uma das ocorrências daquele dia da semana, o sistema bloqueia esse prefixo para evitar conflito; escolha outro veículo ou ajuste o dia da operação.
- Os números, clientes e contratos são simulação fictícia; a mensalidade não representa todo o valor de vários anos de uma só vez.


## Mercado 0 km (Área do Dono)

Acesse **Área do Dono → Pablo → Mercado 0 km**. O catálogo reúne famílias de carrocerias urbanas, midi, micro-ônibus, escolar, fretamento, intermunicipal, rodoviário, articulado e elétrico. Inclui famílias de modelos de Marcopolo (Torino 2027, Viaggio G8 e Paradiso G8), Caio (Apache VIP V, Millennium V e eMillennium), Mascarello, Comil, Busscar e Volare. O catálogo contém 57 famílias de carroceria e 48 opções de chassi para o configurador; a lista é filtrada por segmento e fabricante e, após escolher a carroceria, oferece somente os chassis compatíveis definidos para aquela configuração.

Na ficha, você pode escolher empresa compradora, prefixo inicial, quantidade, ano/modelo, prazo de entrega, estado de entrega, segmento, fabricante/modelo de carroceria, fabricante/modelo do chassi, motor, tipo de propulsão, posição do motor, dimensões, passageiros sentados/em pé, portas, tipo de piso, eixos, suspensão, câmbio, ar-condicionado, poltronas, acessibilidade, USB, Wi-Fi, câmeras, letreiros, GPS/telemetria, validador, pintura, interior, garantia e manutenção. Também permite gerar/copy/download uma ficha de cotação, guardar histórico, estimar compra à vista ou simular financiamento. Se registrar a aquisição e houver saldo simulado suficiente para o valor de entrada, os ônibus são adicionados à frota e os registros de financiamento/Caixa são atualizados.

**Atenção:** os preços, prazos, dimensões, lotação, motorização e compatibilidade do configurador são referências para o jogo, não uma proposta comercial nem ficha homologada de uma combinação específica. Antes de comprar de verdade, confirme a versão/modelo vigente, a compatibilidade chassi-carroceria, peso, lotação legal, equipamentos e cotação diretamente com os fabricantes. Catálogos de referência: [Marcopolo](https://onibus.marcopolo.com.br/produtos), [Caio](https://caio.com.br/), [Mascarello](https://mascarello.com.br/documentos/), [Comil](https://www2.comilonibus.com.br/produtos), [Busscar](https://busscar.com.br/produtos/), [Volkswagen Caminhões e Ônibus](https://www.volkscaminhoes.com.br/onibus/freteamento-rodoviario), [Mercedes-Benz](https://www.mercedes-benz-trucks.com.br/showroom) e [Scania](https://www.scania.com/br/pt/home/products/onibus/chassi-rodoviario.html).

## Validador de bordo — autenticação de partida simulada

O validador está disponível no menu principal e também por **Área do Dono → Pablo → Validador de bordo**. Os formulários de viagem normal, intermunicipal e serviço aceito no Atendimento Online encaminham a viagem para o validador antes da partida. O Visualizador de Operação inicia seu ciclo diretamente, sem usar o validador. O painel apresenta serviço, motorista, empresa, modelo/prefixo, cidade e linha.

Fluxo da simulação: (1) confirme que os dados da viagem estão corretos; (2) o motorista aproxima/“lê” o seu cartão funcional na área do leitor; (3) aguarde a indicação verde e a mensagem **CARTÃO ACEITO**; (4) pressione **INICIAR VIAGEM** para gravar hora, motorista, identificação simulada do cartão, empresa, ônibus, prefixo e linha; (5) a partida só prossegue depois dessa confirmação. O painel da Área do Dono permite consultar o histórico de partidas validadas. Se não houver uma viagem pendente, o validador não autoriza uma partida avulsa.

O fluxo foi inspirado em princípios públicos de bilhetagem embarcada — identificação do motorista por RFID/matrícula, controle do início de operação e registro de viagens — descritos pela [Prodata Mobility](https://prodatamobility.com.br/monte-sua-frota) e em outros sistemas de operação embarcada. A tela e os cartões do Grupo Conect são originais e simulados; não são interface oficial Prodata e não se conectam ao equipamento físico, ao cartão verdadeiro ou a qualquer sistema de bilhetagem real. O cartão é reconhecido apenas no armazenamento local desta simulação.

## Banco Grupo Conect e Agenda de Frota (novos módulos)

### Banco fictício
- Acesse Área do Dono, selecione Pablo e abra **Banco Grupo Conect**.
- O saldo inicial e atualizado é espelhado do livro-caixa original. O módulo não substitui nem apaga o Caixa existente.
- O extrato reúne arrecadação, diesel, Operação de Linha, Atendimento Online e demais entradas/saídas registradas no Caixa. Cada item possui uma visualização de comprovante simulado; o extrato pode ser exportado em CSV.
- Pix, transferência, pagamento de conta/boleto fictício, saque, depósito/aporte, cartão empresarial virtual, folha de pagamento e IPVA/DETRAN são funcionalidades de simulação local. Nenhuma transação bancária real é executada.
- A seção de ônibus financiados é uma cópia de consulta. O contrato e o pagamento das parcelas continuam no sistema de financiamento já existente.
- Para pagar salário, primeiro cadastre os motoristas nos turnos do Visualizador de Operação. Depois selecione motorista e competência, confira os valores e confirme o pagamento. O sistema impede o pagamento duplicado da mesma competência para a mesma empresa/motorista, respeita o saldo do Caixa e grava os lançamentos de salário líquido, INSS estimado, vale-alimentação, plano odontológico, FGTS estimado e contribuição patronal estimada quando marcados.
- O salário urbano do RJ (R$ 3.420,16 para motorista convencional, vale-alimentação R$ 660 e plano odontológico de referência até R$ 27,50) é uma referência de uma convenção 2025/26, com validade até 31/05/2026 — não confirmar como piso vigente para nova contratação sem verificar a convenção coletiva atual e aplicável. Os campos podem ser editados por motorista.
- O INSS é aproximado pelas faixas progressivas oficiais de 2026. O cálculo é apenas uma simulação; não é holerite, cálculo de folha legal, orientação tributária ou substituto de contador.
- No IPVA, informe valor venal e exercício de cada ônibus. A alíquota de referência no Rio de Janeiro é 2% para ônibus/micro-ônibus e 0,5% para veículos exclusivamente elétricos, sujeita à classificação legal do veículo e regras vigentes. O botão paga a próxima cota se houver saldo; cada pagamento cria movimento e comprovante simulado.

### Agenda de Frota
- Abra Área do Dono → **Agenda de Frota**. O sistema descobre os ônibus de todas as empresas cadastradas, frota-base, ônibus comprados no mercado 0 km, financiamentos, operações e contratos aceitos.
- Registre o hodômetro atual para começar as previsões. A primeira leitura define os marcos de referência para troca de óleo (10.000 km), inspeção de pneus (5.000 km) e revisão preventiva (20.000 km). São intervalos ilustrativos ajustáveis à recomendação real do fabricante e ao regime de uso do veículo.
- O calendário gera eventos de Operação de Linha e Atendimento Online, limpeza após serviço, lavagem semanal e inspeção visual mensal. Você também pode cadastrar turismo, fretamento, manutenção, óleo, pneus, documentação e outras tarefas manualmente.
- Clique num dia para ver os itens e marque cada tarefa como concluída. Tarefas de óleo, pneus, revisão e limpeza atualizam a rotina da agenda ou o registro de limpeza local.
- A faixa fixada no topo do menu principal aparece somente quando há tarefa importante/urgente de manutenção, incluindo alguns marcos por hodômetro. Use **Abrir agenda** para ir diretamente ao calendário e conferir os detalhes.

### Dados locais e backup
Os dados são guardados no `localStorage` do navegador atual; não sincronizam automaticamente entre dispositivos e não serão executados quando o navegador estiver totalmente fechado. Antes de substituir os arquivos no GitHub Pages, exporte um backup no módulo de backup existente. Os comprovantes, validador, banco, folha e agenda são documentos e transações fictícios do simulador.

## Empréstimo Empresarial — Banco Grupo Conect

- Entre em **Área do Dono → Pablo → Banco Grupo Conect → Empréstimo empresarial**.
- Informe o valor (de R$ 5.000 a R$ 10.000.000), prazo (6, 12, 18, 24, 36 ou até 48 parcelas), finalidade e garantia simulada. O painel exibe score, chance estimada de aprovação, taxa mensal, valor da prestação, juros totais e total previsto.
- A análise é simulada com base no fluxo de caixa recente, saldo disponível, contratos de empréstimo ativos, valor solicitado e garantia informada. O pedido pode ser aprovado ou recusado. Crédito acima de R$ 5 milhões sem garantia de frota ou imóvel é fortemente restringido; solicitações com fluxo de caixa insuficiente também podem ser negadas.
- Em uma campanha promocional limitada, pedidos pequenos, de prazo curto, com perfil forte e garantia podem receber taxa de 0% ao mês. Nessa situação, o total de juros fica em R$ 0,00 e a última parcela é ajustada por centavos para que o total devolvido seja exatamente o principal. Nas demais ofertas, a taxa mensal varia conforme o risco e o tamanho do crédito. A parcela usa o sistema Price, com pequeno ajuste na última parcela para arredondamentos.
- Quando aprovado, o valor integral cai imediatamente no saldo disponível por meio de uma entrada identificada como **Crédito de empréstimo empresarial (passivo)**. O crédito aumenta o caixa disponível, mas não é lucro operacional nem receita de venda. O lançamento é vinculado a um contrato único para evitar duplicação.
- No histórico, abra **Ver contrato / comprovante** para exportar/ imprimir os termos simulados. **Pagar próxima parcela** debita uma parcela do caixa se houver saldo suficiente, registra o movimento de saída e gera comprovante. O cronograma apresenta até 48 vencimentos e a situação das parcelas. As parcelas são pagas por clique no simulador, não debitadas automaticamente.
- As taxas são indicativas, não uma oferta real. O Banco Central divulga taxas por instituição, modalidade e período. Como referência, a página de capital de giro para pessoa jurídica de prazo até 365 dias mostrava taxas mensais de 1,08% a 3,92% para o período de 04/09/2026 a 11/09/2026. Fontes: [Banco Central — taxas por instituição e modalidade](https://www.bcb.gov.br/estatisticas/reporttxjuros/) e [BNDES — crédito para pequenas e médias empresas](https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/bndes-credito-pequenas-e-medias-empresas).
- O banco é fictício, usa `localStorage` deste navegador e não consulta bureaus de crédito, não faz transferência real, não empresta dinheiro verdadeiro e não sincroniza contratos automaticamente entre dispositivos.

## Garagem Grupo Conect — Mecânica, manutenção, equipe e peças

### Acesso e cadastro da frota
- Entre em **Área do Dono → Pablo → Garagem**. A tela lista os ônibus reconhecidos na frota de todas as empresas, mostrando empresa, prefixo, modelo, chassi, ano quando conhecido, hodômetro, norma de emissões e uma barra de condição geral estimada.
- Ônibus comprados no **Mercado 0 km** entram automaticamente com condição inicial de 100% e hodômetro zero. Veículos usados sem leitura confirmada aparecem com o selo **Completar ano/km**. Abra a ficha de cadastro técnico e informe o ano de fabricação, a leitura real do hodômetro, uso predominante e norma de emissões. Quando o hodômetro mostrado for apenas uma estimativa, o campo de leitura real fica vazio para evitar que uma estimativa seja salva como se fosse uma leitura do painel.
- A condição inicial dos usados é uma **estimativa** construída com idade, quilometragem conhecida ou estimada e tipo de uso. Ela não substitui inspeção física, histórico de manutenção, laudo ou manual específico do chassi. Depois de preencher o ano/km e registrar serviços reais, o perfil passa a refletir melhor o histórico cadastrado.
- A ficha **Ver situação completa** reúne motor/óleo/filtros, arrefecimento, transmissão, freios/pneumática, direção/suspensão, pneus/rodas, elétrica, portas, acessibilidade, ar-condicionado, carroceria e limpeza. Componentes SCR/ARLA 32 só são exibidos quando a norma foi identificada como Euro V/Euro VI ou escolhida manualmente na ficha técnica. Se a tecnologia de emissões do ônibus for diferente, corrija o campo para corresponder ao motor/chassi efetivamente instalado.

### Desgaste, hodômetro e risco de pane
- Cada viagem concluída no **Visualizador de Operação** soma os quilômetros informados no campo de distância do percurso ao hodômetro de oficina e à leitura usada pela Agenda. O sistema reduz gradualmente a condição estimada de itens de desgaste, como óleo/filtros, pneus, freios, suspensão, componentes pneumáticos, elétrica, portas e ar-condicionado. Em Euro V/VI com SCR, também considera o consumo simulado de ARLA 32 e desgaste do filtro, sensores NOx, bomba/dosador e catalisador.
- A probabilidade de pane por viagem aumenta quando a condição geral cai ou algum componente chega a uma faixa crítica. Quando ocorre uma pane simulada, a operação pausa e o aviso fixado no menu oferece **Enviar mecânico** ou escolher um **ônibus reserva** da mesma empresa. A substituição registra o veículo que saiu de operação e cria uma tarefa de diagnóstico na Agenda.
- Os intervalos são aproximações de simulação e variam muito por motor, aplicação, combustível, severidade, quilometragem, fabricante e manual. Como referência de serviço severo, consulte o manual do chassi exato; o manual Mercedes-Benz OF-1721/1721L contém tabelas de manutenção específicas, inclusive orientações para filtros e sistema ARLA. Não use os intervalos genéricos do jogo como autorização para adiar a manutenção real. Fonte de referência: [Mercedes-Benz — manuais e literatura técnica](https://www.mercedes-benz-trucks.com.br/).

### Conserto, mecânicos e conferência
- Na lista da frota, o botão **Conserto** aparece para qualquer ônibus, independentemente da condição. Escolha garagem, tipo de serviço, mecânico contratado e prioridade; informe ruído, sintoma ou o que deseja revisar. Uma ordem pode ficar aguardando peças, em execução, em reavaliação ou aguardando conferência.
- Os tempos são estimativas de **horas produtivas de oficina**. A simulação considera expediente de segunda a sexta, 08h–12h e 13h–17h, pulando noites e finais de semana. O nível de experiência de 1 a 5 e a especialidade compatível reduzem o tempo estimado. Reparos de motor e transmissão podem levar muitas semanas; inspeções e limpezas podem levar algumas horas. A contagem é local: se o site for fechado, o prazo é atualizado na próxima abertura, mas nenhum mecânico trabalha de verdade em segundo plano.
- O sistema calcula peças previstas para cada OS. Se já houver estoque compatível, ele pode ser separado automaticamente. Caso contrário, a OS aguarda a compra/entrega. A compra de uma peça debita o Caixa uma única vez; usar uma peça que já foi comprada/estocada não cria uma segunda saída.
- Quando o mecânico termina, surge um alerta **Ônibus pronto — aguardando sua conferência**. Abra a OS para conferir serviço, componentes, peças, quantidades, mecânico, horas e garagem. **Confirmar boas condições** registra a melhoria de condição e o custo de mão de obra; **Recusar** devolve o serviço ao mecânico para diagnóstico adicional, ou permite exigir peça original/genuína. Inspeção preventiva atualiza a data de inspeção, mas não aumenta artificialmente a saúde dos componentes.
- Se a OS estiver vinculada a tarefa da Agenda, ela só é marcada como concluída quando o proprietário aprova o serviço. O botão das tarefas de limpeza, lavagem, óleo, pneus, manutenção e inspeção encaminha para a Mecânica. Serviços regulares de linha e contratos aceitos geram uma inspeção pré-saída e sugestão de limpeza na Agenda.

### Atendimento Online — contratações
- No celular do Atendimento Online, abra **Equipe**. O catálogo simulado apresenta motoristas e mecânicos com cidade, experiência, habilitação/curso, especialidade e nível de mecânico. Confira o perfil, escolha empresa, salário, benefícios e jornada e contrate. Os profissionais contratados aparecem nos campos de escala da Operação de Linha e nos seletores de mecânicos da Garagem; desligar um profissional remove-o das novas escalas, sem apagar o histórico.
- O nível de mecânico (1 a 5) representa experiência simulada e reduz o tempo de execução, sobretudo quando a especialidade combina com a tarefa. Candidatos, salários e benefícios são valores ilustrativos e editáveis, não uma tabela trabalhista oficial. Piso, vale, jornada, benefícios e enquadramento podem variar conforme cidade, sindicato, categoria e convenção coletiva vigente; confirme a convenção territorial aplicável antes de uma contratação real.

### Mercado de Peças
- No celular do Atendimento Online, abra **Peças**. O catálogo gera **9.240 SKUs simulados em 11 categorias**, a partir de famílias de componentes, fabricantes, quatro níveis de qualidade e variações de aplicação. Há motor/filtros, arrefecimento, pneus/rodas, freios/pneumática, suspensão/direção, elétrica, transmissão, SCR/ARLA 32, carroceria/portas, ar-condicionado e limpeza/oficina.
- Ao entrar no mercado por uma OS, o ônibus e as peças pendentes são vinculados ao filtro. A lista prioriza os itens solicitados pela oficina, verifica compatibilidade aproximada por tipo de chassi e impede comprar para aquela OS um item que não esteja pendente ou que não corresponda à aplicação estimada. Para pneus e cubos, existem referências separadas para ônibus pesados e micro-ônibus (por exemplo, pneu 275/80 R22.5 versus 215/75 R17.5). A aplicação exata deve ser confirmada por chassi, eixo, medida, código OEM e catálogo do fabricante.
- Cada SKU tem referência simulada, fabricante/linha, qualidade (original/genuína, premium, reposição confiável ou econômica), preço estimado e, ocasionalmente, promoção. As referências de catálogo GC e os preços são fictícios para simulação; não representam códigos OEM verificados nem estoque real de lojas.
- Escolha retirada imediata quando houver estoque local, entrega expressa de até 24 horas, entrega estimada entre 2 e 4 dias úteis, ou entrega estimada entre 5 e 8 dias úteis. As opções de dias úteis pulam sábado e domingo no cálculo de prazo. O valor é debitado do Caixa ao confirmar a compra; a peça chega ao estoque/OS quando o prazo simulado expira e o site é aberto ou atualizado.

### Relatório de Oficina
- No celular, abra **Oficina** para consultar serviços concluídos, filtrar por veículo e ver data, prefixo, modelo, mecânico, serviço, componentes afetados, peças usadas, custo de peças, mão de obra e total. Na Garagem, a aba **Relatórios** apresenta o mesmo histórico e permite exportar CSV.
- Os relatórios registram peças compradas diretamente para a OS e peças que saíram do estoque. Como a compra já foi debitada no Caixa na entrada/compra, o uso de estoque aparece no custo histórico da OS, mas não é debitado novamente.

### Observações importantes
- O sistema é um simulador no GitHub Pages. A barra de condição é estimada, a pane é probabilística e os preços/entregas/peças são fictícios. Ele não lê sensores reais do ônibus, não consulta catálogo de concessionária, não agenda mecânico real e não envia notificações push com o navegador totalmente fechado. Alertas e prazos são atualizados quando a página está aberta ou quando você retorna a ela.
- Os dados são guardados no `localStorage` do navegador. Antes de substituir os arquivos no GitHub, exporte um backup pelo módulo existente. Atualizar a página/arquivos no mesmo navegador normalmente preserva o armazenamento local; trocar de navegador/aparelho ou limpar dados do site pode perder os registros.

## Correção de abertura — Atendimento Online e Agenda de Frota

Nesta revisão, a abertura desses dois módulos foi reforçada com um acionador delegado em captura, reduzindo a dependência de listeners ligados diretamente aos cartões. O Atendimento Online agora mostra o painel antes de sincronizar as propostas; se a sincronização local falhar, a tela permanece aberta e apresenta aviso em vez de parecer que o botão não respondeu. A Agenda de Frota também exibe o painel antes da atualização do calendário e apresenta aviso em caso de falha de renderização. O acesso continua restrito à seleção de Pablo na interface.

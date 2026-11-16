const { createDomainQuizTool } = require('../core/quiz-domain');

module.exports = {
  id: 'sentence',
  create: options => createDomainQuizTool(options, {
    id: 'sentence',
    domain: 'sentence',
    title: '句子重組',
    short: '句子',
    icon: 'pen',
    accent: '#7a4ab8',
    targetLabel: '句式',
    roundPrefix: 'SB_',
    seedMessage: '[sentence] 已寫入句子重組題目'
  })
};

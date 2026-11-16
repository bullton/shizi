const { createDomainQuizTool } = require('../core/quiz-domain');

module.exports = {
  id: 'gk',
  create: options => createDomainQuizTool(options, {
    id: 'gk',
    domain: 'gk',
    title: '常識問答',
    short: '常識',
    icon: 'compass',
    accent: '#2f8f6b',
    targetLabel: '範疇',
    roundPrefix: 'GK_',
    seedMessage: '[gk] 已寫入常識問答題目'
  })
};

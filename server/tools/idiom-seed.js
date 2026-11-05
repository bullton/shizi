const NODES = [
  { node_id: 'PEOPLE_LOOK', dimension: '寫人篇', category: '寫人篇', title: '外貌與神態描寫', usage_tip: '寫人先抓神態：眉、眼、嘴角和臉色，最能看出心情。', order: 1 },
  { node_id: 'PEOPLE_ACTION', dimension: '寫人篇', category: '寫人篇', title: '動作與體態描寫', usage_tip: '用連續動作和身體姿態，讓人物像在眼前動起來。', order: 2 },
  { node_id: 'PEOPLE_HAPPY', dimension: '寫人篇', category: '寫人篇', title: '心情：喜悅與激動', usage_tip: '高興不只用「很開心」，可以寫眉毛、笑聲和動作。', order: 3 },
  { node_id: 'PEOPLE_UPSET', dimension: '寫人篇', category: '寫人篇', title: '心情：焦急、憤怒與悲傷', usage_tip: '先寫心情，再寫表情和動作，情緒會更立體。', order: 4 },
  { node_id: 'PEOPLE_FOCUS', dimension: '寫人篇', category: '寫人篇', title: '學習與做事態度', usage_tip: '用專注的時間、動作和結果，襯托人物的認真。', order: 5 },
  { node_id: 'PEOPLE_QUALITY', dimension: '寫人篇', category: '寫人篇', title: '才學與品德修養', usage_tip: '寫品德要落到一件事上，讓行動說話。', order: 6 },
  { node_id: 'EVENT_CROWD', dimension: '寫事篇', category: '寫事篇', title: '場面氣氛：熱鬧與安靜', usage_tip: '寫場面可從人數、聲音、動作三個角度入手。', order: 7 },
  { node_id: 'EVENT_SPEED', dimension: '寫事篇', category: '寫事篇', title: '事物變化與快慢', usage_tip: '用對比寫變化：以前怎樣，現在怎樣。', order: 8 },
  { node_id: 'EVENT_EFFORT', dimension: '寫事篇', category: '寫事篇', title: '克服困難與逆境突破', usage_tip: '寫困難要具體，寫突破要有行動和結果。', order: 9 },
  { node_id: 'EVENT_TEAM', dimension: '寫事篇', category: '寫事篇', title: '團結協作與互相配合', usage_tip: '寫合作要寫出分工、配合和共同的結果。', order: 10 },
  { node_id: 'EVENT_FABLE', dimension: '寫事篇', category: '寫事篇', title: '做事方法不當與寓言警示', usage_tip: '先寫做法，再寫後果，最後點出道理。', order: 11 },
  { node_id: 'SCENE_WEATHER', dimension: '寫景狀物', category: '寫景狀物', title: '四季氣候與天氣現象', usage_tip: '寫天氣要調動眼睛、耳朵、皮膚的感受。', order: 12 },
  { node_id: 'SCENE_NATURE', dimension: '寫景狀物', category: '寫景狀物', title: '山水花木與自然風光', usage_tip: '按遠近或高低順序寫景，畫面會更有層次。', order: 13 },
  { node_id: 'SCENE_CITY', dimension: '寫景狀物', category: '寫景狀物', title: '建築風貌與繁華景象', usage_tip: '寫建築可抓外形、燈光和人群，寫出城市氣息。', order: 14 },
  { node_id: 'ADV_SPEECH', dimension: '表達與避坑', category: '表達與避坑', title: '言語表達與口才狀態', usage_tip: '寫說話要配合語氣、表情和場合。', order: 15 },
  { node_id: 'ADV_NUMBER', dimension: '表達與避坑', category: '表達與避坑', title: '數量多寡與程度對比', usage_tip: '數量詞要跟具體事物搭配，避免張冠李戴。', order: 16 },
  { node_id: 'TRAP_MEANING', dimension: '表達與避坑', category: '表達與避坑', title: '高頻望文生義避坑專項', usage_tip: '成語不能只看字面，先想它的真正意思。', order: 17 },
  { node_id: 'TRAP_TONE', dimension: '表達與避坑', category: '表達與避坑', title: '褒貶感情色彩辨析專項', usage_tip: '同樣是稱讚或批評，成語的褒貶要先分清。', order: 18 }
];

const IDIOMS = [
  {
    word: '眉飛色舞',
    pinyin: 'méi fēi sè wǔ',
    meaning: '形容人說得非常高興、神采飛揚的樣子。',
    key_char_note: '「色」指臉色、神情，不是顏色。',
    sentiment: '褒義',
    target_object: '人物神態',
    example: '講到這次去海邊抓螃蟹的趣事，弟弟頓時眉飛色舞起來。'
  },
  {
    word: '垂頭喪氣',
    pinyin: 'chuí tóu sàng qì',
    meaning: '形容因為失敗或不順利而情緒低落、萎靡不振的樣子。',
    key_char_note: '「喪」讀 sàng（四聲），指失去；「氣」指精神、勇氣。',
    sentiment: '貶義',
    target_object: '人物神態與情緒',
    example: '沒能入選校籃球隊，他垂頭喪氣地走在回家的路上。'
  },
  {
    word: '愁眉苦臉',
    pinyin: 'chóu méi kǔ liǎn',
    meaning: '皺著眉頭，哭喪著臉，形容發愁、苦惱的神情。',
    key_char_note: '「愁」指憂慮發愁。',
    sentiment: '中性',
    target_object: '人物面部表情',
    example: '看著滿桌拼不起來的零件，他愁眉苦臉地嘆了口氣。'
  },
  {
    word: '目瞪口呆',
    pinyin: 'mù dèng kǒu dāi',
    meaning: '眼睛直盯著不動，嘴巴張著說不出話，形容因吃驚或害怕而發愣的樣子。',
    key_char_note: '「瞪」指睜大眼睛直視。',
    sentiment: '中性',
    target_object: '人物受驚神態',
    example: '魔術師一眨眼變走了一輛汽車，台下的觀眾全都目瞪口呆。'
  }
];

const QUESTIONS = [
  {
    question_id: 'IQ_001',
    node_id: 'PEOPLE_LOOK',
    question_type: 'INTENT',
    stem: '以下哪個成語最適合用來描寫【小明在向同學們講述自己拿到航模比賽一等獎時，興奮得眉毛和神情都飛揚起來的樣子】？',
    highlight_clue: '興奮得眉毛和神情都飛揚起來',
    correct_option: '眉飛色舞',
    distractors: ['垂頭喪氣', '愁眉苦臉', '目瞪口呆'],
    explanation: '題幹描寫的是極其興奮、得意的高興神態，應選【眉飛色舞】；【垂頭喪氣】用於失敗失落，【愁眉苦臉】用於發愁苦惱，【目瞪口呆】用於吃驚發愣。'
  },
  {
    question_id: 'IQ_002',
    node_id: 'PEOPLE_LOOK',
    question_type: 'INTENT',
    stem: '以下哪個成語最適合用來描寫【小華沒能入選校籃球隊，低著頭、沒精打采地走在回家的路上】？',
    highlight_clue: '低著頭、沒精打采',
    correct_option: '垂頭喪氣',
    distractors: ['眉飛色舞', '愁眉苦臉', '目瞪口呆'],
    explanation: '題幹寫的是失敗後情緒低落，應選【垂頭喪氣】；【眉飛色舞】是高興得意，【愁眉苦臉】是發愁苦惱，【目瞪口呆】是吃驚發愣。'
  },
  {
    question_id: 'IQ_003',
    node_id: 'PEOPLE_LOOK',
    question_type: 'INTENT',
    stem: '以下哪個成語最適合用來描寫【妹妹看著滿桌拼不起來的零件，皺著眉頭、苦著臉嘆氣】？',
    highlight_clue: '皺著眉頭、苦著臉嘆氣',
    correct_option: '愁眉苦臉',
    distractors: ['眉飛色舞', '垂頭喪氣', '目瞪口呆'],
    explanation: '題幹寫的是發愁、苦惱的神情，應選【愁眉苦臉】；【眉飛色舞】是高興，【垂頭喪氣】是失敗後低落，【目瞪口呆】是吃驚。'
  },
  {
    question_id: 'IQ_004',
    node_id: 'PEOPLE_LOOK',
    question_type: 'INTENT',
    stem: '以下哪個成語最適合用來描寫【魔術師一眨眼變走了一輛汽車，台下的觀眾眼睛直盯著、嘴巴張著說不出話】？',
    highlight_clue: '眼睛直盯著、嘴巴張著說不出話',
    correct_option: '目瞪口呆',
    distractors: ['眉飛色舞', '垂頭喪氣', '愁眉苦臉'],
    explanation: '題幹寫的是因吃驚而發愣，應選【目瞪口呆】；【眉飛色舞】是高興，【垂頭喪氣】是失落，【愁眉苦臉】是發愁。'
  }
];

module.exports = { NODES, IDIOMS, QUESTIONS };

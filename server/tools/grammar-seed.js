const NODES = [
  { node_id: 'NOUN_01', category: 'L1 詞法基礎', title: '名詞單複數', rule_tip: '規則變化加 -s / -es / -ies；不規則變化要記住，例如 child → children。', order: 1 },
  { node_id: 'NOUN_02', category: 'L1 詞法基礎', title: '名詞所有格', rule_tip: '有生命用 \'s / s\'；無生命多用 of 結構。', order: 2 },
  { node_id: 'ART_01', category: 'L1 詞法基礎', title: '冠詞辨析', rule_tip: '元音音素前用 an；特指用 the；泛指複數或不可數名詞常不用冠詞。', order: 3 },
  { node_id: 'PRON_01', category: 'L1 詞法基礎', title: '代詞體系', rule_tip: '主格放動詞前，賓格放動詞或介詞後；物主代詞要分清後面有沒有名詞。', order: 4 },
  { node_id: 'PREP_01', category: 'L1 詞法基礎', title: '常用介詞', rule_tip: 'in 用於月份、年份、大範圍；on 用於日期、星期；at 用於時刻。', order: 5 },
  { node_id: 'ADJ_01', category: 'L1 詞法基礎', title: '形容詞與副詞', rule_tip: '比較級加 -er / more，最高級加 -est / most；good、bad、many 是不規則變化。', order: 6 },

  { node_id: 'TENSE_01', category: 'L2 核心時態', title: '一般現在時', rule_tip: '三單後面動詞加 -s / -es；be 動詞用 am / is / are。', order: 7 },
  { node_id: 'TENSE_02', category: 'L2 核心時態', title: '現在進行時', rule_tip: 'be + doing；now、look、listen 是標誌詞。', order: 8 },
  { node_id: 'TENSE_03', category: 'L2 核心時態', title: '一般將來時', rule_tip: 'be going to 表示計劃；will 表示意願或臨時決定。', order: 9 },
  { node_id: 'TENSE_04', category: 'L2 核心時態', title: '一般過去時', rule_tip: 'was / were；規則動詞加 -ed；不規則動詞如 go → went。', order: 10 },
  { node_id: 'TENSE_05', category: 'L2 核心時態', title: '現在完成時', rule_tip: 'have / has + 過去分詞；already 用於肯定，yet 用於否定或疑問。', order: 11 },

  { node_id: 'SENT_01', category: 'L3 句法與結構', title: 'There be 句型', rule_tip: 'There be 後面用就近原則；表示「某處有」，不要和 have / has 混用。', order: 12 },
  { node_id: 'SENT_02', category: 'L3 句法與結構', title: '疑問句體系', rule_tip: '一般疑問句助動詞提前；特殊疑問詞放句首。', order: 13 },
  { node_id: 'SENT_03', category: 'L3 句法與結構', title: '情態動詞', rule_tip: 'can / must / should / may 後面用動詞原形。', order: 14 },
  { node_id: 'SENT_04', category: 'L3 句法與結構', title: '非謂語與固定搭配', rule_tip: 'want / need 後用 to do；enjoy / finish 後用 doing。', order: 15 }
];

const QUESTIONS = [
  { question_id: 'GQ_001', node_id: 'NOUN_01', stem: 'There are three ____ in the garden.', highlight_word: 'three', correct_option: 'butterflies', distractors: ['butterfly', 'butterflys', 'butterflie'], explanation: 'three 後面要用複數；butterfly 去 y 加 -ies。' },
  { question_id: 'GQ_002', node_id: 'NOUN_01', stem: 'My uncle has two ____.', highlight_word: 'two', correct_option: 'children', distractors: ['childs', 'childes', 'child'], explanation: 'child 的複數是不規則的 children。' },
  { question_id: 'GQ_003', node_id: 'NOUN_01', stem: 'We need some ____ for the soup.', highlight_word: 'some', correct_option: 'tomatoes', distractors: ['tomato', 'tomatos', 'tomatoies'], explanation: 'tomato 加 -es 變成複數 tomatoes。' },
  { question_id: 'GQ_004', node_id: 'NOUN_01', stem: 'Look at those ____ on the farm.', highlight_word: 'those', correct_option: 'sheep', distractors: ['sheeps', 'sheepes', 'sheepe'], explanation: 'sheep 的複數和單數同形。' },

  { question_id: 'GQ_005', node_id: 'NOUN_02', stem: 'This is ____ bicycle.', highlight_word: 'Tom', correct_option: 'Tom\'s', distractors: ['Toms', 'Toms\'', 'Tom'], explanation: '單數人名所有格加 \'s。' },
  { question_id: 'GQ_006', node_id: 'NOUN_02', stem: 'The ____ toys are in the box.', highlight_word: 'children', correct_option: 'children\'s', distractors: ['childrens\'', 'childrens', 'children'], explanation: '複數名詞不是以 s 結尾，所有格加 \'s。' },
  { question_id: 'GQ_007', node_id: 'NOUN_02', stem: 'The ____ of the book is blue.', highlight_word: 'book', correct_option: 'cover', distractors: ['cover\'s', 'covers', 'cover of'], explanation: '無生命名詞常用 of 結構：the cover of the book。' },
  { question_id: 'GQ_008', node_id: 'NOUN_02', stem: 'Those are the ____ bags.', highlight_word: 'Those', correct_option: 'girls\'', distractors: ['girl\'s', 'girls', 'girls\'s'], explanation: '以 s 結尾的複數名詞，所有格只加 \'。' },

  { question_id: 'GQ_009', node_id: 'ART_01', stem: 'I have ____ orange every morning.', highlight_word: 'orange', correct_option: 'an', distractors: ['a', 'the', 'some'], explanation: 'orange 以元音音素開頭，用 an。' },
  { question_id: 'GQ_010', node_id: 'ART_01', stem: '____ sun rises in the east.', highlight_word: 'sun', correct_option: 'The', distractors: ['A', 'An', 'Some'], explanation: '世界上獨一無二的事物前用 the。' },
  { question_id: 'GQ_011', node_id: 'ART_01', stem: 'She is ____ honest girl.', highlight_word: 'honest', correct_option: 'an', distractors: ['a', 'the', 'some'], explanation: 'honest 的 h 不發音，以元音音素開頭，用 an。' },
  { question_id: 'GQ_012', node_id: 'ART_01', stem: 'We usually have ____ breakfast at seven.', highlight_word: 'breakfast', correct_option: '（不填）', distractors: ['a', 'the', 'an'], explanation: '三餐前一般用零冠詞。' },

  { question_id: 'GQ_013', node_id: 'PRON_01', stem: 'This is my sister. ____ is a teacher.', highlight_word: 'my sister', correct_option: 'She', distractors: ['Her', 'Hers', 'She\'s'], explanation: '主語位置用主格 She。' },
  { question_id: 'GQ_014', node_id: 'PRON_01', stem: 'Please give ____ the book.', highlight_word: 'give', correct_option: 'me', distractors: ['I', 'my', 'mine'], explanation: '動詞後面用賓格 me。' },
  { question_id: 'GQ_015', node_id: 'PRON_01', stem: 'These pencils are ____.', highlight_word: 'These pencils', correct_option: 'ours', distractors: ['our', 'us', 'we'], explanation: '名詞性物主代詞 ours = our pencils。' },
  { question_id: 'GQ_016', node_id: 'PRON_01', stem: '____ is your favourite colour?', highlight_word: 'colour', correct_option: 'Which', distractors: ['Who', 'Whose', 'How'], explanation: '問「哪一個」顏色用 Which。' },

  { question_id: 'GQ_017', node_id: 'PREP_01', stem: 'My birthday is ____ May.', highlight_word: 'May', correct_option: 'in', distractors: ['on', 'at', 'by'], explanation: '月份前用 in。' },
  { question_id: 'GQ_018', node_id: 'PREP_01', stem: 'We have music ____ Monday.', highlight_word: 'Monday', correct_option: 'on', distractors: ['in', 'at', 'by'], explanation: '星期前用 on。' },
  { question_id: 'GQ_019', node_id: 'PREP_01', stem: 'The class starts ____ eight o\'clock.', highlight_word: 'eight o\'clock', correct_option: 'at', distractors: ['in', 'on', 'for'], explanation: '具體時刻前用 at。' },
  { question_id: 'GQ_020', node_id: 'PREP_01', stem: 'The cat is hiding ____ the table.', highlight_word: 'hiding', correct_option: 'under', distractors: ['on', 'between', 'next'], explanation: '在桌子下面用 under。' },

  { question_id: 'GQ_021', node_id: 'ADJ_01', stem: 'An elephant is ____ than a mouse.', highlight_word: 'than', correct_option: 'bigger', distractors: ['big', 'biggest', 'more big'], explanation: 'than 前用比較級；big 雙寫 g 加 -er。' },
  { question_id: 'GQ_022', node_id: 'ADJ_01', stem: 'This is the ____ book in the library.', highlight_word: 'the', correct_option: 'thickest', distractors: ['thicker', 'thick', 'most thick'], explanation: '三者以上比較用最高級 the thickest。' },
  { question_id: 'GQ_023', node_id: 'ADJ_01', stem: 'My English is ____ than before.', highlight_word: 'than', correct_option: 'better', distractors: ['gooder', 'more good', 'best'], explanation: 'good 的比較級是 better。' },
  { question_id: 'GQ_024', node_id: 'ADJ_01', stem: 'She sings very ____.', highlight_word: 'sings', correct_option: 'beautifully', distractors: ['beautiful', 'beauty', 'more beautiful'], explanation: '修飾動詞 sings 用副詞 beautifully。' },

  { question_id: 'GQ_025', node_id: 'TENSE_01', stem: 'She ____ to school every day.', highlight_word: 'every day', correct_option: 'goes', distractors: ['go', 'going', 'went'], explanation: 'every day 表示習慣；she 是三單，go 加 -es。' },
  { question_id: 'GQ_026', node_id: 'TENSE_01', stem: 'My parents ____ coffee in the morning.', highlight_word: 'My parents', correct_option: 'drink', distractors: ['drinks', 'drinking', 'drank'], explanation: '主語是複數，用動詞原形 drink。' },
  { question_id: 'GQ_027', node_id: 'TENSE_01', stem: '____ he like apples?', highlight_word: 'he', correct_option: 'Does', distractors: ['Do', 'Is', 'Are'], explanation: '三單主語的一般疑問句用 Does。' },
  { question_id: 'GQ_028', node_id: 'TENSE_01', stem: 'The baby ____ every afternoon.', highlight_word: 'every afternoon', correct_option: 'sleeps', distractors: ['sleep', 'sleeping', 'slept'], explanation: 'the baby 是三單，sleep 加 -s。' },

  { question_id: 'GQ_029', node_id: 'TENSE_02', stem: 'Listen! The birds ____ in the tree.', highlight_word: 'Listen!', correct_option: 'are singing', distractors: ['sing', 'sings', 'sang'], explanation: 'Listen! 提示現在進行時；birds 複數用 are singing。' },
  { question_id: 'GQ_030', node_id: 'TENSE_02', stem: 'I ____ my homework now.', highlight_word: 'now', correct_option: 'am doing', distractors: ['do', 'does', 'did'], explanation: 'now 提示現在進行時；I 用 am doing。' },
  { question_id: 'GQ_031', node_id: 'TENSE_02', stem: 'Look! The cat ____ up the tree.', highlight_word: 'Look!', correct_option: 'is climbing', distractors: ['climbs', 'climb', 'climbed'], explanation: 'Look! 提示動作正在發生；the cat 單數用 is climbing。' },
  { question_id: 'GQ_032', node_id: 'TENSE_02', stem: 'They ____ football at the moment.', highlight_word: 'at the moment', correct_option: 'are playing', distractors: ['play', 'plays', 'played'], explanation: 'at the moment 表示現在，they 用 are playing。' },

  { question_id: 'GQ_033', node_id: 'TENSE_03', stem: 'We ____ visit Grandma next Sunday.', highlight_word: 'next Sunday', correct_option: 'are going to', distractors: ['go', 'went', 'going'], explanation: 'next Sunday 表示將來；計劃用 be going to。' },
  { question_id: 'GQ_034', node_id: 'TENSE_03', stem: 'I think it ____ rain tomorrow.', highlight_word: 'tomorrow', correct_option: 'will', distractors: ['is', 'did', 'was'], explanation: 'tomorrow 表示將來；預測用 will。' },
  { question_id: 'GQ_035', node_id: 'TENSE_03', stem: 'She ____ be a doctor when she grows up.', highlight_word: 'when she grows up', correct_option: 'is going to', distractors: ['goes', 'went', 'going'], explanation: '長大後的計劃用 is going to。' },
  { question_id: 'GQ_036', node_id: 'TENSE_03', stem: '____ you help me carry this box?', highlight_word: 'help', correct_option: 'Will', distractors: ['Do', 'Did', 'Are'], explanation: '請求幫助用 Will you...?' },

  { question_id: 'GQ_037', node_id: 'TENSE_04', stem: 'We ____ to the zoo yesterday.', highlight_word: 'yesterday', correct_option: 'went', distractors: ['go', 'goes', 'going'], explanation: 'yesterday 表示過去；go 的過去式是 went。' },
  { question_id: 'GQ_038', node_id: 'TENSE_04', stem: 'She ____ a movie last night.', highlight_word: 'last night', correct_option: 'watched', distractors: ['watch', 'watches', 'watching'], explanation: 'last night 表示過去；watch 加 -ed。' },
  { question_id: 'GQ_039', node_id: 'TENSE_04', stem: 'They ____ at home yesterday.', highlight_word: 'yesterday', correct_option: 'were', distractors: ['was', 'are', 'is'], explanation: 'they 的過去式 be 動詞是 were。' },
  { question_id: 'GQ_040', node_id: 'TENSE_04', stem: 'I ____ my breakfast at seven this morning.', highlight_word: 'this morning', correct_option: 'ate', distractors: ['eat', 'eats', 'eating'], explanation: 'this morning 已經過去；eat 的過去式是 ate。' },

  { question_id: 'GQ_041', node_id: 'TENSE_05', stem: 'I have ____ my homework.', highlight_word: 'have', correct_option: 'finished', distractors: ['finish', 'finishing', 'finishes'], explanation: 'have 後面用過去分詞；finish → finished。' },
  { question_id: 'GQ_042', node_id: 'TENSE_05', stem: 'She has ____ in Hong Kong for five years.', highlight_word: 'for five years', correct_option: 'lived', distractors: ['live', 'living', 'lives'], explanation: 'for + 一段時間用現在完成時；live → lived。' },
  { question_id: 'GQ_043', node_id: 'TENSE_05', stem: 'Have you ____ your lunch yet?', highlight_word: 'yet', correct_option: 'eaten', distractors: ['eat', 'ate', 'eating'], explanation: 'yet 常用於現在完成時疑問句；eat 的過去分詞是 eaten。' },
  { question_id: 'GQ_044', node_id: 'TENSE_05', stem: 'He has ____ finished his work.', highlight_word: 'finished', correct_option: 'already', distractors: ['yet', 'ago', 'last'], explanation: 'already 用於肯定句，表示「已經」。' },

  { question_id: 'GQ_045', node_id: 'SENT_01', stem: 'There ____ a book on the desk.', highlight_word: 'a book', correct_option: 'is', distractors: ['are', 'have', 'has'], explanation: 'There be 就近原則；a book 單數用 is。' },
  { question_id: 'GQ_046', node_id: 'SENT_01', stem: 'There ____ two cats under the chair.', highlight_word: 'two cats', correct_option: 'are', distractors: ['is', 'have', 'has'], explanation: 'two cats 複數用 are。' },
  { question_id: 'GQ_047', node_id: 'SENT_01', stem: '____ there any milk in the fridge?', highlight_word: 'milk', correct_option: 'Is', distractors: ['Are', 'Have', 'Has'], explanation: 'milk 不可數，There be 用 Is there...?' },
  { question_id: 'GQ_048', node_id: 'SENT_01', stem: 'There ____ a pen and two books on the table.', highlight_word: 'a pen', correct_option: 'is', distractors: ['are', 'have', 'has'], explanation: '就近原則：a pen 單數，用 is。' },

  { question_id: 'GQ_049', node_id: 'SENT_02', stem: '____ do you go to school? — By bus.', highlight_word: 'By bus', correct_option: 'How', distractors: ['What', 'Who', 'Where'], explanation: '問方式用 How。' },
  { question_id: 'GQ_050', node_id: 'SENT_02', stem: '____ is that girl? — She is my cousin.', highlight_word: 'my cousin', correct_option: 'Who', distractors: ['Whose', 'Which', 'How many'], explanation: '問人是誰用 Who。' },
  { question_id: 'GQ_051', node_id: 'SENT_02', stem: '____ apples do you want? — Three, please.', highlight_word: 'Three', correct_option: 'How many', distractors: ['How much', 'How', 'Whose'], explanation: '可數名詞 apples 問數量用 How many。' },
  { question_id: 'GQ_052', node_id: 'SENT_02', stem: '____ does your father work? — In a hospital.', highlight_word: 'In a hospital', correct_option: 'Where', distractors: ['What', 'Who', 'When'], explanation: '問地點用 Where。' },

  { question_id: 'GQ_053', node_id: 'SENT_03', stem: 'You ____ finish your homework before dinner.', highlight_word: 'before dinner', correct_option: 'must', distractors: ['musts', 'must to', 'musting'], explanation: '情態動詞 must 後面用動詞原形。' },
  { question_id: 'GQ_054', node_id: 'SENT_03', stem: '____ you swim? — Yes, I can.', highlight_word: 'swim', correct_option: 'Can', distractors: ['Do', 'Are', 'Did'], explanation: '問能力用 Can you...?' },
  { question_id: 'GQ_055', node_id: 'SENT_03', stem: 'We ____ talk loudly in the library.', highlight_word: 'library', correct_option: 'shouldn\'t', distractors: ['don\'t should', 'shouldn\'t to', 'not should'], explanation: 'should 的否定是 shouldn\'t + 動詞原形。' },
  { question_id: 'GQ_056', node_id: 'SENT_03', stem: 'You ____ be tired after the long walk.', highlight_word: 'after the long walk', correct_option: 'may', distractors: ['maybe', 'may to', 'maying'], explanation: 'may 表示「可能」，後面用動詞原形。' },

  { question_id: 'GQ_057', node_id: 'SENT_04', stem: 'I want ____ a new bike.', highlight_word: 'want', correct_option: 'to buy', distractors: ['buy', 'buying', 'bought'], explanation: 'want 後面用 to do：want to buy。' },
  { question_id: 'GQ_058', node_id: 'SENT_04', stem: 'She enjoys ____ storybooks.', highlight_word: 'enjoys', correct_option: 'reading', distractors: ['read', 'to read', 'reads'], explanation: 'enjoy 後面用 doing：enjoy reading。' },
  { question_id: 'GQ_059', node_id: 'SENT_04', stem: 'We need ____ more water.', highlight_word: 'need', correct_option: 'to drink', distractors: ['drink', 'drinking', 'drank'], explanation: 'need 後面用 to do：need to drink。' },
  { question_id: 'GQ_060', node_id: 'SENT_04', stem: 'He finished ____ his room.', highlight_word: 'finished', correct_option: 'cleaning', distractors: ['clean', 'to clean', 'cleans'], explanation: 'finish 後面用 doing：finish cleaning。' }
];

module.exports = { NODES, QUESTIONS };

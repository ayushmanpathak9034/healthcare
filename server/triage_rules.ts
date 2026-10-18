export interface RedFlagRule {
  category: string;
  emergency_type: string;
  colour: 'RED' | 'YELLOW';
  reason: string;
  keywords: string[];
}

export const RED_FLAG_RULES: RedFlagRule[] = [
  {
    category: 'cardiac',
    emergency_type: 'cardiac_chest_pain',
    colour: 'RED',
    reason: 'Chest pain or cardiac distress detected',
    keywords: [
      'chest pain',
      'pain in chest',
      'heart attack',
      'angina',
      'seene mein dard',
      'seene me dard',
      'chhati mein dard',
      'सीने में दर्द',
      'छाती में दर्द',
      'दिल का दौरा',
      'हार्ट अटैक',
    ],
  },
  {
    category: 'respiratory',
    emergency_type: 'breathing_difficulty',
    colour: 'RED',
    reason: 'Severe respiratory distress or choking detected',
    keywords: [
      'breathing difficulty',
      'difficulty breathing',
      'cannot breathe',
      'shortness of breath',
      'gasping',
      'suffocation',
      'saans lene mein dikkat',
      'saans phoolna',
      'dam ghutna',
      'saans nahi aa rahi',
      'सांस लेने में तकलीफ',
      'सांस फूलना',
      'दम घुटना',
      'सांस नहीं आ रही',
    ],
  },
  {
    category: 'stroke',
    emergency_type: 'stroke',
    colour: 'RED',
    reason: 'Stroke signs or sudden paralysis detected',
    keywords: [
      'stroke',
      'paralysis',
      'facial drooping',
      'slurred speech',
      'lakwa',
      'munh tedha',
      'bolne mein dikkat',
      'aadhi body sunn',
      'लकवा',
      'मुंह टेढ़ा',
      'स्ट्रोक',
      'पक्षाघात',
    ],
  },
  {
    category: 'bleeding',
    emergency_type: 'heavy_bleeding',
    colour: 'RED',
    reason: 'Heavy bleeding or severe hemorrhage detected',
    keywords: [
      'heavy bleeding',
      'severe bleeding',
      'bleeding profusely',
      'blood loss',
      'khun beh raha',
      'bahut jyada khoon',
      'khoon band nahi ho raha',
      'खून बह रहा',
      'भारी रक्तस्राव',
      'खून बंद नहीं हो रहा',
    ],
  },
  {
    category: 'unconscious',
    emergency_type: 'unconscious',
    colour: 'RED',
    reason: 'Unconsciousness or altered sensorium detected',
    keywords: [
      'unconscious',
      'not waking up',
      'passed out',
      'fainted',
      'unresponsive',
      'behosh',
      'behoshi',
      'hosh nahi',
      'hosh kho baitha',
      'बेहोश',
      'बेहोशी',
      'होश नहीं',
    ],
  },
  {
    category: 'seizure',
    emergency_type: 'seizure',
    colour: 'RED',
    reason: 'Seizure or convulsions detected',
    keywords: [
      'seizure',
      'convulsion',
      'fits',
      'epilepsy attack',
      'daura',
      'mirgi',
      'fit pad gaya',
      'jhatke',
      'दौरा',
      'मिर्गी',
      'झटके',
    ],
  },
  {
    category: 'snakebite',
    emergency_type: 'snakebite',
    colour: 'RED',
    reason: 'Snakebite emergency detected',
    keywords: [
      'snake bite',
      'snakebite',
      'bitten by snake',
      'saanp ne kaata',
      'saanp ne kata',
      'saap ne kaata',
      'सांप ने काटा',
      'साँप ने काटा',
      'सांप काट लिया',
    ],
  },
  {
    category: 'poisoning',
    emergency_type: 'poisoning',
    colour: 'RED',
    reason: 'Poisoning or ingestion of toxic chemical detected',
    keywords: [
      'poison',
      'poisoning',
      'consumed poison',
      'toxic',
      'pesticide',
      'zeher',
      'jeher',
      'zehar khaa liya',
      'जहर खा लिया',
      'जहर',
      'कीटनाशक',
    ],
  },
  {
    category: 'dog_bite',
    emergency_type: 'dog_bite',
    colour: 'RED',
    reason: 'Animal / dog bite emergency detected',
    keywords: [
      'dog bite',
      'bitten by dog',
      'rabies exposure',
      'animal bite',
      'kutte ne kaata',
      'kutto ne kata',
      'kutte ne kaat liya',
      'कुत्ते ने काटा',
      'कुत्ता काट लिया',
    ],
  },
  {
    category: 'fast_heartbeat',
    emergency_type: 'cardiac_palpitations',
    colour: 'RED',
    reason: 'Extreme tachycardia or severe palpitations detected',
    keywords: [
      'fast heartbeat',
      'palpitations',
      'heart racing',
      'irregular heartbeat',
      'dil ki dhadkan bahut tez',
      'dhadkan tez',
      'dil ghabra raha',
      'दिल की धड़कन तेज',
      'दिल घबरा रहा',
    ],
  },
  // Moderate red-flags -> YELLOW
  {
    category: 'moderate_fever',
    emergency_type: 'high_fever',
    colour: 'YELLOW',
    reason: 'Persistent high fever with chills',
    keywords: [
      'high fever',
      '103 fever',
      '104 fever',
      'shivering',
      'tej bukhar',
      'tez bukhar',
      'तेज बुखार',
      'कांपना',
    ],
  },
  {
    category: 'severe_abdominal_pain',
    emergency_type: 'severe_pain',
    colour: 'YELLOW',
    reason: 'Severe acute abdominal pain',
    keywords: [
      'severe abdominal pain',
      'stomach cramp',
      'pet mein tej dard',
      'pet me tez dard',
      'पेट में तेज दर्द',
      'असहनीय दर्द',
    ],
  },
  {
    category: 'persistent_vomiting',
    emergency_type: 'dehydration_risk',
    colour: 'YELLOW',
    reason: 'Persistent vomiting and inability to keep fluids down',
    keywords: [
      'vomiting non stop',
      'cannot keep fluids',
      'bar bar ulti',
      'ulti ruk nahi rahi',
      'बार बार उल्टी',
      'उल्टी रुक नहीं रही',
    ],
  },
];

export interface SymptomQuestions {
  en: string[];
  hi: string[];
}

export const QUESTION_BANK: Record<string, SymptomQuestions> = {
  cardiac: {
    en: [
      'Can you describe the pain—is it spreading to your left arm, jaw, or upper back?',
      'How long has this pain been happening, and did it start suddenly or build up gradually?',
      'Are you experiencing sweating, cold clamminess, nausea, or dizziness along with it?',
    ],
    hi: [
      'क्या आप दर्द के बारे में बता सकते हैं—क्या यह आपके बाएं हाथ, जबड़े या पीठ तक फैल रहा है?',
      'यह दर्द कब से हो रहा है और क्या यह अचानक शुरू हुआ था या धीरे-धीरे बढ़ा?',
      'क्या इसके साथ पसीना, शरीर ठंडा पड़ना, जी मिचलाना या चक्कर भी आ रहे हैं?',
    ],
  },
  respiratory: {
    en: [
      'How severe is your breathing difficulty right now—does it occur even while resting?',
      'When did this trouble breathing start, and has it gotten rapidly worse?',
      'Are you hearing any wheezing sound or feeling severe tightness across your chest?',
    ],
    hi: [
      'इस समय आपको सांस लेने में कितनी तकलीफ हो रही है—क्या आराम करते समय भी हो रही है?',
      'सांस की यह तकलीफ कब शुरू हुई और क्या यह बहुत तेजी से बढ़ी है?',
      'क्या सांस लेते समय घरघराहट की आवाज आ रही है या सीने में भारी जकड़न है?',
    ],
  },
  snakebite: {
    en: [
      'Where on your body were you bitten, and what did the snake or creature look like?',
      'How long ago did the incident happen, and what symptoms appeared first?',
      'Are you experiencing rapid swelling, spreading numbness, or difficulty swallowing?',
    ],
    hi: [
      'शरीर के किस हिस्से में काटा है और वह सांप या जीव कैसा दिख रहा था?',
      'यह घटना कितनी देर पहले हुई और सबसे पहले क्या लक्षण नजर आए?',
      'क्या उस जगह तेजी से सूजन, सुन्नपन या निगलने में परेशानी महसूस हो रही है?',
    ],
  },
  stroke: {
    en: [
      'Can you describe any numbness, weakness, or inability to move your face, arm, or leg?',
      'When was the exact time the person was last seen completely normal?',
      'Is the person having difficulty speaking clearly or understanding simple words?',
    ],
    hi: [
      'क्या चेहरे, हाथ या पैर में कोई सुन्नपन, कमजोरी या हिलाने में दिक्कत महसूस हो रही है?',
      'मरीज को आखिरी बार पूरी तरह सामान्य स्थिति में कब देखा गया था?',
      'क्या बोलने में लड़खड़ाहट हो रही है या बात समझने में परेशानी आ रही है?',
    ],
  },
  bleeding: {
    en: [
      'Where is the bleeding coming from, and has applying direct firm pressure slowed it down?',
      'How did this injury happen, and are there other deeply painful or swollen areas?',
      'Is the person feeling faint, severely lightheaded, or unusually cold?',
    ],
    hi: [
      'खून शरीर में कहाँ से बह रहा है और क्या दबाने पर बहाव कम हुआ है?',
      'यह चोट कैसे लगी और शरीर में और कहाँ गंभीर दर्द या सूजन है?',
      'क्या मरीज को चक्कर आ रहे हैं या शरीर असामान्य रूप से ठंडा पड़ रहा है?',
    ],
  },
  unconscious: {
    en: [
      'How long has the person been unresponsive, and did they fall or injure their head?',
      'Can they respond to loud shouting or a firm tap on the shoulder?',
      'Are they breathing normally, snoring unusually, or making irregular sounds?',
    ],
    hi: [
      'मरीज कितनी देर से बेहोश है और क्या वे गिरे थे या सिर में चोट लगी थी?',
      'क्या वे जोर से आवाज देने या कंधे को हिलाने पर कोई प्रतिक्रिया दे रहे हैं?',
      'क्या उनकी सांस सामान्य चल रही है या कोई खर्राटे जैसी असामान्य आवाज आ रही है?',
    ],
  },
  dog_bite: {
    en: [
      'Where on the body did the dog or animal bite, and is the wound deep or bleeding?',
      'Was the animal known and vaccinated, or was it a stray acting aggressive?',
      'Have you washed the bite thoroughly under running water and soap yet?',
    ],
    hi: [
      'कुत्ते या जानवर ने कहाँ काटा है और क्या घाव गहरा है या खून बह रहा है?',
      'क्या वह जानवर पालतू और टीका लगा हुआ था या कोई आवारा जानवर था?',
      'क्या आपने घाव को तुरंत बहते पानी और साबुन से अच्छी तरह धोया है?',
    ],
  },
  general: {
    en: [
      'How long have you had these symptoms, and how severe is the discomfort right now on a scale of 1 to 10?',
      'Have you taken any medicines or home remedies so far, and did they provide any relief?',
      'Do you have any other associated symptoms like fever, vomiting, rash, or intense weakness?',
    ],
    hi: [
      'यह परेशानी आपको कितने समय से है और 1 से 10 के पैमाने पर अभी कितनी तकलीफ हो रही है?',
      'क्या आपने अब तक कोई दवाई या घरेलू उपाय किया है और क्या उससे कोई राहत मिली?',
      'क्या इसके साथ बुखार, उल्टी, त्वचा पर दाने या अत्यधिक कमजोरी जैसी कोई अन्य शिकायत है?',
    ],
  },
};

/**
 * Deterministic triage evaluator.
 * Escalates ONLY UP: GREEN -> YELLOW -> RED.
 */
export function evaluateTriage(params: {
  currentColour: 'GREEN' | 'YELLOW' | 'RED';
  transcript: string;
  answers?: { question: string; answer: string }[];
  language?: string;
}) {
  const fullText = [
    params.transcript,
    ...(params.answers || []).map((a) => `${a.question} ${a.answer}`),
  ]
    .join(' ')
    .toLowerCase();

  const reasons: string[] = [];
  const tags: string[] = [];
  let detectedSymptomGroup = 'general';
  let escalatedColour: 'GREEN' | 'YELLOW' | 'RED' = params.currentColour;

  for (const rule of RED_FLAG_RULES) {
    const matched = rule.keywords.some((kw) => fullText.includes(kw.toLowerCase()));
    if (matched) {
      tags.push(rule.category);
      if (!reasons.includes(rule.reason)) {
        reasons.push(rule.reason);
      }
      if (rule.colour === 'RED') {
        escalatedColour = 'RED';
        detectedSymptomGroup = rule.category;
      } else if (rule.colour === 'YELLOW' && escalatedColour === 'GREEN') {
        escalatedColour = 'YELLOW';
        if (detectedSymptomGroup === 'general') {
          detectedSymptomGroup = rule.category;
        }
      }
    }
  }

  // Pick question from question bank
  const isHindi = (params.language || '').toLowerCase().startsWith('hi');
  const questionsObj = QUESTION_BANK[detectedSymptomGroup] || QUESTION_BANK.general;
  const questionsList = isHindi ? questionsObj.hi : questionsObj.en;

  const answeredCount = params.answers?.length || 0;
  let followup_question: string | null = null;
  let done = false;

  if (answeredCount < Math.min(3, questionsList.length)) {
    followup_question = questionsList[answeredCount];
  } else {
    done = true;
  }

  return {
    escalated_colour: escalatedColour,
    reasons,
    tags: Array.from(new Set(tags)),
    symptom_group: detectedSymptomGroup,
    followup_question,
    done,
  };
}


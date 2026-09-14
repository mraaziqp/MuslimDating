/**
 * Marriage Readiness modules. Content and questions are shared with the
 * client; correct answers live only on the server (server/readiness-answers.ts).
 */

export interface ReadinessSection {
  heading: string;
  paragraphs: string[];
}

export interface ReadinessQuestion {
  question: string;
  options: string[];
}

export interface ReadinessModule {
  id: "intro" | "wali" | "finance";
  title: string;
  description: string;
  durationMinutes: number;
  /** Required modules gate connection requests (the Readiness Gate). */
  required: boolean;
  sections: ReadinessSection[];
  quiz: ReadinessQuestion[];
}

export type ReadinessModuleId = ReadinessModule["id"];

export const READINESS_MODULES: readonly ReadinessModule[] = [
  {
    id: "intro",
    title: "Etiquette of Halal Courtship",
    description: "The foundational principles of intention, modesty, and boundaries when seeking a spouse.",
    durationMinutes: 15,
    required: true,
    sections: [
      {
        heading: "Begin with a sincere intention",
        paragraphs: [
          "The Prophet ﷺ taught that actions are judged by their intentions (al-Bukhari and Muslim). Seeking a spouse is an act of worship when it is done to protect your faith, build a family, and please Allah.",
          "NikahPath exists for people who are ready to marry, not for casual conversation. Before sending a request, ask yourself honestly whether you are prepared for the responsibilities of marriage.",
        ],
      },
      {
        heading: "Modesty and boundaries",
        paragraphs: [
          "Allah instructs believing men and women to lower their gaze and guard their modesty (Surah an-Nur, 24:30–31). This shapes how we communicate: respectfully, purposefully, and without flirtation.",
          "The Prophet ﷺ warned against a man and a woman being alone together in seclusion (khalwa). That is why every conversation on NikahPath is chaperoned by a mahram, and why photos stay private until both of you consent.",
        ],
      },
      {
        heading: "Involve your family",
        paragraphs: [
          "Families bring wisdom, protection, and blessing to a marriage. Most scholars hold that a woman's wali must be involved in her marriage, and it is a sunnah for everyone to seek counsel from people who know them well.",
          "On NikahPath, walis can review requests and a mahram is assigned before any chat opens.",
        ],
      },
      {
        heading: "Purposeful conversation",
        paragraphs: [
          "Use your conversations to learn what matters for a lifetime together: practice of the deen, character, goals, where you want to live, children, finances, and expectations of each other and your families.",
          "Be honest about yourself. Hiding important facts undermines trust before a marriage has even begun.",
        ],
      },
      {
        heading: "Seek guidance and end respectfully",
        paragraphs: [
          "Pray Salat al-Istikhara, the prayer the Prophet ﷺ taught for seeking Allah's guidance in a decision (al-Bukhari), and consult people you trust.",
          "If a match is not right, say so kindly and promptly. Do not leave someone waiting without a reply, and keep what they shared with you private.",
        ],
      },
    ],
    quiz: [
      {
        question: "Why is every NikahPath conversation chaperoned by a mahram?",
        options: [
          "To prevent inappropriate seclusion (khalwa) and keep interactions within Islamic boundaries",
          "To check spelling and grammar",
          "Because conversations are posted publicly",
          "It is optional decoration with no purpose",
        ],
      },
      {
        question: "Surah an-Nur (24:30–31) instructs believing men and women to…",
        options: [
          "Share photos early to save time",
          "Lower their gaze and guard their modesty",
          "Avoid involving their families",
          "Keep their intentions secret",
        ],
      },
      {
        question: "What should conversations with a potential spouse focus on?",
        options: [
          "Casual flirting to build chemistry",
          "Physical appearance only",
          "Deen, character, life goals, and expectations of marriage",
          "Nothing serious until after the nikah",
        ],
      },
      {
        question: "If you decide a match is not right for you, the proper etiquette is to…",
        options: [
          "Stop replying without explanation",
          "Keep them waiting in case nobody better appears",
          "Share their details with friends for a second opinion",
          "Decline respectfully and promptly, and keep their information private",
        ],
      },
      {
        question: "Salat al-Istikhara is…",
        options: [
          "A prayer asking Allah for guidance in a decision",
          "The marriage contract",
          "A gift given to the bride",
          "A voluntary fast before the wedding",
        ],
      },
    ],
  },
  {
    id: "wali",
    title: "The Role of the Wali",
    description: "Understanding the wisdom and responsibilities behind familial involvement in marriage.",
    durationMinutes: 10,
    required: false,
    sections: [
      {
        heading: "Who is the wali?",
        paragraphs: [
          "The wali is a woman's guardian in marriage, usually her father, or another close male relative. The Prophet ﷺ said there is no marriage without a wali (reported by Abu Dawud and at-Tirmidhi), and this is the position of most scholars.",
          "The wali's role is protection and advocacy: to look out for her interests, ask the questions that need asking, and help ensure the proposal is sincere.",
        ],
      },
      {
        heading: "Guardianship, not compulsion",
        paragraphs: [
          "A wali may not force a marriage. The Prophet ﷺ taught that a woman's permission must be sought before she is married (al-Bukhari). Her consent is essential, and a good wali works with her, not over her.",
          "That is why NikahPath requires both the recipient's own acceptance and, where applicable, her wali's approval before a connection is approved.",
        ],
      },
      {
        heading: "Family involvement for everyone",
        paragraphs: [
          "Men also benefit greatly from involving their families. A parent or trusted elder can offer perspective and help keep the process honest.",
          "Seekers who enable parental vetting have every outgoing request reviewed by their linked guardian first.",
        ],
      },
    ],
    quiz: [
      {
        question: "What is the core purpose of the wali?",
        options: [
          "To choose a spouse without consulting her",
          "To protect and advocate for her interests in the marriage process",
          "To negotiate the largest possible mahr",
          "To replace the need for her consent",
        ],
      },
      {
        question: "May a wali compel a woman to marry someone she does not accept?",
        options: [
          "Yes, the wali's decision is final",
          "Only if the suitor is wealthy",
          "No, her permission must be sought and her consent is essential",
          "Only after the engagement",
        ],
      },
      {
        question: "On NikahPath, what happens when a seeker has parental vetting enabled?",
        options: [
          "Their outgoing requests are reviewed by their linked guardian first",
          "Their profile becomes public",
          "They can have unlimited chats",
          "Photos are revealed automatically",
        ],
      },
    ],
  },
  {
    id: "finance",
    title: "Financial Responsibilities",
    description: "A practical guide to mahr, maintenance, and honest conversations about money.",
    durationMinutes: 20,
    required: false,
    sections: [
      {
        heading: "The mahr",
        paragraphs: [
          "Allah commands: “And give the women their mahr as a free gift” (Surah an-Nisa, 4:4). The mahr is a gift from the husband that belongs to the wife alone.",
          "It can be modest. The Prophet ﷺ encouraged ease in marriage, and a mahr should be agreed openly and honestly rather than competitively.",
        ],
      },
      {
        heading: "Maintenance (nafaqah)",
        paragraphs: [
          "A husband is responsible for providing for his wife and household: housing, food, clothing, and reasonable needs (Surah an-Nisa, 4:34).",
          "A wife's own wealth and earnings remain hers. Anything she chooses to contribute is a kindness, not an obligation.",
        ],
      },
      {
        heading: "Talk about money before marriage",
        paragraphs: [
          "Discuss debts, savings, spending habits, supporting parents, and whether either of you has interest-bearing (riba) loans and how you plan to address them.",
          "Agree on a realistic wedding budget. Starting married life in debt for one day's celebration places an unnecessary burden on a new family.",
        ],
      },
    ],
    quiz: [
      {
        question: "Who owns the mahr once it is given?",
        options: ["The wali", "The husband's family", "The wife", "It is shared equally"],
      },
      {
        question: "Who carries the obligation of household maintenance (nafaqah)?",
        options: [
          "The wife",
          "The husband",
          "The wali",
          "Whoever earns more",
        ],
      },
      {
        question: "Which approach to wedding spending best reflects the guidance in this module?",
        options: [
          "Borrow as much as needed for an impressive event",
          "Let the families compete on cost",
          "Avoid discussing money until after the nikah",
          "Agree a realistic budget and prioritise ease over extravagance",
        ],
      },
    ],
  },
];

export const REQUIRED_MODULE_IDS: readonly ReadinessModuleId[] = READINESS_MODULES.filter((m) => m.required).map(
  (m) => m.id,
);

export function findModule(id: string): ReadinessModule | undefined {
  return READINESS_MODULES.find((m) => m.id === id);
}

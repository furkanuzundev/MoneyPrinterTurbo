export interface UseCase {
  slug: string;
  title: string;
  h1: string;
  intro: string;
  bullets: [string, string, string];
  exampleTopics: [string, string, string];
}

export const USE_CASES: UseCase[] = [
  {
    slug: "ai-tiktok-video-generator",
    title: "AI TikTok Video Generator",
    h1: "Post to TikTok without filming a single clip",
    intro:
      "Type the topic your audience is searching for and Reelate writes the script, adds a voiceover, and cuts matching stock footage. You get a captioned, TikTok-ready MP4 in about five minutes.",
    bullets: [
      "Vertical 720p output sized for TikTok's feed from the first render",
      "Captions burned in so videos autoplay-mute correctly",
      "Fresh script every run — no two exports read the same",
    ],
    exampleTopics: [
      "3 things nobody tells you about cold plunges",
      "why your coffee order says more than you think",
      "the psychology trick behind viral sounds",
    ],
  },
  {
    slug: "faceless-youtube-shorts-maker",
    title: "Faceless YouTube Shorts Maker",
    h1: "Grow a YouTube Shorts channel without showing your face",
    intro:
      "Reelate turns a one-line idea into a fully voiced short with stock b-roll and captions — no camera, no on-screen talent, no editing timeline required.",
    bullets: [
      "AI voiceover replaces the need for a presenter or mic setup",
      "Stock footage library covers common Shorts niches out of the box",
      "Export straight to the aspect ratio and length YouTube Shorts rewards",
    ],
    exampleTopics: [
      "the fastest way to learn a new skill in 2026",
      "a myth about sleep everyone still believes",
      "what changed when phones got cameras",
    ],
  },
  {
    slug: "instagram-reels-generator",
    title: "Instagram Reels Generator",
    h1: "Turn one sentence into a Reel your audience taps through",
    intro:
      "Instagram rewards consistent posting, and Reelate keeps the pipeline moving: describe a topic, get a scripted, voiced, captioned Reel ready to upload the same day.",
    bullets: [
      "Caption styling built for Reels' sound-off scroll behavior",
      "Script pacing tuned for 30–60 second retention",
      "Download an MP4 you can post directly, no re-encoding needed",
    ],
    exampleTopics: [
      "an underrated feature your phone already has",
      "how restaurants pick their menu prices",
      "a two-minute stretch that fixes desk posture",
    ],
  },
  {
    slug: "ai-video-from-text",
    title: "AI Video From Text",
    h1: "Turn a paragraph of text into a finished video",
    intro:
      "Paste or type what you want to say and Reelate handles the rest — script refinement, voiceover, footage selection, and caption placement — so text becomes video without a production step in between.",
    bullets: [
      "Works from a rough topic or a fully written script",
      "No video editing software or timeline to learn",
      "Consistent turnaround regardless of topic complexity",
    ],
    exampleTopics: [
      "explain compound interest in plain English",
      "the difference between weather and climate",
      "how noise-cancelling headphones actually work",
    ],
  },
  {
    slug: "motivational-video-maker",
    title: "Motivational Video Maker",
    h1: "Ship a motivational short before your morning coffee cools",
    intro:
      "Motivational content lives or dies on tone — Reelate pairs a punchy, encouraging script with a steady voiceover and momentum-matched footage, no stock-photo cliches required.",
    bullets: [
      "Script tone built for short, quotable lines that land on camera",
      "Voiceover pacing suited to build-and-release motivational structure",
      "New footage each render keeps a daily posting habit from feeling repetitive",
    ],
    exampleTopics: [
      "why discipline beats motivation most days",
      "the 5-minute rule for starting hard tasks",
      "what separates people who finish from people who start",
    ],
  },
  {
    slug: "educational-shorts-generator",
    title: "Educational Shorts Generator",
    h1: "Explain anything in under a minute",
    intro:
      "Reelate is built for the explainer format: give it a concept, and it writes a clear, accurate script, narrates it, and pairs each line with footage that actually illustrates the point.",
    bullets: [
      "Script structure favors one clear idea per short, not a wall of facts",
      "Voiceover clarity tuned for information-dense topics",
      "Good for recurring series — same format, new topic each time",
    ],
    exampleTopics: [
      "why the sky isn't actually blue at sunset",
      "how vaccines teach your immune system",
      "the real reason leap years exist",
    ],
  },
  {
    slug: "product-promo-video-maker",
    title: "Product Promo Video Maker",
    h1: "Turn a product description into a promo clip",
    intro:
      "Describe what you're selling and who it's for, and Reelate writes a benefit-led script, voices it, and matches footage to each selling point — a promo short without a shoot day.",
    bullets: [
      "Script leads with the customer benefit, not a feature list",
      "Footage selection matches the product category you describe",
      "Fast enough to make a fresh promo for every launch or sale",
    ],
    exampleTopics: [
      "a skincare routine in under 60 seconds",
      "why this planner survives a busy semester",
      "unboxing the small detail customers notice first",
    ],
  },
  {
    slug: "real-estate-short-video",
    title: "Real Estate Short Video Maker",
    h1: "Turn a listing into a scroll-stopping walkthrough",
    intro:
      "Skip the videographer for every listing — describe the property and Reelate writes a script that highlights the layout and neighborhood, voices it, and pairs it with matching footage for a tour-style short.",
    bullets: [
      "Script structure walks buyers room-by-room instead of listing specs",
      "Footage matched to property type — condo, family home, or land",
      "Fast enough to post a new listing the same day it goes live",
    ],
    exampleTopics: [
      "3 questions to ask before your first open house",
      "what a walkable neighborhood score actually means",
      "the difference between a fixer-upper and a money pit",
    ],
  },
  {
    slug: "fitness-content-generator",
    title: "Fitness Content Generator",
    h1: "Post fitness content without a ring light or a gym bag",
    intro:
      "Reelate scripts and voices fitness tips and workout breakdowns, matching each cue to relevant footage — a way to keep a fitness account active between actual training days.",
    bullets: [
      "Script cadence built for cue-by-cue workout explanations",
      "Footage library covers common training and recovery topics",
      "Consistent output lets you batch a week of posts in one sitting",
    ],
    exampleTopics: [
      "why your warm-up matters more than your workout",
      "the truth about spot reduction",
      "how much protein you actually need per day",
    ],
  },
  {
    slug: "finance-tips-video-maker",
    title: "Finance Tips Video Maker",
    h1: "Turn a money tip into a clear, compliance-friendly short",
    intro:
      "Personal finance content needs to be accurate and careful — Reelate writes plain-language scripts around general concepts, not specific advice, then voices and captions them for a fast, repeatable posting format.",
    bullets: [
      "Script language stays educational and general, not prescriptive",
      "Clear captioning helps numbers and terms land on a silent scroll",
      "Good for a recurring weekly-tip format without a scriptwriter",
    ],
    exampleTopics: [
      "what an emergency fund is actually for",
      "the difference between a Roth and a traditional account",
      "why net worth matters more than salary",
    ],
  },
  {
    slug: "travel-shorts-generator",
    title: "Travel Shorts Generator",
    h1: "Post travel inspiration between actual trips",
    intro:
      "You don't need footage from every destination — Reelate writes a script around a place or travel tip, voices it, and matches it with footage so your account stays active even when you're not on the road.",
    bullets: [
      "Footage matched to destination type — city, coast, or countryside",
      "Script format works for both destination guides and travel tips",
      "Keeps a travel account posting on weeks you're not traveling",
    ],
    exampleTopics: [
      "the best time of year to visit Lisbon",
      "a packing mistake every first-time backpacker makes",
      "how to find flights before prices spike",
    ],
  },
  {
    slug: "ai-voiceover-video-maker",
    title: "AI Voiceover Video Maker",
    h1: "Give any script a clean, natural voiceover",
    intro:
      "If the script is the hard part you've already solved, Reelate handles the rest — natural AI narration, matched footage, and burned-in captions turn a written script into a finished short.",
    bullets: [
      "Natural-sounding narration without booking a voice actor",
      "Footage and captions generated automatically around your words",
      "Same fast turnaround whether the script is one line or a full outline",
    ],
    exampleTopics: [
      "narrate a client testimonial into a shareable clip",
      "turn meeting notes into a quick recap video",
      "voice a script you already wrote for a course",
    ],
  },
  {
    slug: "history-facts-video-generator",
    title: "History Facts Video Generator",
    h1: "Bring a piece of history to life in under a minute",
    intro:
      "Historical facts stand out when they're specific — Reelate writes a script around a real event or figure, narrates it, and pairs it with footage that sets the scene instead of generic filler.",
    bullets: [
      "Script format favors one surprising fact told well over a timeline dump",
      "Voiceover pacing suited to storytelling rather than a lecture",
      "Good for a recurring 'today in history' style series",
    ],
    exampleTopics: [
      "the shipwreck found 100 years after it sank",
      "how a typo once nearly started a war",
      "the invention that was banned before it was praised",
    ],
  },
  {
    slug: "recipe-shorts-maker",
    title: "Recipe Shorts Maker",
    h1: "Turn a recipe into a step-by-step short",
    intro:
      "List the ingredients and steps, and Reelate writes a script that walks through the recipe, voices it, and pairs each step with matching footage — no filming your own kitchen required.",
    bullets: [
      "Script structure follows real recipe steps, not a vague overview",
      "Footage matched to ingredients and cooking method described",
      "Fast enough to post a new recipe short every day of the week",
    ],
    exampleTopics: [
      "a 15-minute pasta recipe with 5 ingredients",
      "the trick to crispy roasted vegetables every time",
      "a one-bowl dessert with no mixer needed",
    ],
  },
];

export function getUseCase(slug: string): UseCase | undefined {
  return USE_CASES.find((useCase) => useCase.slug === slug);
}

/** Returns the next `count` use cases after `slug`, wrapping cyclically. */
export function getRelatedUseCases(slug: string, count = 4): UseCase[] {
  const index = USE_CASES.findIndex((useCase) => useCase.slug === slug);
  if (index === -1) return USE_CASES.slice(0, count);

  const related: UseCase[] = [];
  for (let i = 1; i <= count; i++) {
    related.push(USE_CASES[(index + i) % USE_CASES.length]);
  }
  return related;
}

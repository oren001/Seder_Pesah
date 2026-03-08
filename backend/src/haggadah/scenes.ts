import type { Scene } from '../../../shared-types';

export const scenes: Scene[] = [
    // Kadesh
    {
        id: 'scene-kadesh-1',
        sectionId: 'kadesh',
        promptTemplate: 'Biblical epic comic style illustration: A joyful family at a beautifully decorated Passover Seder table, golden candlelight, {participant_count} people raising ornate wine cups in a toast, warm golden light, parchment textures, family friendly',
        style: 'biblical epic comic, bright warm colors, parchment textures, family friendly',
        participantSlots: 4,
    },
    // Karpas
    {
        id: 'scene-karpas-1',
        sectionId: 'karpas',
        promptTemplate: 'Biblical epic comic style: People dipping green vegetables into bowls of salt water at a Passover table, ancient Egyptian setting in the background, bittersweet atmosphere, bright colors',
        style: 'biblical epic comic, bright colors, family friendly',
        participantSlots: 3,
    },
    // Yachatz
    {
        id: 'scene-yachatz-1',
        sectionId: 'yachatz',
        promptTemplate: 'Biblical epic comic style: A wise elder breaking matzah bread ceremonially at a Seder table, children watching with excitement, the hidden Afikomen wrapped in a cloth, bright warm light',
        style: 'biblical epic comic, warm golden tones, family friendly',
        participantSlots: 2,
    },
    // Ha Lachma
    {
        id: 'scene-halochem-1',
        sectionId: 'maggid-intro',
        promptTemplate: 'Biblical epic comic style: Ancient Israelites sharing bread with strangers at the gates of Egypt, welcoming gesture, simple linen clothing, bright sky, hopeful atmosphere',
        style: 'biblical epic comic, desert colors, family friendly',
        participantSlots: 4,
    },
    // Mah Nishtanah
    {
        id: 'scene-mahnishtana-1',
        sectionId: 'mah-nishtana',
        promptTemplate: 'Biblical epic comic style: An adorable child standing up at the Seder table asking questions, the whole family listening attentively and smiling, warm candlelight, Hebrew books on table',
        style: 'biblical epic comic, warm and playful, family friendly',
        participantSlots: 2,
    },
    // Slavery in Egypt
    {
        id: 'scene-slavery-1',
        sectionId: 'avadim',
        promptTemplate: 'Biblical epic comic style: Ancient Israelite slaves building the great pyramids of Egypt under the hot sun, dramatic golden sky, muscular figures carrying stone blocks, Pharaoh overlooking from above',
        style: 'biblical epic comic, dramatic desert colors, family friendly',
        participantSlots: 4,
    },
    {
        id: 'scene-slavery-2',
        sectionId: 'avadim',
        promptTemplate: 'Biblical epic comic style: Moses standing before the burning bush on Mount Sinai, divine light, sandals off, face in awe, detailed biblical landscape, dramatic sky',
        style: 'biblical epic comic, divine light, family friendly',
        participantSlots: 1,
    },
    // Four Sons
    {
        id: 'scene-foursons-1',
        sectionId: 'four-sons',
        promptTemplate: 'Biblical epic comic style: Four distinct siblings at the Seder table - one reading attentively (wise), one looking defiant (wicked), one looking simple and curious (simple), one small child who cannot speak (young), comic style, bright colors',
        style: 'biblical epic comic, character-driven, family friendly',
        participantSlots: 4,
    },
    // Ten Plagues
    {
        id: 'scene-plagues-1',
        sectionId: 'ten-plagues',
        promptTemplate: 'Biblical epic comic style: The Nile River turning blood red in ancient Egypt, terrified Egyptians and Pharaoh watching in disbelief, dramatic sky, vivid red water, Moses staff raised',
        style: 'biblical epic comic, dramatic, family friendly',
        participantSlots: 2,
    },
    {
        id: 'scene-plagues-2',
        sectionId: 'ten-plagues',
        promptTemplate: 'Biblical epic comic style humorous scene: Hordes of cartoon frogs leaping everywhere in ancient Egypt, Egyptians running amok, frogs on the throne, in beds, jumping out of pots, bright chaotic cartoon energy',
        style: 'biblical epic comic, humorous cartoon, family friendly',
        participantSlots: 3,
    },
    // Dayenu
    {
        id: 'scene-dayenu-1',
        sectionId: 'dayenu',
        promptTemplate: 'Biblical epic comic style meme: Joyful group of ancient Israelites celebrating in the desert, arms raised in celebration, the text DAYENU! above them in golden letters, confetti, bright warm sky',
        style: 'biblical epic comic, celebratory meme style, bright colors, family friendly',
        participantSlots: 5,
    },
    // Pesach/Matzah/Maror
    {
        id: 'scene-pmmm-1',
        sectionId: 'pesach-matzah-maror',
        promptTemplate: 'Biblical epic comic close-up scene: Beautifully illustrated Seder plate with Passover lamb, matzah, bitter herbs (maror), charoset, and karpas, golden light, top-down view, ornate plate, ancient Egyptian motifs border',
        style: 'biblical epic comic, detailed food illustration, family friendly',
        participantSlots: 0,
    },
    // The Meal
    {
        id: 'scene-meal-1',
        sectionId: 'shulchan-orech',
        promptTemplate: 'Biblical epic comic style: A joyful, chaotic extended family Seder meal, people laughing, passing dishes, children reaching for food, warm golden candlelight, overflowing table of traditional Passover foods',
        style: 'biblical epic comic, warm and joyful, family friendly',
        participantSlots: 6,
    },
    // Tzafun / Afikomen
    {
        id: 'scene-tzafun-1',
        sectionId: 'tzafun',
        promptTemplate: 'Biblical epic comic style: Excited children searching for the hidden Afikomen matzah around the house, looking under cushions, behind curtains, one child triumphantly holding it up while grandmother pretends to be surprised',
        style: 'biblical epic comic, playful and joyful, family friendly',
        participantSlots: 3,
    },
    // Elijah
    {
        id: 'scene-elijah-1',
        sectionId: 'elijah',
        promptTemplate: 'Biblical epic comic style mystical scene: The prophet Elijah as a glowing figure appearing at the open front door of a family Seder, the family watching in awe, his cup of wine magically swirling, starlit night behind him',
        style: 'biblical epic comic, mystical glowing light, family friendly',
        participantSlots: 3,
    },
    // Hallel / Crossing the Red Sea
    {
        id: 'scene-hallel-1',
        sectionId: 'hallel-part1',
        promptTemplate: 'Biblical epic comic style magnificent scene: The Israelites in joyful song and dance, Miriam playing her tambourine, colorful robes, musical instruments, golden sky, celebrating their freedom from Egypt',
        style: 'biblical epic comic, celebration and music, bright colors, family friendly',
        participantSlots: 5,
    },
    {
        id: 'scene-redsea-1',
        sectionId: 'hallel-song',
        promptTemplate: 'Biblical epic comic style epic scene: The parting of the Red Sea — towering walls of deep blue water on either side, the Israelites walking through on dry land, Moses arms raised, dramatic divine light from above',
        style: 'biblical epic comic, epic and dramatic, bright colors, family friendly',
        participantSlots: 6,
    },
    // Nirtzah
    {
        id: 'scene-nirtzah-1',
        sectionId: 'nirtzah',
        promptTemplate: 'Biblical epic comic style inspiring scene: Israelites arriving and celebrating at the gates of Jerusalem, the holy city glowing golden, "Next Year in Jerusalem!" in golden text, hopeful and triumphant atmosphere',
        style: 'biblical epic comic, triumphant and hopeful, golden tones, family friendly',
        participantSlots: 4,
    },
    // Chad Gadya
    {
        id: 'scene-chadgadya-1',
        sectionId: 'chad-gadya',
        promptTemplate: 'Biblical epic comic style chaotic hilarious scene: A tiny goat causing a chain reaction of chaos — a cat chasing the goat, a dog chasing the cat, a stick hitting the dog, and so on, comic strip panels style, bright cartoon colors, family friendly',
        style: 'biblical epic comic, chaotic cartoon humor, bright colors, family friendly',
        participantSlots: 2,
    },
    // Lobby Hero Images
    {
        id: 'scene-lobby-redsea',
        sectionId: 'maggid-intro',
        promptTemplate: 'Biblical epic comic style: Person walking confidently through the parted Red Sea, massive walls of turquoise water on either side, golden sunlight, sandals and ancient robes, dramatic and awe-inspiring',
        style: 'biblical epic comic, epic hero scene, family friendly',
        participantSlots: 1,
    },
    {
        id: 'scene-lobby-pyramids',
        sectionId: 'avadim',
        promptTemplate: 'Biblical epic comic style: Person standing heroically in front of the great pyramids of Egypt at sunset, dramatic orange and gold sky, ancient Egyptian motifs, adventurous pose',
        style: 'biblical epic comic, hero portrait, warm desert tones, family friendly',
        participantSlots: 1,
    },
    {
        id: 'scene-lobby-staff',
        sectionId: 'avadim',
        promptTemplate: 'Biblical epic comic style: Person holding Moses\' magical staff aloft on a rocky mountaintop, divine golden light emanating from the staff, dramatic storm clouds parting, heroic stance',
        style: 'biblical epic comic, divine hero, dramatic light, family friendly',
        participantSlots: 1,
    },
    {
        id: 'scene-lobby-leaving',
        sectionId: 'nirtzah',
        promptTemplate: 'Biblical epic comic style: Person leading a joyful crowd leaving Egypt, carrying bundles, the desert ahead, freedom and hope in the air, golden horizon, colorful robes, joyful faces',
        style: 'biblical epic comic, freedom journey, warm colors, family friendly',
        participantSlots: 1,
    },
];

export const lobbySceneIds = [
    'scene-lobby-redsea',
    'scene-lobby-pyramids',
    'scene-lobby-staff',
    'scene-lobby-leaving',
];

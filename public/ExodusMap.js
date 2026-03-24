/**
 * ExodusMap.js
 * Visual progress component for the Pesach Haggadah
 */

const SEDER_STAGES = [
    { id: 'kadesh', name: 'קַדֵּשׁ', icon: '🍷', label: 'Kadesh' },
    { id: 'urchatz', name: 'וּרְחַץ', icon: '💧', label: 'Urchatz' },
    { id: 'karpas', name: 'כַּרְפַּס', icon: '🌿', label: 'Karpas' },
    { id: 'yachatz', name: 'יַחַץ', icon: '🥨', label: 'Yachatz' },
    { id: 'magid', name: 'מַגִּיד', icon: '📜', label: 'Magid' },
    { id: 'rachtzah', name: 'רָחְצָה', icon: '🧼', label: 'Rachtzah' },
    { id: 'motzi-matzah', name: 'מוֹצִיא מַצָּה', icon: '🥯', label: 'Motzi Matzah' },
    { id: 'maror', name: 'מָרוֹר', icon: '🥗', label: 'Maror' },
    { id: 'korech', name: 'כּוֹרֵךְ', icon: '🥪', label: 'Korech' },
    { id: 'shulchan-orech', name: 'שֻׁלְחָן עֹרֶךְ', icon: '🥘', label: 'Shulchan Orech' },
    { id: 'tzafun', name: 'צָפוּן', icon: '🧭', label: 'Tzafun' },
    { id: 'barech', name: 'בָּרֵךְ', icon: '🍷', label: 'Barech' },
    { id: 'hallel', name: 'הַלֵּל', icon: '🎵', label: 'Hallel' },
    { id: 'nirtzah', name: 'נִרְצָה', icon: '✨', label: 'Nirtzah' }
];

class ExodusMap {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentStageIndex = 0;
        this.render();
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="exodus-map-journey">
                <div class="map-path"></div>
                ${SEDER_STAGES.map((stage, index) => `
                    <div class="map-stop ${index <= this.currentStageIndex ? 'active' : ''} ${index === this.currentStageIndex ? 'current' : ''}" 
                         data-stage="${stage.id}" 
                         style="--index: ${index}">
                        <div class="stop-icon">${stage.icon}</div>
                        <div class="stop-name">${stage.name}</div>
                    </div>
                `).join('')}
                <div class="map-marker" style="--progress: ${this.currentStageIndex}">
                    <div class="marker-pointer">🐪</div>
                </div>
            </div>
        `;
    }

    updateProgress(pageIndex, totalPages) {
        // Find which stage we are in based on page title or index
        // This logic will be integrated with the app's current page state
        const stageIndex = this.calculateStageFromPage(pageIndex);
        if (stageIndex !== this.currentStageIndex) {
            this.currentStageIndex = stageIndex;
            this.render();
        }
    }

    calculateStageFromPage(pageIndex) {
        // Direct page-index → stage-index map (based on haggadah_data.js page titles)
        // 0:Intro(Kadesh) 1:Urchatz 2:Karpas 3:Yachatz 4-12:Magid 13:Rachtzah
        // 14:Maror 15:Korech 16:ShulchanOrech 17:Tzafun 18-22:Barech 23-25:Hallel 26-31:Nirtzah
        const PAGE_TO_STAGE = [
            0,  // 0  הקדמה (Kadesh)
            1,  // 1  וּרְחַץ
            2,  // 2  כַּרְפַּס
            3,  // 3  יַחַץ
            4,  // 4  מַגִּיד (א)
            4,  // 5  מַגִּיד (ב)
            4,  // 6  מַגִּיד (ג)
            4,  // 7  מַגִּיד (ד)
            4,  // 8  מַגִּיד (ה)
            4,  // 9  מַגִּיד (ו)
            4,  // 10 מַגִּיד (ז)
            4,  // 11 מַגִּיד (ח)
            4,  // 12 מַגִּיד (ט)
            5,  // 13 רָחְצָה (includes מוֹצִיא מַצָּה)
            7,  // 14 מָרוֹר
            8,  // 15 כּוֹרֵךְ
            9,  // 16 שֻׁלְחָן עוֹרֵךְ  ← meal
            10, // 17 צָפוּן
            11, // 18 בָּרֵךְ (א)
            11, // 19 בָּרֵךְ (ב)
            11, // 20 בָּרֵךְ (ג)
            11, // 21 בָּרֵךְ (ד)
            11, // 22 בָּרֵךְ (ה)
            12, // 23 הַלֵּל (א)
            12, // 24 הַלֵּל (ב)
            12, // 25 הַלֵּל (ג)
            13, // 26 נִרְצָה (א)
            13, // 27 נִרְצָה (ב)
            13, // 28 נִרְצָה (ג)
            13, // 29 נִרְצָה (ד)
            13, // 30 נִרְצָה (ה)
            13, // 31 נִרְצָה (ו)
        ];
        if (pageIndex >= 0 && pageIndex < PAGE_TO_STAGE.length) {
            return PAGE_TO_STAGE[pageIndex];
        }
        return this.currentStageIndex;
    }
}

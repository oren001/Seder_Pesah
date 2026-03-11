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
        if (!window.HAGGADAH || !window.HAGGADAH[pageIndex]) return this.currentStageIndex;
        
        const pageTitle = window.HAGGADAH[pageIndex].title.toLowerCase();
        
        // Find the matching stage index
        // We look for partial matches in the stage IDs or names
        const stageIndex = SEDER_STAGES.findIndex(s => {
            const stageName = s.name.replace(/[ְִֵֶַָֹֻּֿ]/g, ''); // Remove Hebrew vowels for easier matching
            const simpleTitle = pageTitle.replace(/[ְִֵֶַָֹֻּֿ]/g, '');
            return simpleTitle.includes(stageName.toLowerCase()) || 
                   pageTitle.includes(s.label.toLowerCase()) ||
                   pageTitle.includes(s.id.replace('-', ' '));
        });

        if (stageIndex !== -1) return stageIndex;

        // Fallback: If we are in "Magid" (which is long), stay there until the next stop
        if (pageIndex > 4 && this.currentStageIndex === 4) {
            // Check if we hit Rachtzah yet
            const rachtzahIdx = SEDER_STAGES.findIndex(s => s.id === 'rachtzah');
            if (pageIndex < HAGGADAH.findIndex(p => p.title.includes('רחצה'))) {
                return 4; // Still in Magid
            }
        }

        return this.currentStageIndex;
    }
}

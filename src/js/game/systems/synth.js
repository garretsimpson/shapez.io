import * as Tone from "tone";
import { createLogger } from "../../core/logging";
import { GameSystem } from "../game_system";

const logger = createLogger("synth");

export class SynthSystem extends GameSystem {
    constructor(root) {
        super(root);

        this.synths = {};
    }

    /**
     * Get UID and value from each display
     */
    getDisplayValues() {
        let result = {};
        const entities = this.root.systemMgr.systems.display.getDrawnEntities();

        for (let entity of entities) {
            let shape = "";
            const pinsComp = entity.components.WiredPins;
            const network = pinsComp.slots[0].linkedNetwork;
            if (network && network.hasValue()) {
                const value = network.currentValue;
                if (value.getItemType() === "shape") {
                    shape = value.getAsCopyableKey();
                }
            }
            result[entity.uid] = shape;
        }

        return result;
    }

    play() {
        const synths = this.synths;
        const displayInfo = this.getDisplayValues();

        // Create and delete synths as needed
        for (let uid of Object.keys(synths)) {
            if (displayInfo[uid] == undefined) {
                logger.debug("Delete synth:", uid);
                synths[uid].dispose();
                delete synths[uid];
            }
        }
        for (let uid of Object.keys(displayInfo)) {
            if (synths[uid] == undefined) {
                logger.debug("Create synth:", uid);
                synths[uid] = new ShapezSynth(uid);
            }
        }

        // Update synth values
        for (let uid of Object.keys(synths)) {
            assert(
                synths[uid] != undefined && displayInfo[uid] != undefined,
                "synths not in sync with displays"
            );
            synths[uid].update(displayInfo[uid]);
        }
    }
}

class ShapezSynth {
    constructor(uid) {
        this.uid = uid;
        this.synth = new Tone.Synth().toDestination();
        this.shape = "";
    }

    /**
     * Parse the shape and return note value
     * @param {String} shape
     * @returns {String}
     */
    getNoteFromShape(shape) {
        const OCTIVE_STR = "CRSW";
        const TONE_STR = "rygcbpw";
        const ADJ_STR = "CRS";
        const TONES = "CDEFGAB";
        const ADJS = ["b", "", "#"];

        if (!shape) return;
        if (shape.length < 4) return;
        const octiveIndex = OCTIVE_STR.indexOf(shape[0]);
        const toneIndex = TONE_STR.indexOf(shape[1]);
        const adjIndex = ADJ_STR.indexOf(shape[2]);
        const note = TONES[toneIndex] + ADJS[adjIndex] + (octiveIndex + 3);

        return note;
    }

    update(value) {
        if (this.shape == value) return;

        this.shape = value;
        this.synth.triggerRelease();
        const note = this.getNoteFromShape(this.shape);
        logger.debug(note);
        if (note == "") return; // release
        this.synth.triggerAttack(note);
    }

    dispose() {
        this.synth.dispose();
    }
}

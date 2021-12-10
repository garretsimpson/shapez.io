import * as Tone from "tone";
import { createLogger } from "../../core/logging";
import { GameSystem } from "../game_system";

const logger = createLogger("synth");

export class SynthSystem extends GameSystem {
    constructor(root) {
        super(root);

        this.displays = "";

        this.synth = new Tone.Synth().toDestination();
    }

    play() {
        const root = this.root;
        const synth = this.synth;
        const entities = root.systemMgr.systems.display.getDrawnEntities();

        let displays = "";
        for (let entity of entities) {
            let value = "none";
            const pinsComp = entity.components.WiredPins;
            const network = pinsComp.slots[0].linkedNetwork;
            if (network && network.hasValue()) {
                const currentValue = network.currentValue;
                if (currentValue.getItemType() === "shape") {
                    value = currentValue.getAsCopyableKey();
                }
            }

            const display = entity.uid + ": " + value + " ";
            displays += display;
        }
        if (this.displays != displays) {
            this.displays = displays;
            logger.debug(displays);
            synth.triggerAttackRelease("C4", "8n");
        }
    }
}

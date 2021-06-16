import { globalConfig } from "../core/config";
import { DrawParameters } from "../core/draw_parameters";
import { findNiceIntegerValue } from "../core/utils";
import { Vector } from "../core/vector";
import { Entity } from "./entity";
import { ACHIEVEMENTS } from "../platform/achievement_provider";
import { GameRoot } from "./root";
import { SerializerInternal } from "../savegame/serializer_internal";
import { createLogger } from "../core/logging";

const logger = createLogger("blueprint");

export class Blueprint {
    /**
     * @param {Array<Entity>} entities
     */
    constructor(entities) {
        this.entities = entities;
    }

    /**
     * Returns the layer of this blueprint
     * @returns {Layer}
     */
    get layer() {
        if (this.entities.length === 0) {
            return "regular";
        }
        return this.entities[0].layer;
    }

    /**
     * Serialize
     */
    serialize() {
        let data = new SerializerInternal().serializeEntityArray(this.entities);
        // Remove unneeded fields
        for (let i = 0; i < data.length; ++i) {
            const entry = data[i];
            delete entry.uid;
            delete entry.components.WiredPins;
        }
        return data;
    }

    /**
     * Serialize as a grid of text
     */
    serializeAsGrid() {
        const data = new SerializerInternal().serializeEntityArray(this.entities);
        const origins = data.map(e => e.components.StaticMapEntity.origin);
        const minX = Math.min(...origins.map(v => v.x));
        const maxX = Math.max(...origins.map(v => v.x));
        const minY = Math.min(...origins.map(v => v.y));
        const maxY = Math.max(...origins.map(v => v.y));
        logger.debug("Range:", minX, maxX, minY, maxY);

        // TODO: This data belongs in the module that defines the component codes.
        const map = {
            27: ["│ ", "──", "│ ", "──"], // line
            28: ["┌─", "┐ ", "┘ ", "└─"], // corner
            29: ["┬─", "┤ ", "┴─", "├─"], // tee
            30: ["┼─", "┼─", "┼─", "┼─"], // cross
            31: ["@^", "@>", "@v", "@<"],
            32: ["A^", "A>", "Av", "A<"],
            34: ["N^", "N>", "Nv", "N<"],
            35: ["X^", "X>", "Xv", "X<"],
            36: ["O^", "O>", "Ov", "O<"],
            38: ["d^", "d>", "dv", "d<"],
            39: ["##", "##", "##", "##"],
            42: ["C^", "C>", "Cv", "C<"],
            43: ["Z^", "Z>", "Zv", "Z<"],
            44: ["R^", "R>", "Rv", "R<"],
            45: ["U^", "U>", "Uv", "U<"],
            46: ["E^", "E>", "Ev", "E<"],
            50: ["S^", "S>", "Sv", "S<"],
            51: ["P^", "P>", "Pv", "P<"],
            52: ["║ ", "══", "║ ", "══"],
            53: ["╔═", "╗ ", "╝ ", "╚═"],
            54: ["╦═", "╣ ", "╩═", "╠═"],
            55: ["╬═", "╬═", "╬═", "╬═"],
            60: ["b^", "b>", "bv", "b<"],
        };

        // Initiailize the grid
        let grid = [];
        for (let y = minY; y <= maxY; y++) {
            grid[y - minY] = [];
            for (let x = minX; x <= maxX; x++) {
                grid[y - minY][x - minX] = "  ";
            }
        }

        // Add the elements
        for (let i = 0; i < data.length; ++i) {
            const e = data[i].components.StaticMapEntity;
            const x = e.origin.x - minX;
            const y = e.origin.y - minY;
            const code = e.code;
            const rot = e.rotation;
            const val = map[code][rot / 90] || "??";
            // logger.debug("Values:", x, y, code, rot, val);
            grid[y][x] = val;
        }
        logger.debug("\n" + grid.map(a => a.join("")).join("\n"));

        // Get the constants
        let cvals = [];
        for (let i = 0; i < data.length; ++i) {
            const c = data[i].components.ConstantSignal;
            if (!c) continue;
            const e = data[i].components.StaticMapEntity;
            const x = e.origin.x - minX;
            const y = e.origin.y - minY;
            const val = "@[" + x + "," + y + "]=" + c.signal.data;
            cvals.push(val);
        }
        logger.debug("\n" + cvals.join("\n"));
        return grid;
    }

    /**
     * Deserialize
     * @param {GameRoot} root
     * @param {Object} json
     * @retruns {Blueprint|void}
     */
    static deserialize(root, json) {
        try {
            if (typeof json != "object") {
                return;
            }
            if (!Array.isArray(json)) {
                return;
            }

            const serializer = new SerializerInternal();
            /** @type {Array<Entity>} */
            const entityArray = [];
            for (let i = 0; i < json.length; ++i) {
                /** @type {Entity?} */
                const value = json[i];
                if (value.components == undefined || value.components.StaticMapEntity == undefined) {
                    return;
                }
                const staticData = value.components.StaticMapEntity;
                if (staticData.code == undefined || staticData.origin == undefined) {
                    return;
                }
                const result = serializer.deserializeEntity(root, value);
                if (typeof result === "string") {
                    throw new Error(result);
                }
                entityArray.push(result);
            }
            return new Blueprint(entityArray);
        } catch (e) {
            logger.error("Invalid blueprint data:", e.message);
        }
    }

    /**
     * Creates a new blueprint from the given entity uids
     * @param {GameRoot} root
     * @param {Array<number>} uids
     */
    static fromUids(root, uids) {
        const newEntities = [];

        let averagePosition = new Vector();

        // First, create a copy
        for (let i = 0; i < uids.length; ++i) {
            const entity = root.entityMgr.findByUid(uids[i]);
            assert(entity, "Entity for blueprint not found:" + uids[i]);

            const clone = entity.clone();
            newEntities.push(clone);

            const pos = entity.components.StaticMapEntity.getTileSpaceBounds().getCenter();
            averagePosition.addInplace(pos);
        }

        averagePosition.divideScalarInplace(uids.length);
        const blueprintOrigin = averagePosition.subScalars(0.5, 0.5).floor();

        for (let i = 0; i < uids.length; ++i) {
            newEntities[i].components.StaticMapEntity.origin.subInplace(blueprintOrigin);
        }

        // Now, make sure the origin is 0,0
        return new Blueprint(newEntities);
    }

    /**
     * Returns the cost of this blueprint in shapes
     */
    getCost() {
        if (G_IS_DEV && globalConfig.debug.blueprintsNoCost) {
            return 0;
        }
        return findNiceIntegerValue(4 * Math.pow(this.entities.length, 1.1));
    }

    /**
     * Draws the blueprint at the given origin
     * @param {DrawParameters} parameters
     */
    draw(parameters, tile) {
        parameters.context.globalAlpha = 0.8;
        for (let i = 0; i < this.entities.length; ++i) {
            const entity = this.entities[i];
            const staticComp = entity.components.StaticMapEntity;
            const newPos = staticComp.origin.add(tile);

            const rect = staticComp.getTileSpaceBounds();
            rect.moveBy(tile.x, tile.y);

            if (!parameters.root.logic.checkCanPlaceEntity(entity, tile)) {
                parameters.context.globalAlpha = 0.3;
            } else {
                parameters.context.globalAlpha = 1;
            }

            staticComp.drawSpriteOnBoundsClipped(parameters, staticComp.getBlueprintSprite(), 0, newPos);
        }
        parameters.context.globalAlpha = 1;
    }

    /**
     * Rotates the blueprint clockwise
     */
    rotateCw() {
        for (let i = 0; i < this.entities.length; ++i) {
            const entity = this.entities[i];
            const staticComp = entity.components.StaticMapEntity;

            // Actually keeping this in as an easter egg to rotate the trash can
            // if (staticComp.getMetaBuilding().getIsRotateable()) {
            staticComp.rotation = (staticComp.rotation + 90) % 360;
            staticComp.originalRotation = (staticComp.originalRotation + 90) % 360;
            // }

            staticComp.origin = staticComp.origin.rotateFastMultipleOf90(90);
        }
    }

    /**
     * Rotates the blueprint counter clock wise
     */
    rotateCcw() {
        // Well ...
        for (let i = 0; i < 3; ++i) {
            this.rotateCw();
        }
    }

    /**
     * Checks if the blueprint can be placed at the given tile
     * @param {GameRoot} root
     * @param {Vector} tile
     */
    canPlace(root, tile) {
        let anyPlaceable = false;

        for (let i = 0; i < this.entities.length; ++i) {
            const entity = this.entities[i];
            if (root.logic.checkCanPlaceEntity(entity, tile)) {
                anyPlaceable = true;
            }
        }

        return anyPlaceable;
    }

    /**
     * @param {GameRoot} root
     */
    canAfford(root) {
        if (root.gameMode.getHasFreeCopyPaste()) {
            return true;
        }
        return root.hubGoals.getShapesStoredByKey(root.gameMode.getBlueprintShapeKey()) >= this.getCost();
    }

    /**
     * Attempts to place the blueprint at the given tile
     * @param {GameRoot} root
     * @param {Vector} tile
     */
    tryPlace(root, tile) {
        return root.logic.performBulkOperation(() => {
            return root.logic.performImmutableOperation(() => {
                let count = 0;
                for (let i = 0; i < this.entities.length; ++i) {
                    const entity = this.entities[i];
                    if (!root.logic.checkCanPlaceEntity(entity, tile)) {
                        continue;
                    }

                    const clone = entity.clone();
                    clone.components.StaticMapEntity.origin.addInplace(tile);
                    root.logic.freeEntityAreaBeforeBuild(clone);
                    root.map.placeStaticEntity(clone);
                    root.entityMgr.registerEntity(clone);
                    count++;
                }

                root.signals.bulkAchievementCheck.dispatch(
                    ACHIEVEMENTS.placeBlueprint,
                    count,
                    ACHIEVEMENTS.placeBp1000,
                    count
                );

                return count !== 0;
            });
        });
    }
}
